import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleAdsConversionConfig,
  type GoogleAdsConversionMapping,
} from "@/lib/google-conversions";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

/**
 * GET /api/settings/google-ads-conversions
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-conversions:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const config = await getGoogleAdsConversionConfig(partnerId, supabaseUser);
  return NextResponse.json({
    customer_id: config.customer_id ?? "",
    currency_code: config.currency_code,
    mapping: config.mapping,
  });
}

/**
 * POST /api/settings/google-ads-conversions
 * Body: { customer_id?, currency_code?, mapping? }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-conversions:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: {
    customer_id?: string;
    currency_code?: string;
    mapping?: GoogleAdsConversionMapping;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const entries: { key: string; value: string; updated_at: string }[] = [];

  if (body.customer_id !== undefined) {
    entries.push({
      key: "google_ads_customer_id",
      value: String(body.customer_id).trim().replace(/-/g, ""),
      updated_at: now,
    });
  }
  if (body.currency_code !== undefined) {
    entries.push({
      key: "google_ads_currency_code",
      value: String(body.currency_code).trim().toUpperCase() || "BRL",
      updated_at: now,
    });
  }
  if (body.mapping !== undefined) {
    entries.push({
      key: "google_ads_conversion_mapping",
      value: JSON.stringify(body.mapping),
      updated_at: now,
    });
  }

  for (const row of entries) {
    const { error } = await supabaseUser.from("app_settings").upsert(
      { partner_id: partnerId, key: row.key, value: row.value, updated_at: row.updated_at },
      { onConflict: "partner_id,key" }
    );
    if (error) {
      logApiError("google-ads-conversions", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
