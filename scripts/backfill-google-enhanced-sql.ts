/**
 * Envia SQL Google LP pendentes via Path B (EC for Leads), sem gclid.
 *
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/backfill-google-enhanced-sql.ts
 *
 * Opcionais:
 *   WINDOW_DAYS=30
 *   SLEEP_MS=120
 *   DRY_RUN=1
 *   FORCE_LIVE=1   — ignora shadowMode nas settings (cuidado)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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

function readPositiveInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function envFlag(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const windowDays = readPositiveInt("WINDOW_DAYS", 30);
  const sleepMs = readPositiveInt("SLEEP_MS", 120);
  const dryRun = envFlag("DRY_RUN");
  const forceLive = envFlag("FORCE_LIVE");

  const { supabase } = await import("@/lib/supabase");
  const { resolveGoogleConversionMatch, buildGoogleConversionOrderId } = await import(
    "@/lib/google-conversion-match"
  );
  const { googleAdsClickIdsFromRow, trySendGoogleMatchedConversion } = await import("@/lib/google-conversions");
  const {
    getGoogleEnhancedLeadsSettings,
    isGoogleEnhancedLeadsLiveSendBlocked,
  } = await import("@/lib/google-enhanced-leads-settings");
  const { markGoogleSqlConversionSent } = await import("@/lib/google-sql-sent");

  const settings = await getGoogleEnhancedLeadsSettings(partnerId);
  if (!settings.enabled) {
    throw new Error("EC for Leads desabilitado nas settings do tenant.");
  }
  if (!forceLive && isGoogleEnhancedLeadsLiveSendBlocked(settings)) {
    throw new Error("Shadow mode ativo — use FORCE_LIVE=1 ou desligue shadow nas configurações.");
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("leads")
    .select(
      "id, conversation_id, google_lp_protocol, gclid, wbraid, gbraid, contact_phone, contact_email, emr_campaign_id, google_sql_sent_at, updated_at"
    )
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .not("google_lp_protocol", "is", null)
    .is("google_sql_sent_at", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: true });

  if (error) throw new Error(error.message);

  let candidates = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    const match = resolveGoogleConversionMatch({
      clickIds: googleAdsClickIdsFromRow(row),
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      settings: { ...settings, enabled: true },
    });
    if (match.mode !== "enhanced_lead") {
      skipped += 1;
      continue;
    }
    candidates += 1;

    const orderId = buildGoogleConversionOrderId({
      googleLpProtocol: row.google_lp_protocol,
      conversationId: row.conversation_id,
    });

    if (dryRun) {
      sent += 1;
      continue;
    }

    await sleep(sleepMs);
    const outcome = await trySendGoogleMatchedConversion("sql", match, partnerId, {
      eventTimeIso: row.updated_at ?? new Date().toISOString(),
      emrCampaignId: row.emr_campaign_id,
      orderId,
    });

    if (outcome.ok) {
      sent += 1;
      await markGoogleSqlConversionSent(row.id, "enhanced_lead");
    } else if (outcome.reason === "send_failed") {
      failed += 1;
      if (errors.length < 20) {
        errors.push(`${row.conversation_id.slice(0, 8)}… ${outcome.error}`);
      }
    } else {
      skipped += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        dryRun,
        forceLive,
        windowDays,
        pendingSqlGoogleLp: rows?.length ?? 0,
        pathBCandidates: candidates,
        sent,
        failed,
        skippedNonPathB: skipped,
        errors,
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
