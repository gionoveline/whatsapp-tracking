import { NextRequest, NextResponse } from "next/server";
import { META_CAPI_EVENT_NAMES, getMetaCapiConfig, type MetaCapiMapping } from "@/lib/meta-conversions";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

/**
 * GET /api/settings/meta-conversions
 * Retorna configuração CAPI (sem token).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:meta-conversions:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const config = await getMetaCapiConfig(partnerId, supabaseUser);
  return NextResponse.json({
    waba_id: config.waba_id ?? "",
    dataset_id: config.dataset_id ?? "",
    partner_agent: config.partner_agent ?? "",
    mapping: config.mapping,
    event_names: META_CAPI_EVENT_NAMES,
  });
}

/**
 * POST /api/settings/meta-conversions
 * Body: { waba_id?, dataset_id?, partner_agent?, mapping? }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:meta-conversions:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: {
    waba_id?: string;
    dataset_id?: string;
    partner_agent?: string;
    mapping?: MetaCapiMapping;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries: { key: string; value: string; updated_at: string }[] = [];
  const now = new Date().toISOString();

  if (body.waba_id !== undefined) {
    entries.push({ key: "meta_capi_waba_id", value: String(body.waba_id).trim(), updated_at: now });
  }
  if (body.dataset_id !== undefined) {
    entries.push({ key: "meta_capi_dataset_id", value: String(body.dataset_id).trim(), updated_at: now });
  }
  if (body.partner_agent !== undefined) {
    entries.push({ key: "meta_capi_partner_agent", value: String(body.partner_agent).trim(), updated_at: now });
  }
  if (body.mapping !== undefined) {
    entries.push({
      key: "meta_capi_mapping",
      value: JSON.stringify(body.mapping),
      updated_at: now,
    });
  }

  for (const row of entries) {
    const { error } = await supabaseUser
      .from("app_settings")
      .upsert(
        { partner_id: partnerId, key: row.key, value: row.value, updated_at: row.updated_at },
        { onConflict: "partner_id,key" }
      );
    if (error) {
      logApiError("meta-conversions", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
