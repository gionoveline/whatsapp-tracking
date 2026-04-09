/**
 * Sync D-1 (modo diário Octadesk) para o tenant Eu Médico Residente + tentativa de envio CAPI SQL do dia.
 *
 * Uso:
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/emr-d1-sync-and-meta-sql.ts
 *
 * Requer .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (+ crypto para token Octadesk).
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

function findEmrPartner(rows: Array<{ id: string; name: string; slug: string | null }>) {
  const candidates = rows.filter((p) => {
    const n = (p.name ?? "").toLowerCase();
    const slug = (p.slug ?? "").toLowerCase();
    if (slug.includes("sandbox")) return false;
    if (n.includes("sandbox")) return false;
    return (
      (n.includes("medico") && n.includes("residente")) ||
      n.includes("eu médico residente") ||
      n.includes("eu medico residente")
    );
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const exact = candidates.find((p) => p.name.toLowerCase().trim() === "eu medico residente");
  return exact ?? candidates[0];
}

async function main() {
  loadEnvLocal();

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { loadOctadeskCredentialsForPartner, runOctadeskDeskSyncRound } = await import("@/lib/octadesk-desk-sync");
  const { trySendMetaConversion } = await import("@/lib/meta-conversions");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }

  const supabase = createClient(url, key);
  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) throw new Error(pErr?.message ?? "partners vazio");

  const emr = findEmrPartner(partners as Array<{ id: string; name: string; slug: string | null }>);
  if (!emr) {
    throw new Error("Tenant Eu Médico Residente não encontrado em partners.");
  }

  const creds = await loadOctadeskCredentialsForPartner(emr.id, (enc) => decryptAppSettingValue(enc));
  if (!creds) {
    throw new Error("Credenciais Octadesk ausentes para o tenant EMR.");
  }

  console.error(`EMR partner: ${emr.name} (${emr.id})`);

  // Evita envio CAPI SQL duplicado: sync sem SQL Meta, depois relatório com trySendMetaConversion.
  process.env.SYNC_SKIP_SQL_META = "1";
  let round: Awaited<ReturnType<typeof runOctadeskDeskSyncRound>>;
  try {
    round = await runOctadeskDeskSyncRound(emr.id, creds.baseUrl, creds.apiToken);
  } finally {
    delete process.env.SYNC_SKIP_SQL_META;
  }
  const targetDate = round.targetDate;
  if (!targetDate) {
    throw new Error("Rodada não está em modo diário (intervalo != 1440); targetDate ausente.");
  }

  const startIso = `${targetDate}T00:00:00.000Z`;
  const endIso = `${targetDate}T23:59:59.999Z`;

  const { data: sqlRows, error: qErr } = await supabase
    .from("leads")
    .select("id, conversation_id, ctwa_clid, status, created_at")
    .eq("partner_id", emr.id)
    .eq("status", "sql")
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (qErr) throw new Error(qErr.message);

  const metaResults: Array<{ conversationId: string; result: Awaited<ReturnType<typeof trySendMetaConversion>> }> = [];

  for (const row of sqlRows ?? []) {
    const conv = String(row.conversation_id ?? "").trim();
    const ctwa = row.ctwa_clid != null ? String(row.ctwa_clid) : null;
    const r = await trySendMetaConversion("sql", ctwa, emr.id);
    metaResults.push({ conversationId: conv || row.id, result: r });
    await new Promise((res) => setTimeout(res, 50));
  }

  const summary = {
    ok: true,
    partnerId: emr.id,
    partnerName: emr.name,
    sync: {
      targetDate: round.targetDate,
      mode: round.mode,
      phaseNew: round.phaseNew,
      phaseLeadSweep: round.phaseLeadSweep,
      errors: round.errors,
      durationMs: round.durationMs,
    },
    sqlLeadsOnTargetDate: (sqlRows ?? []).length,
    metaSqlAttempts: metaResults.length,
    metaSqlOk: metaResults.filter((m) => m.result.ok).length,
    metaSqlFailed: metaResults.filter((m) => !m.result.ok).length,
    metaSqlDetails: metaResults.map((m) => ({
      conversationId: m.conversationId.slice(0, 12) + "…",
      outcome: m.result,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
