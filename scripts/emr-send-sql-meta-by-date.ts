/**
 * Reenvia eventos SQL para Meta de um dia específico no tenant EMR.
 * Uso:
 *   TARGET_DATE=2026-04-08 PARTNER_ID=<uuid_emr> pnpm dlx tsx --tsconfig tsconfig.json scripts/emr-send-sql-meta-by-date.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  loadEnvLocal();
  const targetDate = (process.env.TARGET_DATE ?? "").trim();
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("TARGET_DATE inválida (YYYY-MM-DD).");
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, key);
  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("id,name")
    .eq("id", partnerId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!partner) throw new Error("Partner não encontrado.");

  const startIso = `${targetDate}T00:00:00.000Z`;
  const endIso = `${targetDate}T23:59:59.999Z`;
  const { data: sqlRows, error: qErr } = await supabase
    .from("leads")
    .select("id,conversation_id,ctwa_clid,updated_at")
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (qErr) throw new Error(qErr.message);

  const { trySendMetaConversion } = await import("@/lib/meta-conversions");
  const results: Array<{ conversationId: string; outcome: Awaited<ReturnType<typeof trySendMetaConversion>> }> = [];
  for (const row of sqlRows ?? []) {
    const conversationId = String(row.conversation_id ?? row.id);
    const ctwa = row.ctwa_clid != null ? String(row.ctwa_clid) : null;
    const updatedAt = row.updated_at != null ? String(row.updated_at) : "";
    const eventTime = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : undefined;
    const outcome = await trySendMetaConversion("sql", ctwa, partnerId, { eventTime });
    results.push({ conversationId, outcome });
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId: partner.id,
        partnerName: partner.name,
        targetDate,
        sqlRows: (sqlRows ?? []).length,
        metaAttempts: results.length,
        metaOk: results.filter((r) => r.outcome.ok).length,
        metaFailed: results.filter((r) => !r.outcome.ok).length,
        metaDetails: results.map((r) => ({
          conversationId: `${r.conversationId.slice(0, 12)}…`,
          outcome: r.outcome,
        })),
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

