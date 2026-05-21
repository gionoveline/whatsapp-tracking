/** Agregação de tentativas de envio de conversão (Meta / Google) em rodadas do sync Desk. */

export type ConversionDispatchSnapshot = {
  attempted: boolean;
  ok: boolean;
  reason?: string;
  error?: string;
};

export type ConversionDispatchPhaseStats = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  failedSummary: string | null;
};

export function createEmptyConversionDispatchPhaseStats(): ConversionDispatchPhaseStats {
  return { attempted: 0, sent: 0, failed: 0, skipped: 0, failedSummary: null };
}

export function accumulateConversionDispatch(
  stats: ConversionDispatchPhaseStats,
  dispatch: ConversionDispatchSnapshot,
  failedReasons: string[],
  maxReasons = 8
): void {
  if (!dispatch.attempted) {
    stats.skipped += 1;
    return;
  }
  stats.attempted += 1;
  if (dispatch.ok) {
    stats.sent += 1;
    return;
  }
  stats.failed += 1;
  const reason = dispatch.error ?? dispatch.reason ?? "send_failed";
  if (failedReasons.length < maxReasons) failedReasons.push(reason);
}

export function finalizeConversionFailedSummary(failedReasons: string[]): string | null {
  if (failedReasons.length === 0) return null;
  return failedReasons.join(" | ").slice(0, 700);
}
