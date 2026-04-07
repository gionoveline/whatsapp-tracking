import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskSqlTagMarkersForPartner } from "@/lib/desk-sql-tag-markers";
import { getDeskProviderCredentialKeys, isDeskProviderId } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import { inventorySandboxNonSqlRootTags } from "@/lib/octadesk-sandbox-non-sql-tags";
import { isSandboxPartnerTenant } from "@/lib/sandbox-partner";

export const maxDuration = 60;

const MAX_CHATS = 60;
const DEFAULT_CHATS = 35;

/**
 * POST — Sandbox only. Lista tags em `item.tags` das conversas ainda `lead`, destacando as que nao batem com marcadores SQL.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sandbox-non-sql-tags:${user.id}:${ip}`, 8, 60 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Tente de novo em ate 1 hora." }, { status: 429 });
  }

  const { data: partnerRow, error: partnerErr } = await supabaseUser
    .from("partners")
    .select("name, slug")
    .eq("id", partnerId)
    .single();

  if (partnerErr || !partnerRow) {
    logApiError("desk-sandbox-non-sql-tags:partner", partnerErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  if (!isSandboxPartnerTenant(partnerRow.name as string, partnerRow.slug as string | null)) {
    return NextResponse.json({ error: "Disponivel apenas para empresa Sandbox" }, { status: 403 });
  }

  let body: { maxChats?: unknown; providerId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawMax =
    typeof body.maxChats === "number" && Number.isFinite(body.maxChats) ? Math.floor(body.maxChats) : DEFAULT_CHATS;
  const maxChats = Math.min(MAX_CHATS, Math.max(1, rawMax));

  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "octadesk";
  if (!isDeskProviderId(providerId)) {
    return NextResponse.json({ error: "providerId is invalid" }, { status: 400 });
  }

  const keys = getDeskProviderCredentialKeys(providerId);
  const { data: settings, error: sErr } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (sErr) {
    logApiError("desk-sandbox-non-sql-tags:settings", sErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";

  if (!baseUrl || !apiToken) {
    return NextResponse.json({ error: "Configure as credenciais Octadesk antes." }, { status: 400 });
  }

  const { count: leadTotal, error: cErr } = await supabaseUser
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("status", "lead");

  if (cErr) {
    logApiError("desk-sandbox-non-sql-tags:count", cErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const { data: leadRows, error: lErr } = await supabaseUser
    .from("leads")
    .select("conversation_id")
    .eq("partner_id", partnerId)
    .eq("status", "lead")
    .order("id", { ascending: true })
    .limit(maxChats);

  if (lErr) {
    logApiError("desk-sandbox-non-sql-tags:leads", lErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const conversationIds = (leadRows ?? [])
    .map((r) => String(r.conversation_id ?? "").trim())
    .filter(Boolean);

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId, supabaseUser);

  const inv = await inventorySandboxNonSqlRootTags({
    baseUrl,
    apiToken,
    conversationIds,
    sqlMarkers,
  });

  return NextResponse.json({
    ok: true,
    partnerId,
    leadsStatusLeadTotal: leadTotal ?? 0,
    maxChats,
    sqlMarkersConfigured: sqlMarkers,
    ...inv,
    note:
      "Fonte: campo raiz `tags` em GET /chat/{id}. Tags que nao batem com nenhum marcador SQL podem ser candidatas a novos marcadores em \"Marcadores SQL\".",
  });
}
