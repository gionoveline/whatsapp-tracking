import { NextRequest, NextResponse } from "next/server";
import { runOctadeskCronSyncForAllPartners } from "@/lib/octadesk-cron-sync";

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
  const invokedAt = new Date().toISOString();
  const secretConfigured = Boolean(process.env.CRON_SECRET?.trim());
  if (!secretConfigured) {
    console.error(JSON.stringify({ event: "octadesk_cron_rejected", invokedAt, reason: "CRON_SECRET_missing" }));
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  if (!verifyCronSecret(request)) {
    console.error(JSON.stringify({ event: "octadesk_cron_rejected", invokedAt, reason: "CRON_SECRET_mismatch" }));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.info(JSON.stringify({ event: "octadesk_cron_invoked", invokedAt }));
  const summary = await runOctadeskCronSyncForAllPartners();

  const payload = {
    event: "octadesk_cron_complete",
    ok: true,
    partnerCount: summary.partnerCount,
    synced: summary.synced,
    skipped: summary.skipped,
    notReached: summary.notReached,
    credentialFailures: summary.credentialFailures,
    processedPartnerIds: summary.processedPartnerIds,
    results: summary.results,
  };
  console.info(JSON.stringify(payload));

  return NextResponse.json({
    ok: true,
    partnerCount: summary.partnerCount,
    synced: summary.synced,
    skipped: summary.skipped,
    notReached: summary.notReached,
    credentialFailures: summary.credentialFailures,
    results: summary.results,
  });
}
