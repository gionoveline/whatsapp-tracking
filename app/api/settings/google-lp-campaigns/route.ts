import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  buildGoogleLpGoUrl,
  sanitizeEmrCampaignId,
  type GoogleLpCampaignLinkRow,
} from "@/lib/google-lp-campaign-links";
import { resolvePublicSiteOrigin } from "@/lib/public-site-url";

function withGoUrls(
  origin: string,
  partnerId: string,
  rows: GoogleLpCampaignLinkRow[]
) {
  return rows.map((row) => ({
    ...row,
    go_url: origin ? buildGoogleLpGoUrl(origin, partnerId, row.emr_campaign_id) : "",
  }));
}

const MAX_CAMPAIGNS_PER_PARTNER = 50;

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-lp-campaigns:${user.id}:${ip}`, 40, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data, error } = await supabaseUser
    .from("google_lp_campaign_links")
    .select("id, emr_campaign_id, label, is_active, created_at, updated_at")
    .eq("partner_id", partnerId)
    .order("emr_campaign_id", { ascending: true });

  if (error) {
    logApiError("google-lp-campaigns:list", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const origin = resolvePublicSiteOrigin(request);
  const campaigns = withGoUrls(origin, partnerId, (data ?? []) as GoogleLpCampaignLinkRow[]);
  return NextResponse.json({ campaigns, siteOrigin: origin || null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-lp-campaigns-post:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const emrCampaignId = sanitizeEmrCampaignId(o.emrCampaignId ?? o.emr_campaign_id);
  if (!emrCampaignId) {
    return NextResponse.json(
      { error: "emrCampaignId inválido. Use o formato ID#00111 (ID#, letras e números)." },
      { status: 400 }
    );
  }

  const label =
    typeof o.label === "string" ? o.label.trim().slice(0, 120) || null : null;

  const { count, error: countError } = await supabaseUser
    .from("google_lp_campaign_links")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId);

  if (countError) {
    logApiError("google-lp-campaigns:count", countError);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_CAMPAIGNS_PER_PARTNER) {
    return NextResponse.json({ error: `No máximo ${MAX_CAMPAIGNS_PER_PARTNER} campanhas EMR` }, { status: 400 });
  }

  const { data, error } = await supabaseUser
    .from("google_lp_campaign_links")
    .insert({
      partner_id: partnerId,
      emr_campaign_id: emrCampaignId,
      label,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id, emr_campaign_id, label, is_active, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Este ID EMR já está cadastrado" }, { status: 409 });
    }
    logApiError("google-lp-campaigns:insert", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const origin = resolvePublicSiteOrigin(request);
  const campaign = data
    ? withGoUrls(origin, partnerId, [data as GoogleLpCampaignLinkRow])[0]
    : null;
  return NextResponse.json({ ok: true, campaign, siteOrigin: origin || null });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseUser
    .from("google_lp_campaign_links")
    .delete()
    .eq("partner_id", partnerId)
    .eq("id", id);

  if (error) {
    logApiError("google-lp-campaigns:delete", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
