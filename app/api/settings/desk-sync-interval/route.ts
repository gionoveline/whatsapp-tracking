import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import {
  DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
  DESK_OCTADESK_SYNC_INTERVAL_KEY,
  DESK_OCTADESK_SYNC_INTERVAL_OPTIONS,
  getDeskOctadeskSyncIntervalMinutes,
  sanitizeDeskOctadeskIntervalMinutes,
} from "@/lib/desk-sync-interval";
import { getClientIp, isRateLimited } from "@/lib/request-security";

/**
 * GET — intervalo efetivo (minutos) para throttle do sync Octadesk.
 * POST — body { intervalMinutes: number } entre as opcoes permitidas.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sync-interval:get:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const intervalMinutes = await getDeskOctadeskSyncIntervalMinutes(partnerId, supabaseUser);

  return NextResponse.json({
    intervalMinutes,
    options: [...DESK_OCTADESK_SYNC_INTERVAL_OPTIONS],
    defaultIntervalMinutes: DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sync-interval:post:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { intervalMinutes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intervalMinutes = sanitizeDeskOctadeskIntervalMinutes(body.intervalMinutes);

  const { error } = await supabaseUser.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: DESK_OCTADESK_SYNC_INTERVAL_KEY,
      value: String(intervalMinutes),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );

  if (error) {
    logApiError("desk-sync-interval:post", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, intervalMinutes });
}
