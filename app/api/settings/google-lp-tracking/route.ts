import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  GOOGLE_LP_TRACKING_CONFIG_KEY,
  parseStoredGoogleLpTracking,
  sanitizeGoogleLpTrackingBody,
} from "@/lib/google-lp-tracking-settings";

/**
 * GET — configuração de mensagem inicial e WhatsApp padrão para o /go.
 * POST — body { protocolMessageTemplate, whatsappPhone }.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-lp:${user.id}:${ip}`, 40, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data } = await supabaseUser
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", GOOGLE_LP_TRACKING_CONFIG_KEY)
    .maybeSingle();

  const config = parseStoredGoogleLpTracking(data?.value ?? null);
  return NextResponse.json({ config });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-lp-post:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sanitized = sanitizeGoogleLpTrackingBody(body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  const { error } = await supabaseUser.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: GOOGLE_LP_TRACKING_CONFIG_KEY,
      value: JSON.stringify(sanitized.config),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );

  if (error) {
    logApiError("google-lp-tracking:upsert", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config: sanitized.config });
}
