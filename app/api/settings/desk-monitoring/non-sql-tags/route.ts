import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskSqlTagMarkersForPartner } from "@/lib/desk-sql-tag-markers";
import { getDeskProviderCredentialKeys } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { extractOctadeskTicketList, safeTopKeys } from "@/lib/integrations/octadesk-probe";
import { inventorySandboxNonSqlRootTags } from "@/lib/octadesk-sandbox-non-sql-tags";

/** Inventário pode analisar centenas de GET /chat/{id}; 60s não basta (só delays já passam de 50s com limite 500). */
export const maxDuration = 300;

const MAX_CHATS = 500;
const DEFAULT_CHATS = 500;
const OCTADESK_LIST_PAGE_LIMIT = 100;
const OCTADESK_LIST_MAX_PAGES = 20;

async function loadConversationIdsFromOctadesk(baseUrl: string, apiToken: string, maxChats: number): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= OCTADESK_LIST_MAX_PAGES && out.length < maxChats; page++) {
    const list = await octadeskApiGet(
      baseUrl,
      apiToken,
      `/chat?page=${page}&limit=${OCTADESK_LIST_PAGE_LIMIT}`,
      20_000
    );
    if (!list.ok || list.parsed == null) continue;

    const rows = extractOctadeskTicketList(list.parsed);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
      const id = String(row.id).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= maxChats) break;
    }
  }

  return out;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-monitoring:non-sql-tags:${user.id}:${ip}`, 8, 60 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Tente de novo em ate 1 hora." }, { status: 429 });
  }

  let body: { maxChats?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawMax =
    typeof body.maxChats === "number" && Number.isFinite(body.maxChats) ? Math.floor(body.maxChats) : DEFAULT_CHATS;
  const maxChats = Math.min(MAX_CHATS, Math.max(1, rawMax));

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: sErr } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (sErr) {
    logApiError("desk-monitoring-non-sql-tags:settings", sErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";

  if (!baseUrl || !apiToken) {
    return NextResponse.json({ error: "Configure as credenciais do Desk antes." }, { status: 400 });
  }

  const listProbe = await octadeskApiGet(baseUrl, apiToken, `/chat?page=1&limit=5`, 15_000);
  const listProbeRows = extractOctadeskTicketList(listProbe.parsed);
  const listProbeFirst = listProbeRows[0];
  const listProbeSummary = {
    httpOk: listProbe.ok,
    httpStatus: listProbe.status,
    jsonTopKeys: safeTopKeys(listProbe.parsed),
    rowCount: listProbeRows.length,
    firstRowTopKeys:
      listProbeFirst && typeof listProbeFirst === "object" ? safeTopKeys(listProbeFirst) : ([] as string[]),
  };

  const { count: leadTotal, error: cErr } = await supabaseUser
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId);
  if (cErr) {
    logApiError("desk-monitoring-non-sql-tags:count", cErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const { data: leadRows, error: lErr } = await supabaseUser
    .from("leads")
    .select("conversation_id,status")
    .eq("partner_id", partnerId)
    .not("conversation_id", "is", null)
    .order("id", { ascending: true })
    .limit(maxChats);
  if (lErr) {
    logApiError("desk-monitoring-non-sql-tags:leads", lErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const localConversationIds = (leadRows ?? [])
    .map((r) => String(r.conversation_id ?? "").trim())
    .filter(Boolean);

  let conversationIds = localConversationIds;
  let conversationIdsSource: "local_db" | "octadesk_list" | "octadesk_list_retry_after_empty" = "local_db";

  // Fallback inicial: se a base local não tiver conversation_id utilizável, consulta direto o /chat da Octadesk.
  if (conversationIds.length === 0) {
    conversationIds = await loadConversationIdsFromOctadesk(baseUrl, apiToken, maxChats);
    conversationIdsSource = "octadesk_list";
  }

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId, supabaseUser);

  let inv = await inventorySandboxNonSqlRootTags({
    baseUrl,
    apiToken,
    conversationIds,
    sqlMarkers,
  });

  // Fallback de robustez em produção:
  // se vier sem dados úteis (zero lead/sql detectado), tenta novamente com IDs frescos do /chat da Octadesk.
  const noUsefulData = (inv.octadeskLeadChats ?? 0) + (inv.octadeskSqlChats ?? 0) === 0;
  let retriedAnalysisWithFreshOctadeskIds = false;
  if (noUsefulData) {
    const octadeskConversationIds = await loadConversationIdsFromOctadesk(baseUrl, apiToken, maxChats);
    if (octadeskConversationIds.length > 0) {
      inv = await inventorySandboxNonSqlRootTags({
        baseUrl,
        apiToken,
        conversationIds: octadeskConversationIds,
        sqlMarkers,
      });
      retriedAnalysisWithFreshOctadeskIds = true;
      conversationIdsSource = "octadesk_list_retry_after_empty";
    }
  }

  const { diagnostics: inventoryDiagnostics, ...invRest } = inv;

  return NextResponse.json({
    ok: true,
    partnerId,
    leadsTotal: leadTotal ?? 0,
    maxChats,
    sqlMarkersConfigured: sqlMarkers,
    statusesConsidered: ["lead", "sql", "venda"],
    diagnostics: {
      durationMs: Date.now() - startedAt,
      listProbe: listProbeSummary,
      localConversationIdsCount: localConversationIds.length,
      conversationIdsSource,
      retriedAnalysisWithFreshOctadeskIds,
      inventory: inventoryDiagnostics,
    },
    ...invRest,
  });
}
