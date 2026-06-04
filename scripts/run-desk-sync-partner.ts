/**
 * Sync Octadesk manual (service role) — igual ao cron/sync-now, sem auth HTTP.
 *
 * Uso:
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/run-desk-sync-partner.ts
 *   FORCE_DAILY=1   — modo diário (dia anterior UTC), padrão se intervalo = 1440
 *   FORCE_INTERVAL=1 — força modo intervalo (conversas recentes)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

async function main() {
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const forceInterval = process.env.FORCE_INTERVAL === "1" || process.env.FORCE_INTERVAL === "true";
  const forceDaily = process.env.FORCE_DAILY === "1" || process.env.FORCE_DAILY === "true";

  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { deskSyncRunInputFromRound, persistDeskSyncRun } = await import("@/lib/desk-sync-run-persist");
  const { loadOctadeskCredentialsForPartner, runOctadeskDeskSyncRound } =
    await import("@/lib/octadesk-desk-sync");

  const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) => decryptAppSettingValue(enc));
  if (!creds) throw new Error("Credenciais Octadesk ausentes para o partner.");

  const startedAt = new Date().toISOString();
  const round = await runOctadeskDeskSyncRound(partnerId, creds.baseUrl, creds.apiToken, {
    forceIntervalMode: forceInterval ? true : forceDaily ? false : undefined,
  });

  await persistDeskSyncRun(deskSyncRunInputFromRound(partnerId, startedAt, round));

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        mode: round.mode,
        targetDate: round.targetDate,
        durationMs: round.durationMs,
        import: round.phaseNew,
        sweep: round.phaseLeadSweep,
        meta: round.phaseMeta,
        google: round.phaseGoogle,
        errors: round.errors.slice(0, 8),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
