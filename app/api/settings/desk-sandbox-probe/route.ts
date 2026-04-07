import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskProviderCredentialKeys, isDeskProviderId } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import {
  extractOctadeskTicketList,
  safeTopKeys,
  ticketHasOctabspReferral,
} from "@/lib/integrations/octadesk-probe";
import { isSandboxPartnerTenant } from "@/lib/sandbox-partner";

type FetchOutcome = {
  request: string;
  httpStatus: number;
  ok: boolean;
  parseError?: string;
  responseIsArray?: boolean;
  rootKeys?: string[] | null;
  itemCount: number;
  firstItemKeys: string[];
  ctwaStructuredCount?: number;
  sampleChannel?: string | null;
};

async function fetchOctadeskJson(
  baseUrl: string,
  apiToken: string,
  pathAndQuery: string,
  requestLabel: string
): Promise<FetchOutcome | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${pathAndQuery}`, {
      method: "GET",
      headers: { "X-API-KEY": apiToken, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timeout);
    const msg =
      e instanceof Error && e.name === "AbortError" ? "Timeout ao chamar Octadesk" : "Erro de rede ao chamar Octadesk";
    return { error: msg };
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      request: requestLabel,
      httpStatus: res.status,
      ok: res.ok,
      parseError: text.slice(0, 200),
      itemCount: 0,
      firstItemKeys: [],
    };
  }

  const items = extractOctadeskTicketList(parsed);
  const first = items[0] as Record<string, unknown> | undefined;
  const rootKeys =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed as object).sort()
      : null;

  let ctwaStructuredCount: number | undefined;
  if (requestLabel.includes("/tickets")) {
    ctwaStructuredCount = 0;
    for (const t of items) {
      if (ticketHasOctabspReferral(t)) ctwaStructuredCount += 1;
    }
  }

  let sampleChannel: string | null | undefined;
  if (first && typeof first.channel === "string") {
    sampleChannel = first.channel;
  }

  return {
    request: requestLabel,
    httpStatus: res.status,
    ok: res.ok,
    responseIsArray: Array.isArray(parsed),
    rootKeys,
    itemCount: items.length,
    firstItemKeys: first ? safeTopKeys(first, 30) : [],
    ctwaStructuredCount,
    sampleChannel: sampleChannel ?? null,
  };
}

/**
 * POST /api/settings/desk-sandbox-probe
 * Body: { action: "listTickets", providerId?: "octadesk" }
 * Chama GET /tickets e GET /chat — a UI "Conversas" alinha com /chat; /tickets pode estar vazio.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sandbox-probe:${user.id}:${ip}`, 15, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const { data: partnerRow, error: partnerErr } = await supabaseUser
    .from("partners")
    .select("name, slug")
    .eq("id", partnerId)
    .single();

  if (partnerErr || !partnerRow) {
    logApiError("desk-sandbox-probe:partner", partnerErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  if (!isSandboxPartnerTenant(partnerRow.name as string, partnerRow.slug as string | null)) {
    return NextResponse.json({ error: "Disponivel apenas para a empresa Sandbox" }, { status: 403 });
  }

  let body: { action?: string; providerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "listTickets") {
    return NextResponse.json({ error: "action invalida (use listTickets)" }, { status: 400 });
  }

  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "octadesk";
  if (!isDeskProviderId(providerId)) {
    return NextResponse.json({ error: "providerId is invalid" }, { status: 400 });
  }

  const keys = getDeskProviderCredentialKeys(providerId);
  const { data, error } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (error) {
    logApiError("desk-sandbox-probe:settings", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const baseUrlRaw = data?.find((row) => row.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = data?.find((row) => row.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(baseUrlRaw);
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";

  if (!baseUrl || !apiToken) {
    return NextResponse.json({ error: "Configure e salve as credenciais Octadesk antes." }, { status: 400 });
  }

  const tickets = await fetchOctadeskJson(baseUrl, apiToken, "/tickets?page=1&limit=5", "GET /tickets?page=1&limit=5");
  if ("error" in tickets) {
    return NextResponse.json({ ok: false, message: tickets.error }, { status: 504 });
  }

  const chats = await fetchOctadeskJson(baseUrl, apiToken, "/chat?page=1&limit=5", "GET /chat?page=1&limit=5");
  if ("error" in chats) {
    return NextResponse.json({ ok: false, message: chats.error }, { status: 504 });
  }

  return NextResponse.json({
    ok: true,
    note:
      "No Octadesk, a lista da tela Conversas corresponde a API /chat. /tickets e modulo separado (tickets de suporte) e pode retornar vazio mesmo com muitas conversas.",
    tickets,
    chats,
  });
}
