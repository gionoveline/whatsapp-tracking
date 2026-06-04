import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { deskSyncRunInputFromRound, persistDeskSyncRun } from "@/lib/desk-sync-run-persist";
import {
  evaluateOctadeskSyncDueToInterval,
  listPartnerIdsEligibleForOctadeskDeskSync,
  loadOctadeskCredentialsForPartner,
  runOctadeskDeskSyncRound,
} from "@/lib/octadesk-desk-sync";

/** EMR — processada antes dos demais tenants no cron (evita timeout após Sandbox). */
export const DEFAULT_OCTADESK_CRON_PRIORITY_PARTNER_IDS = [
  "37388640-d398-46ce-8fdf-24c1875767de",
] as const;

export type OctadeskCronPartnerResult =
  | Awaited<ReturnType<typeof runOctadeskDeskSyncRound>>
  | {
      partnerId: string;
      skippedDueToInterval: true;
      intervalMinutes: number;
      lastRunAt: string | null;
      nextEligibleAtIso: string | null;
    }
  | {
      partnerId: string;
      skippedNotReached: true;
      reason: string;
    };

export type OctadeskCronSyncSummary = {
  partnerCount: number;
  processedPartnerIds: string[];
  synced: number;
  skipped: number;
  credentialFailures: number;
  notReached: number;
  results: OctadeskCronPartnerResult[];
  failures: string[];
};

function resolveCronPriorityPartnerIds(): Set<string> {
  const fromEnv = (process.env.DESK_CRON_SYNC_PRIORITY_PARTNER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = fromEnv.length > 0 ? fromEnv : [...DEFAULT_OCTADESK_CRON_PRIORITY_PARTNER_IDS];
  return new Set(ids);
}

/** Tenants prioritários primeiro (EMR por padrão), depois os demais em ordem estável. */
export function sortPartnerIdsForOctadeskCron(partnerIds: string[]): string[] {
  const priority = resolveCronPriorityPartnerIds();
  const first: string[] = [];
  const rest: string[] = [];
  for (const id of partnerIds) {
    if (priority.has(id)) first.push(id);
    else rest.push(id);
  }
  first.sort();
  rest.sort();
  return [...first, ...rest];
}

function persistSkippedIntervalRun(
  partnerId: string,
  startedAt: string,
  throttle: {
    intervalMinutes: number;
    lastRunAt: string | null;
    nextEligibleAtIso: string | null;
  }
): void {
  const next = throttle.nextEligibleAtIso ?? "—";
  const last = throttle.lastRunAt ?? "nunca";
  void persistDeskSyncRun({
    partnerId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "skipped",
    targetDate: null,
    importedCount: 0,
    failedCount: 0,
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
    errorSummary: `Aguardando intervalo (${throttle.intervalMinutes} min). Última: ${last}. Próxima: ${next}.`,
  });
}

function persistNotReachedRun(partnerId: string, startedAt: string): void {
  void persistDeskSyncRun({
    partnerId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "skipped",
    targetDate: null,
    importedCount: 0,
    failedCount: 0,
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
    errorSummary:
      "Cron encerrou antes de processar este tenant (timeout ou limite da função). Use Sincronizar agora ou aguarde a próxima rodada.",
  });
}

/**
 * Roda sync Octadesk para todos os tenants elegíveis (ordem com EMR primeiro).
 */
/** Reserva ~60s antes do maxDuration (300s) para não cortar o tenant prioritário no meio. */
const CRON_WALL_BUDGET_MS = 240_000;

export async function runOctadeskCronSyncForAllPartners(): Promise<OctadeskCronSyncSummary> {
  const eligible = await listPartnerIdsEligibleForOctadeskDeskSync();
  const partnerIds = sortPartnerIdsForOctadeskCron(eligible);
  const results: OctadeskCronPartnerResult[] = [];
  const failures: string[] = [];
  const processedPartnerIds: string[] = [];
  let skipped = 0;
  let notReached = 0;

  const cronStartedAt = new Date().toISOString();
  const cronT0 = Date.now();

  for (let i = 0; i < partnerIds.length; i++) {
    const partnerId = partnerIds[i];

    if (Date.now() - cronT0 >= CRON_WALL_BUDGET_MS) {
      for (let j = i; j < partnerIds.length; j++) {
        const remainingId = partnerIds[j];
        notReached += 1;
        results.push({
          partnerId: remainingId,
          skippedNotReached: true,
          reason: "cron_wall_budget",
        });
        persistNotReachedRun(remainingId, cronStartedAt);
      }
      break;
    }

    const startedAt = new Date().toISOString();
    processedPartnerIds.push(partnerId);

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
      skipped += 1;
      results.push({
        partnerId,
        skippedDueToInterval: true,
        intervalMinutes: throttle.intervalMinutes,
        lastRunAt: throttle.lastRunAt,
        nextEligibleAtIso: throttle.nextEligibleAtIso,
      });
      persistSkippedIntervalRun(partnerId, startedAt, throttle);
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

  const synced = results.filter((r) => "mode" in r).length;

  return {
    partnerCount: partnerIds.length,
    processedPartnerIds,
    synced,
    skipped,
    credentialFailures: failures.length,
    notReached,
    results,
    failures,
  };
}
