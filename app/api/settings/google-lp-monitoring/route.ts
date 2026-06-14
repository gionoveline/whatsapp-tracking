import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  buildCaptureSummary,
  clampMonitoringHours,
  clampMonitoringLimit,
  mapProtocolToEvent,
  monitoringSinceIso,
  type GoogleLpMatchedLeadRow,
  type GoogleLpProtocolRow,
} from "@/lib/google-lp-monitoring";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-lp-monitoring:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const hours = clampMonitoringHours(request.nextUrl.searchParams.get("hours"));
  const limit = clampMonitoringLimit(request.nextUrl.searchParams.get("limit"));
  const since = monitoringSinceIso(hours);

  const { data: protocolRows, error: protocolError } = await supabaseUser
    .from("google_lp_protocols")
    .select(
      "id, created_at, protocol, message, emr_campaign_id, capture_source, gclid, utm_campaign, matched_lead_id, matched_at"
    )
    .eq("partner_id", partnerId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (protocolError) {
    logApiError("google-lp-monitoring:protocols", protocolError);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const protocols = (protocolRows ?? []) as GoogleLpProtocolRow[];
  const matchedLeadIds = [
    ...new Set(protocols.map((p) => p.matched_lead_id).filter((id): id is string => Boolean(id))),
  ];

  const leadById = new Map<string, GoogleLpMatchedLeadRow>();
  if (matchedLeadIds.length > 0) {
    const { data: leadRows, error: leadError } = await supabaseUser
      .from("leads")
      .select("id, created_at, google_lp_protocol, emr_campaign_id, gclid, contact_phone")
      .eq("partner_id", partnerId)
      .in("id", matchedLeadIds);

    if (leadError) {
      logApiError("google-lp-monitoring:leads", leadError);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }

    for (const lead of (leadRows ?? []) as GoogleLpMatchedLeadRow[]) {
      leadById.set(lead.id, lead);
    }
  }

  const { count: leadsWithGclidCount, error: leadsCountError } = await supabaseUser
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .gte("created_at", since)
    .not("gclid", "is", null);

  if (leadsCountError) {
    logApiError("google-lp-monitoring:leads-count", leadsCountError);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const events = protocols.map((row) => mapProtocolToEvent(row, leadById));
  const summary = buildCaptureSummary(hours, protocols, leadsWithGclidCount ?? 0);

  return NextResponse.json({ summary, events });
}
