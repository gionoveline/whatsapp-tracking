/**
 * Envia CAPI (SQL) para todos os leads com status `sql` do tenant Eu Médico Residente,
 * usando `event_time` derivado de `updated_at` (alinhado ao webhook / sync).
 *
 * Uso:
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/test-emr-meta-sql-leads.ts
 *
 * Opcional: PARTNER_ID=<uuid> força o tenant (senão, detecta por nome como nos outros scripts EMR).
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

function truncate(s: string, max: number) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function main() {
  loadEnvLocal();

  const { createClient } = await import("@supabase/supabase-js");
  const { trySendMetaConversion } = await import("@/lib/meta-conversions");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }

  const supabase = createClient(url, key);
  const forcedId = (process.env.PARTNER_ID ?? "").trim();

  let emr: { id: string; name: string; slug: string | null } | null = null;
  if (forcedId) {
    const { data: one, error: oneErr } = await supabase
      .from("partners")
      .select("id,name,slug")
      .eq("id", forcedId)
      .maybeSingle();
    if (oneErr) throw new Error(oneErr.message);
    if (one) emr = one as { id: string; name: string; slug: string | null };
  }
  if (!emr) {
    const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
    if (pErr || !partners?.length) throw new Error(pErr?.message ?? "partners vazio");
    emr = findEmrPartner(partners as Array<{ id: string; name: string; slug: string | null }>);
  }
  if (!emr) {
    throw new Error("Tenant Eu Médico Residente não encontrado. Use PARTNER_ID se o nome não bater.");
  }

  const { data: sqlRows, error: qErr } = await supabase
    .from("leads")
    .select("id, conversation_id, ctwa_clid, created_at, updated_at, status")
    .eq("partner_id", emr.id)
    .eq("status", "sql")
    .order("updated_at", { ascending: false });

  if (qErr) throw new Error(qErr.message);

  const rows = sqlRows ?? [];
  if (rows.length === 0) {
    throw new Error("Nenhum lead com status sql para este tenant.");
  }

  const results: Array<{
    leadId: string;
    conversationIdShort: string;
    hasCtwa: boolean;
    updated_at: string | null;
    eventTimeUsed: number | undefined;
    outcome: Awaited<ReturnType<typeof trySendMetaConversion>>;
  }> = [];

  for (const row of rows) {
    const ctwa = row.ctwa_clid != null ? String(row.ctwa_clid) : null;
    const updatedAt = row.updated_at != null ? String(row.updated_at) : "";
    const eventTime = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : undefined;
    const outcome = await trySendMetaConversion("sql", ctwa, emr.id, { eventTime });
    results.push({
      leadId: String(row.id),
      conversationIdShort: truncate(String(row.conversation_id ?? ""), 14),
      hasCtwa: Boolean(ctwa?.trim()),
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
      eventTimeUsed: eventTime,
      outcome,
    });
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId: emr.id,
        partnerName: emr.name,
        sqlLeadCount: rows.length,
        expectedThree: rows.length === 3,
        metaOk: results.filter((r) => r.outcome.ok).length,
        metaFailed: results.filter((r) => !r.outcome.ok).length,
        details: results,
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
