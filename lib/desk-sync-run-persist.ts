import { supabase } from "@/lib/supabase";

export type PersistDeskSyncRunInput = {
  partnerId: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "error" | "skipped";
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
  googleAttempted: number;
  googleSent: number;
  googleFailed: number;
  googleFailedSummary: string | null;
  errorSummary: string | null;
};

export async function persistDeskSyncRun(input: PersistDeskSyncRunInput): Promise<void> {
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
    google_attempted_count: input.googleAttempted,
    google_sent_count: input.googleSent,
    google_failed_count: input.googleFailed,
    google_failed_summary: input.googleFailedSummary,
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

function resolveDeskSyncRunStatus(round: {
  phaseNew: { imported: number; failed: number; listed: number };
  phaseLeadSweep: { picked: number; imported: number; failed: number };
  errors: string[];
}): "success" | "error" {
  const errText = round.errors.join(" ").toLowerCase();
  if (/\bhttp 401\b/.test(errText) || /\bhttp 403\b/.test(errText)) return "error";
  if (round.errors.some((e) => e.startsWith("GET /chat") && /\bHTTP (401|403)\b/.test(e))) return "error";

  const totalFailed = round.phaseNew.failed + round.phaseLeadSweep.failed;
  const totalWork = round.phaseNew.listed + round.phaseLeadSweep.picked;
  if (totalWork > 0 && totalFailed >= totalWork && round.phaseNew.imported + round.phaseLeadSweep.imported === 0) {
    return "error";
  }
  if (round.errors.length > 0 && round.phaseNew.imported + round.phaseLeadSweep.imported === 0 && totalWork === 0) {
    return "error";
  }
  return "success";
}

export function deskSyncRunInputFromRound(
  partnerId: string,
  startedAt: string,
  round: {
    targetDate: string | null;
    phaseNew: { imported: number; failed: number; listed: number };
    phaseLeadSweep: { picked: number; imported: number; failed: number };
    phaseMeta: {
      attempted: number;
      sent: number;
      failed: number;
      failedSummary: string | null;
    };
    phaseGoogle: {
      attempted: number;
      sent: number;
      failed: number;
      failedSummary: string | null;
    };
    errors: string[];
  }
): PersistDeskSyncRunInput {
  const status = resolveDeskSyncRunStatus(round);
  return {
    partnerId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
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
    googleAttempted: round.phaseGoogle.attempted,
    googleSent: round.phaseGoogle.sent,
    googleFailed: round.phaseGoogle.failed,
    googleFailedSummary: round.phaseGoogle.failedSummary,
    errorSummary: round.errors.length > 0 ? round.errors.join(" | ").slice(0, 700) : null,
  };
}
