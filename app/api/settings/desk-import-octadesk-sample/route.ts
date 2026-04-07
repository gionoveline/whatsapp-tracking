import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskProviderCredentialKeys, isDeskProviderId } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import { importOctadeskChatSampleToLeads } from "@/lib/octadesk-chat-import";

const MAX_LIMIT = 100;

/**
 * POST /api/settings/desk-import-octadesk-sample
 * Importa ate N conversas Octadesk (detalhe) como leads no tenant atual (uso pontual / teste).
 * Body: { limit?: number, providerId?: "octadesk" }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-import-octadesk:${user.id}:${ip}`, 10, 60 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many imports. Tente de novo em ate 1 hora." }, { status: 429 });
  }

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  let body: { limit?: number; providerId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawLimit = typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.floor(body.limit) : 100;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));

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
    logApiError("desk-import-octadesk:settings", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const baseUrlRaw = data?.find((row) => row.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = data?.find((row) => row.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(baseUrlRaw);
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";

  if (!baseUrl || !apiToken) {
    return NextResponse.json({ error: "Configure as credenciais Octadesk antes." }, { status: 400 });
  }

  const summary = await importOctadeskChatSampleToLeads(partnerId, baseUrl, apiToken, limit);

  return NextResponse.json({
    ok: true,
    limit,
    ...summary,
    note:
      "Leads gravados com o mesmo fluxo do webhook (inclui enriquecimento Meta se o token estiver salvo para este tenant). " +
      "Conversoes CAPI nao foram disparadas nesta importacao.",
  });
}
