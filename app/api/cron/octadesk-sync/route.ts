import { NextRequest, NextResponse } from "next/server";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import {
  evaluateOctadeskSyncDueToInterval,
  listPartnerIdsEligibleForOctadeskDeskSync,
  loadOctadeskCredentialsForPartner,
  runOctadeskDeskSyncRound,
} from "@/lib/octadesk-desk-sync";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * GET/POST /api/cron/octadesk-sync
 * Vercel Cron (Pro+) ou invocador externo com Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const secretConfigured = Boolean(process.env.CRON_SECRET?.trim());
  if (!secretConfigured) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerIds = await listPartnerIdsEligibleForOctadeskDeskSync();
  const results: Array<
    | Awaited<ReturnType<typeof runOctadeskDeskSyncRound>>
    | {
        partnerId: string;
        skippedDueToInterval: true;
        intervalMinutes: number;
        lastRunAt: string | null;
        nextEligibleAtIso: string | null;
      }
  > = [];
  const failures: string[] = [];

  for (const partnerId of partnerIds) {
    const startedAt = new Date().toISOString();
    const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) =>
      decryptAppSettingValue(enc)
    );
    if (!creds) {
      failures.push(partnerId);
      await persistDeskSyncRun({
        partnerId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "error",
        targetDate: null,
        importedCount: 0,
        failedCount: 1,
        listedCount: 0,
        sweepScanned: 0,
        sweepImported: 0,
        sweepFailed: 0,
        metaAttempted: 0,
        metaSent: 0,
        metaFailed: 0,
        metaFailedSummary: null,
        errorSummary: "Missing or invalid Octadesk credentials",
      });
      continue;
    }

    const throttle = await evaluateOctadeskSyncDueToInterval(partnerId);
    if (!throttle.shouldRun) {
      results.push({
        partnerId,
        skippedDueToInterval: true,
        intervalMinutes: throttle.intervalMinutes,
        lastRunAt: throttle.lastRunAt,
        nextEligibleAtIso: throttle.nextEligibleAtIso,
      });
      continue;
    }

    try {
      const round = await runOctadeskDeskSyncRound(partnerId, creds.baseUrl, creds.apiToken);
      results.push(round);
      await persistDeskSyncRun({
        partnerId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "success",
        targetDate: round.targetDate,
        importedCount: round.phaseNew.imported,
        failedCount: round.phaseNew.failed,
        listedCount: round.phaseNew.listed,
        sweepScanned: round.phaseLeadSweep.picked,
        sweepImported: round.phaseLeadSweep.imported,
        sweepFailed: round.phaseLeadSweep.failed,
        metaAttempted: round.phaseMeta.attempted,
        metaSent: round.phaseMeta.sent,
        metaFailed: round.phaseMeta.failed,
        metaFailedSummary: round.phaseMeta.failedSummary,
        errorSummary: round.errors.length > 0 ? round.errors.join(" | ").slice(0, 700) : null,
      });
    } catch (e) {
      failures.push(partnerId);
      await persistDeskSyncRun({
        partnerId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "error",
        targetDate: null,
        importedCount: 0,
        failedCount: 1,
        listedCount: 0,
        sweepScanned: 0,
        sweepImported: 0,
        sweepFailed: 0,
        metaAttempted: 0,
        metaSent: 0,
        metaFailed: 0,
        metaFailedSummary: null,
        errorSummary: (e instanceof Error ? e.message : String(e)).slice(0, 700),
      });
      console.error(
        JSON.stringify({
          event: "octadesk_sync_partner_error",
          partnerId,
          message: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }

  const payload = {
    event: "octadesk_cron_complete",
    ok: true,
    partnerCount: partnerIds.length,
    synced: results.length,
    credentialFailures: failures.length,
    results,
  };
  console.info(JSON.stringify(payload));

  return NextResponse.json({
    ok: true,
    partnerCount: partnerIds.length,
    synced: results.length,
    credentialFailures: failures.length,
    results,
  });
}

type PersistDeskSyncRunInput = {
  partnerId: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "error";
  targetDate: string | null;
  importedCount: number;
  failedCount: number;
  listedCount: number;
  sweepScanned: number;
  sweepImported: number;
  sweepFailed: number;
  metaAttempted: number;
  metaSent: number;
  metaFailed: number;
  metaFailedSummary: string | null;
  errorSummary: string | null;
};

async function persistDeskSyncRun(input: PersistDeskSyncRunInput): Promise<void> {
  const { error } = await supabase.from("desk_sync_runs").insert({
    partner_id: input.partnerId,
    provider: "octadesk",
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    status: input.status,
    target_date: input.targetDate,
    imported_count: input.importedCount,
    failed_count: input.failedCount,
    listed_count: input.listedCount,
    lead_sweep_scanned: input.sweepScanned,
    lead_sweep_imported: input.sweepImported,
    lead_sweep_failed: input.sweepFailed,
    meta_attempted_count: input.metaAttempted,
    meta_sent_count: input.metaSent,
    meta_failed_count: input.metaFailed,
    meta_failed_summary: input.metaFailedSummary,
    error_summary: input.errorSummary,
  });
  if (error) {
    console.error(
      JSON.stringify({
        event: "octadesk_sync_run_persist_error",
        partnerId: input.partnerId,
        message: error.message,
      })
    );
  }
}
