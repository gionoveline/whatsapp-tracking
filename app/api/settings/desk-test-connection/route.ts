import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskProviderCredentialKeys, isDeskProviderId } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl, testOctadeskConnection } from "@/lib/integrations/octadesk-client";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-test-connection:${user.id}:${ip}`, 8, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { providerId?: string; baseUrl?: string; apiToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
  if (!isDeskProviderId(providerId)) {
    return NextResponse.json({ error: "providerId is invalid" }, { status: 400 });
  }

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const keys = getDeskProviderCredentialKeys(providerId);
  const { data, error } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (error) {
    logApiError("desk-test-connection:get-settings", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const savedBaseUrl = data?.find((row) => row.key === keys.baseUrl)?.value ?? "";
  const savedTokenEncrypted = data?.find((row) => row.key === keys.apiToken)?.value ?? "";
  const savedToken = savedTokenEncrypted ? decryptAppSettingValue(savedTokenEncrypted) ?? "" : "";

  const baseUrl = normalizeOctadeskBaseUrl(
    typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl : savedBaseUrl
  );
  const apiToken = typeof body.apiToken === "string" && body.apiToken.trim() ? body.apiToken.trim() : savedToken;

  if (!baseUrl || !apiToken) {
    return NextResponse.json(
      { error: "Credenciais nao configuradas. Salve baseUrl e apiToken antes do teste." },
      { status: 400 }
    );
  }

  if (!/^https:\/\//i.test(baseUrl)) {
    return NextResponse.json({ error: "baseUrl must use https" }, { status: 400 });
  }

  const result = await testOctadeskConnection({ baseUrl, apiToken });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, status: result.status },
      { status: result.status && result.status >= 400 ? result.status : 502 }
    );
  }

  return NextResponse.json({ ok: true, message: result.message, status: result.status });
}
