import { NextRequest, NextResponse } from "next/server";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { deskSyncRunInputFromRound, persistDeskSyncRun } from "@/lib/desk-sync-run-persist";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import {
  loadOctadeskCredentialsForPartner,
  runOctadeskDeskSyncRound,
} from "@/lib/octadesk-desk-sync";

export const maxDuration = 300;

/**
 * POST /api/settings/desk-monitoring/sync-now
 * Dispara uma rodada manual do sync Octadesk (conversas recentes + sweep SQL + envio Meta/Google).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sync-now:${user.id}:${ip}`, 3, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const startedAt = new Date().toISOString();
  const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) => decryptAppSettingValue(enc));
  if (!creds) {
    return NextResponse.json({ error: "Configure as credenciais do Desk antes." }, { status: 400 });
  }

  try {
    const round = await runOctadeskDeskSyncRound(partnerId, creds, {
      forceIntervalMode: true,
    });
    await persistDeskSyncRun(deskSyncRunInputFromRound(partnerId, startedAt, round));

    return NextResponse.json({
      ok: true,
      mode: round.mode,
      targetDate: round.targetDate,
      durationMs: round.durationMs,
      import: {
        listed: round.phaseNew.listed,
        imported: round.phaseNew.imported,
        failed: round.phaseNew.failed,
      },
      sweep: {
        scanned: round.phaseLeadSweep.picked,
        imported: round.phaseLeadSweep.imported,
        failed: round.phaseLeadSweep.failed,
      },
      meta: {
        attempted: round.phaseMeta.attempted,
        sent: round.phaseMeta.sent,
        failed: round.phaseMeta.failed,
        failedSummary: round.phaseMeta.failedSummary,
      },
      google: {
        attempted: round.phaseGoogle.attempted,
        sent: round.phaseGoogle.sent,
        failed: round.phaseGoogle.failed,
        failedSummary: round.phaseGoogle.failedSummary,
      },
      errors: round.errors.slice(0, 8),
    });
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 700);
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
      googleAttempted: 0,
      googleSent: 0,
      googleFailed: 0,
      googleFailedSummary: null,
      errorSummary: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
