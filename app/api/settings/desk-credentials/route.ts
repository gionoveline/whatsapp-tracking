import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { encryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskProviderCredentialKeys, isDeskProviderId } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-credentials:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const providerId = request.nextUrl.searchParams.get("providerId")?.trim() ?? "";
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
    logApiError("desk-credentials:get", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const baseUrl = data?.find((row) => row.key === keys.baseUrl)?.value ?? "";
  const configured = Boolean(baseUrl && data?.find((row) => row.key === keys.apiToken)?.value);

  return NextResponse.json({
    providerId,
    configured,
    baseUrl,
    apiTokenConfigured: configured,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-credentials:${user.id}:${ip}`, 10, 10 * 60 * 1000);
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

  const baseUrl = normalizeOctadeskBaseUrl(typeof body.baseUrl === "string" ? body.baseUrl : "");
  const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";

  if (!baseUrl) return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
  if (!apiToken) return NextResponse.json({ error: "apiToken is required" }, { status: 400 });
  if (!/^https:\/\//i.test(baseUrl)) {
    return NextResponse.json({ error: "baseUrl must use https" }, { status: 400 });
  }

  const keys = getDeskProviderCredentialKeys(providerId);
  const now = new Date().toISOString();
  const rows = [
    { partner_id: partnerId, key: keys.baseUrl, value: baseUrl, updated_at: now },
    { partner_id: partnerId, key: keys.apiToken, value: encryptAppSettingValue(apiToken), updated_at: now },
  ];

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const { error } = await supabaseUser.from("app_settings").upsert(rows, { onConflict: "partner_id,key" });

  if (error) {
    logApiError("desk-credentials:post", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, configured: true });
}
