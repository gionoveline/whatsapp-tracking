import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import {
  DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC,
  DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
  DESK_OCTADESK_DAILY_SYNC_TIME_KEY,
  DESK_OCTADESK_SYNC_INTERVAL_KEY,
  getDeskOctadeskDailySyncTimeUtc,
  getDeskOctadeskSyncIntervalMinutes,
  sanitizeDailySyncTimeUtc,
} from "@/lib/desk-sync-interval";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { DESK_OCTADESK_SYNC_STATE_KEY, parseDeskOctadeskSyncState } from "@/lib/octadesk-desk-sync";

const LOCKED_INTERVAL_MINUTES = 1440;

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
  const dailyTimeUtc = await getDeskOctadeskDailySyncTimeUtc(partnerId, supabaseUser);

  return NextResponse.json({
    intervalMinutes,
    dailyTimeUtc,
    options: [LOCKED_INTERVAL_MINUTES],
    defaultIntervalMinutes: DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
    defaultDailyTimeUtc: DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC,
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

  let body: { intervalMinutes?: unknown; dailyTimeUtc?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intervalMinutes = LOCKED_INTERVAL_MINUTES;
  const dailyTimeUtc = sanitizeDailySyncTimeUtc(body.dailyTimeUtc);

  const nowIso = new Date().toISOString();
  const { error } = await supabaseUser.from("app_settings").upsert(
    [
      {
        partner_id: partnerId,
        key: DESK_OCTADESK_SYNC_INTERVAL_KEY,
        value: String(intervalMinutes),
        updated_at: nowIso,
      },
      {
        partner_id: partnerId,
        key: DESK_OCTADESK_DAILY_SYNC_TIME_KEY,
        value: dailyTimeUtc,
        updated_at: nowIso,
      },
    ],
    { onConflict: "partner_id,key" }
  );

  if (error) {
    logApiError("desk-sync-interval:post", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  if (intervalMinutes !== 1440) {
    const { data: syncStateRow } = await supabaseUser
      .from("app_settings")
      .select("value")
      .eq("partner_id", partnerId)
      .eq("key", DESK_OCTADESK_SYNC_STATE_KEY)
      .maybeSingle();
    const current = parseDeskOctadeskSyncState(syncStateRow?.value ?? null);
    await supabaseUser.from("app_settings").upsert(
      {
        partner_id: partnerId,
        key: DESK_OCTADESK_SYNC_STATE_KEY,
        value: JSON.stringify({ ...current, lastRunAt: null }),
        updated_at: nowIso,
      },
      { onConflict: "partner_id,key" }
    );
  }

  return NextResponse.json({ ok: true, intervalMinutes, dailyTimeUtc });
}
