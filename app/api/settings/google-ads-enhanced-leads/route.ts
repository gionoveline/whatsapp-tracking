import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_GOOGLE_ENHANCED_LEADS_SETTINGS,
  getGoogleEnhancedLeadsSettings,
  saveGoogleEnhancedLeadsSettings,
  type GoogleEnhancedLeadsSettings,
} from "@/lib/google-enhanced-leads-settings";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const settings = await getGoogleEnhancedLeadsSettings(partnerId);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: shadowRows } = await supabase
    .from("google_enhanced_lead_shadow_events")
    .select("shadow_would_send, has_phone_identifier, has_email_identifier")
    .eq("partner_id", partnerId)
    .eq("our_event", "sql")
    .gte("created_at", since);

  const stats7d = {
    total: shadowRows?.length ?? 0,
    wouldSend: shadowRows?.filter((r) => r.shadow_would_send).length ?? 0,
    withPhone: shadowRows?.filter((r) => r.has_phone_identifier).length ?? 0,
    withEmail: shadowRows?.filter((r) => r.has_email_identifier).length ?? 0,
    withBoth: shadowRows?.filter((r) => r.has_phone_identifier && r.has_email_identifier).length ?? 0,
  };

  const { data: liveRows } = await supabase
    .from("leads")
    .select("google_sql_match_method")
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .eq("google_sql_match_method", "enhanced_lead")
    .gte("google_sql_sent_at", since);

  const liveStats7d = {
    sentEnhancedLead: liveRows?.length ?? 0,
  };

  return NextResponse.json({ ok: true, settings, stats7d, liveStats7d, defaults: DEFAULT_GOOGLE_ENHANCED_LEADS_SETTINGS });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  let body: Partial<GoogleEnhancedLeadsSettings> = {};
  try {
    body = (await request.json()) as Partial<GoogleEnhancedLeadsSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await getGoogleEnhancedLeadsSettings(partnerId);
  const next: GoogleEnhancedLeadsSettings = {
    enabled: body.enabled ?? current.enabled,
    shadowMode: body.shadowMode ?? current.shadowMode,
    usePhone: body.usePhone ?? current.usePhone,
    useEmail: body.useEmail ?? current.useEmail,
  };

  const saved = await saveGoogleEnhancedLeadsSettings(partnerId, next);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

  return NextResponse.json({ ok: true, settings: next });
}
