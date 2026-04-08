import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  DESK_OCTADESK_DAILY_SYNC_TIME_KEY,
  DESK_OCTADESK_SYNC_INTERVAL_KEY,
  DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC,
  DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
  sanitizeDailySyncTimeUtc,
  sanitizeDeskOctadeskIntervalMinutes,
} from "@/lib/desk-sync-interval";
import { DESK_OCTADESK_SYNC_STATE_KEY, parseDeskOctadeskSyncState } from "@/lib/octadesk-desk-sync";
import { DESK_SQL_TAG_MARKERS_KEY, getDeskSqlTagMarkersForPartner } from "@/lib/desk-sql-tag-markers";
import { DESK_PROVIDER_ACTIVE_KEY, getDeskProviderCredentialKeys } from "@/lib/integrations/providers";

function nextDailyRunIsoUtc(dailyTimeUtc: string): string {
  const [hhRaw, mmRaw] = dailyTimeUtc.split(":");
  const hh = Number.parseInt(hhRaw ?? "3", 10);
  const mm = Number.parseInt(mmRaw ?? "0", 10);
  const now = new Date();
  const today = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      Number.isNaN(hh) ? 3 : hh,
      Number.isNaN(mm) ? 0 : mm,
      0,
      0
    )
  );
  if (Date.now() < today.getTime()) return today.toISOString();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-monitoring:get:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [
      keys.baseUrl,
      keys.apiToken,
      DESK_PROVIDER_ACTIVE_KEY,
      DESK_OCTADESK_SYNC_INTERVAL_KEY,
      DESK_OCTADESK_DAILY_SYNC_TIME_KEY,
      DESK_OCTADESK_SYNC_STATE_KEY,
      DESK_SQL_TAG_MARKERS_KEY,
    ]);

  const map = new Map<string, string>();
  for (const row of settings ?? []) {
    map.set(String(row.key), String(row.value ?? ""));
  }

  const configured = Boolean(map.get(keys.baseUrl)?.trim() && map.get(keys.apiToken)?.trim());
  const providerActive = (map.get(DESK_PROVIDER_ACTIVE_KEY) || "octadesk").trim() || "octadesk";

  const intervalMinutes = sanitizeDeskOctadeskIntervalMinutes(
    Number.parseInt(map.get(DESK_OCTADESK_SYNC_INTERVAL_KEY) ?? "", 10)
  );
  const dailyTimeUtc = sanitizeDailySyncTimeUtc(
    map.get(DESK_OCTADESK_DAILY_SYNC_TIME_KEY) ?? DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC
  );

  const syncState = parseDeskOctadeskSyncState(map.get(DESK_OCTADESK_SYNC_STATE_KEY) ?? null);
  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId, supabaseUser);

  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [lead24, sql24, up24, lead7, sql7, up7] = await Promise.all([
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "lead")
      .gte("updated_at", since24hIso),
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "sql")
      .gte("updated_at", since24hIso),
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .gte("updated_at", since24hIso),
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "lead")
      .gte("updated_at", since7dIso),
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "sql")
      .gte("updated_at", since7dIso),
    supabaseUser
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .gte("updated_at", since7dIso),
  ]);

  const { data: recentRuns } = await supabaseUser
    .from("desk_sync_runs")
    .select(
      "id,started_at,finished_at,status,target_date,imported_count,failed_count,listed_count,lead_sweep_scanned,lead_sweep_imported,lead_sweep_failed,error_summary"
    )
    .eq("partner_id", partnerId)
    .eq("provider", "octadesk")
    .order("started_at", { ascending: false })
    .limit(8);

  const nextRunAtIso =
    intervalMinutes === DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES
      ? nextDailyRunIsoUtc(dailyTimeUtc)
      : syncState.lastRunAt
        ? new Date(new Date(syncState.lastRunAt).getTime() + intervalMinutes * 60 * 1000).toISOString()
        : new Date().toISOString();

  return NextResponse.json({
    ok: true,
    providerActive,
    configured,
    intervalMinutes,
    dailyTimeUtc,
    lastRunAt: syncState.lastRunAt,
    nextRunAtIso,
    sqlMarkers,
    metrics24h: {
      leads: lead24.count ?? 0,
      sql: sql24.count ?? 0,
      touched: up24.count ?? 0,
    },
    metrics7d: {
      leads: lead7.count ?? 0,
      sql: sql7.count ?? 0,
      touched: up7.count ?? 0,
    },
    recentRuns: (recentRuns ?? []).map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      targetDate: r.target_date,
      importedCount: r.imported_count,
      failedCount: r.failed_count,
      listedCount: r.listed_count,
      sweepScanned: r.lead_sweep_scanned,
      sweepImported: r.lead_sweep_imported,
      sweepFailed: r.lead_sweep_failed,
      errorSummary: r.error_summary,
    })),
  });
}
