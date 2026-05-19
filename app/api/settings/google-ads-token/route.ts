import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleAdsConnectionStatus,
  getGoogleAdsCredentials,
} from "@/lib/google-ads-credentials";
import {
  GOOGLE_ADS_CUSTOMER_ID_KEY,
  GOOGLE_ADS_DEVELOPER_TOKEN_KEY,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_ID_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY,
  GOOGLE_ADS_REFRESH_TOKEN_KEY,
} from "@/lib/google-ads-settings-keys";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { encryptAppSettingValue } from "@/lib/app-settings-crypto";

function pickString(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * GET /api/settings/google-ads-token — status da conexão (sem expor segredos).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-token:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const status = await getGoogleAdsConnectionStatus(partnerId, supabaseUser);
  return NextResponse.json(status);
}

/**
 * POST /api/settings/google-ads-token
 * Body (nomes alinhados ao documento EMR / Google):
 * - developer_token
 * - client_id | oauth_client_id  (ID do cliente)
 * - client_secret | oauth_client_secret
 * - refresh_token
 * - customer_id (ID da conta Google Ads)
 * - login_customer_id (MCC, opcional)
 *
 * Campos de senha vazios mantêm o valor já salvo.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-token:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const before = await getGoogleAdsConnectionStatus(partnerId, supabaseUser);

  const developerToken = pickString(body, "developer_token");
  const clientId = pickString(body, "client_id", "oauth_client_id");
  const clientSecret = pickString(body, "client_secret", "oauth_client_secret");
  const refreshToken = pickString(body, "refresh_token");
  const customerId = pickString(body, "customer_id");
  const loginCustomerId = pickString(body, "login_customer_id");

  if (!customerId && !before.customer_id_configured) {
    return NextResponse.json(
      { error: "Informe o ID da conta Google Ads (números no canto superior direito do Google Ads)." },
      { status: 400 }
    );
  }

  if (!refreshToken && !before.refresh_token_configured) {
    return NextResponse.json({ error: "Informe o Refresh Token." }, { status: 400 });
  }

  if (!developerToken && !before.developer_token_configured) {
    return NextResponse.json({ error: "Informe o Developer Token." }, { status: 400 });
  }

  if (!clientId && !before.oauth_client_id_configured) {
    return NextResponse.json({ error: "Informe o ID do cliente." }, { status: 400 });
  }

  if (!clientSecret && !before.oauth_client_secret_configured) {
    return NextResponse.json({ error: "Informe a chave secreta do cliente." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const entries: { partner_id: string; key: string; value: string; updated_at: string }[] = [];

  if (developerToken) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_DEVELOPER_TOKEN_KEY,
      value: encryptAppSettingValue(developerToken),
      updated_at: now,
    });
  }
  if (clientId) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_OAUTH_CLIENT_ID_KEY,
      value: clientId,
      updated_at: now,
    });
  }
  if (clientSecret) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY,
      value: encryptAppSettingValue(clientSecret),
      updated_at: now,
    });
  }
  if (refreshToken) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_REFRESH_TOKEN_KEY,
      value: encryptAppSettingValue(refreshToken),
      updated_at: now,
    });
  }
  if (customerId) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_CUSTOMER_ID_KEY,
      value: customerId.replace(/-/g, ""),
      updated_at: now,
    });
  }
  if (loginCustomerId) {
    entries.push({
      partner_id: partnerId,
      key: GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY,
      value: loginCustomerId.replace(/-/g, ""),
      updated_at: now,
    });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Nenhum campo para salvar." }, { status: 400 });
  }

  for (const row of entries) {
    const { error } = await supabaseUser.from("app_settings").upsert(row, {
      onConflict: "partner_id,key",
    });
    if (error) {
      logApiError("google-ads-token", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
  }

  const creds = await getGoogleAdsCredentials(partnerId, supabaseUser);
  if (!creds) {
    const status = await getGoogleAdsConnectionStatus(partnerId, supabaseUser);
    const missing: string[] = [];
    if (!status.developer_token_configured) missing.push("Developer Token");
    if (!status.oauth_client_id_configured) missing.push("ID do cliente");
    if (!status.oauth_client_secret_configured) missing.push("Chave secreta do cliente");
    if (!status.refresh_token_configured) missing.push("Refresh Token");
    if (!status.customer_id_configured) missing.push("ID da conta Google Ads");
    return NextResponse.json(
      { error: `Ainda faltam: ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const status = await getGoogleAdsConnectionStatus(partnerId, supabaseUser);
  return NextResponse.json({ ok: true, ...status });
}
