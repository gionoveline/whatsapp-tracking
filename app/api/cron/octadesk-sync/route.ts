import { NextRequest, NextResponse } from "next/server";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import {
  evaluateOctadeskSyncDueToInterval,
  listPartnerIdsEligibleForOctadeskDeskSync,
  loadOctadeskCredentialsForPartner,
  runOctadeskDeskSyncRound,
} from "@/lib/octadesk-desk-sync";

export const maxDuration = 60;
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
    const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) =>
      decryptAppSettingValue(enc)
    );
    if (!creds) {
      failures.push(partnerId);
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
    } catch (e) {
      failures.push(partnerId);
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
