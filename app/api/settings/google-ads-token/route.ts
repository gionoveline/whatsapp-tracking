import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_ID_KEY,
  LOGIN_CUSTOMER_ID_KEY,
  REFRESH_TOKEN_KEY,
} from "@/lib/google-ads-credentials";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { encryptAppSettingValue } from "@/lib/app-settings-crypto";

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

  const keys = [REFRESH_TOKEN_KEY, CUSTOMER_ID_KEY, LOGIN_CUSTOMER_ID_KEY];
  const { data: rows } = await supabaseUser
    .from("app_settings")
    .select("key")
    .eq("partner_id", partnerId)
    .in("key", keys);

  const configuredKeys = new Set((rows ?? []).map((r) => r.key));
  return NextResponse.json({
    refresh_token_configured: configuredKeys.has(REFRESH_TOKEN_KEY),
    customer_id_configured: configuredKeys.has(CUSTOMER_ID_KEY),
    login_customer_id_configured: configuredKeys.has(LOGIN_CUSTOMER_ID_KEY),
    developer_token_env: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()),
    oauth_client_env: Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    ),
  });
}

/**
 * POST /api/settings/google-ads-token
 * Body: { refresh_token, customer_id, login_customer_id? }
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

  let body: { refresh_token?: string; customer_id?: string; login_customer_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  const customerId = typeof body.customer_id === "string" ? body.customer_id.trim() : "";
  if (!refreshToken || !customerId) {
    return NextResponse.json(
      { error: "refresh_token and customer_id are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const entries = [
    {
      partner_id: partnerId,
      key: REFRESH_TOKEN_KEY,
      value: encryptAppSettingValue(refreshToken),
      updated_at: now,
    },
    {
      partner_id: partnerId,
      key: CUSTOMER_ID_KEY,
      value: customerId.replace(/-/g, ""),
      updated_at: now,
    },
  ];

  const loginCustomerId =
    typeof body.login_customer_id === "string" ? body.login_customer_id.trim() : "";
  if (loginCustomerId) {
    entries.push({
      partner_id: partnerId,
      key: LOGIN_CUSTOMER_ID_KEY,
      value: loginCustomerId.replace(/-/g, ""),
      updated_at: now,
    });
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

  return NextResponse.json({ ok: true });
}
