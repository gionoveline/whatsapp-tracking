import { NextRequest, NextResponse } from "next/server";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { deskSyncRunInputFromRound, persistDeskSyncRun } from "@/lib/desk-sync-run-persist";
import {
  evaluateOctadeskSyncDueToInterval,
  listPartnerIdsEligibleForOctadeskDeskSync,
  loadOctadeskCredentialsForPartner,
  runOctadeskDeskSyncRound,
} from "@/lib/octadesk-desk-sync";

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
        googleAttempted: 0,
        googleSent: 0,
        googleFailed: 0,
        googleFailedSummary: null,
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
      await persistDeskSyncRun(deskSyncRunInputFromRound(partnerId, startedAt, round));
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
        googleAttempted: 0,
        googleSent: 0,
        googleFailed: 0,
        googleFailedSummary: null,
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
