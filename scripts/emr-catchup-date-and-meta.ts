/**
 * Catch-up de um dia específico para o tenant EMR, sem reset.
 * - Busca conversas no Octadesk por páginas, filtra por createdAt (UTC YYYY-MM-DD)
 * - Faz upsert em leads
 * - Depois tenta enviar CAPI SQL para os SQLs daquele dia
 *
 * Uso:
 *   TARGET_DATE=2026-04-09 pnpm dlx tsx --tsconfig tsconfig.json scripts/emr-catchup-date-and-meta.ts
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

function isoDatePart(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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

  const targetDate = (process.env.TARGET_DATE ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("TARGET_DATE obrigatória no formato YYYY-MM-DD.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { loadOctadeskCredentialsForPartner } = await import("@/lib/octadesk-desk-sync");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");
  const { persistParsedOctaDeskLead } = await import("@/lib/ingest-octadesk-lead");
  const { trySendMetaConversion } = await import("@/lib/meta-conversions");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, key);
  const forcedPartnerId = (process.env.PARTNER_ID ?? "").trim();
  let emr: { id: string; name: string; slug: string | null } | null = null;
  if (forcedPartnerId) {
    const { data: one, error: oneErr } = await supabase
      .from("partners")
      .select("id,name,slug")
      .eq("id", forcedPartnerId)
      .maybeSingle();
    if (oneErr) throw new Error(oneErr.message);
    if (one) emr = one as { id: string; name: string; slug: string | null };
  }
  if (!emr) {
    const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
    if (pErr || !partners?.length) throw new Error(pErr?.message ?? "Falha ao listar partners.");
    emr = findEmrPartner(partners as Array<{ id: string; name: string; slug: string | null }>);
  }
  if (!emr) throw new Error("Tenant EMR não encontrado. Defina PARTNER_ID para seleção direta.");

  const creds = await loadOctadeskCredentialsForPartner(emr.id, (enc) => decryptAppSettingValue(enc));
  if (!creds) throw new Error("Credenciais Octadesk ausentes para EMR.");

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(emr.id, supabase);
  const sqlTagMarkersNormalized = normalizedMarkersForScan(sqlMarkers);

  const PAGE_LIMIT = 100;
  const MAX_PAGES = 40;

  let listRows = 0;
  let candidates = 0;
  let detailsOk = 0;
  let detailsFailed = 0;
  let parsedOk = 0;
  let parsedFail = 0;
  let imported = 0;
  let importFailed = 0;

  // Evita duplicar envio SQL durante o catch-up; o envio é feito no bloco final, com relatório.
  process.env.SYNC_SKIP_SQL_META = "1";
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = await octadeskApiGet(creds.baseUrl, creds.apiToken, `/chat?page=${page}&limit=${PAGE_LIMIT}`, 30000);
      if (!list.ok || list.parsed == null) break;
      const rows = extractOctadeskTicketList(list.parsed);
      listRows += rows.length;
      if (rows.length === 0) break;

      let pageHasTargetRows = false;
      for (const row of rows) {
        if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
        const rowCreatedAt = "createdAt" in row ? String((row as Record<string, unknown>).createdAt ?? "") : "";
        if (isoDatePart(rowCreatedAt) !== targetDate) continue;
        pageHasTargetRows = true;
        candidates += 1;

        const detail = await octadeskApiGet(
          creds.baseUrl,
          creds.apiToken,
          `/chat/${encodeURIComponent(String(row.id))}`,
          22000
        );
        if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
          detailsFailed += 1;
          continue;
        }
        detailsOk += 1;

        const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
          sqlTagMarkersNormalized,
        });
        if (!parsed) {
          parsedFail += 1;
          continue;
        }
        if (isoDatePart(parsed.createdAt) !== targetDate) continue;
        parsedOk += 1;

        const res = await persistParsedOctaDeskLead(emr.id, parsed, { sendMetaConversion: true });
        if (!res.ok) {
          importFailed += 1;
          continue;
        }
        imported += 1;
        await new Promise((r) => setTimeout(r, 60));
      }

      if (!pageHasTargetRows) break;
    }
  } finally {
    delete process.env.SYNC_SKIP_SQL_META;
  }

  const startIso = `${targetDate}T00:00:00.000Z`;
  const endIso = `${targetDate}T23:59:59.999Z`;
  const { data: sqlRows, error: sqlErr } = await supabase
    .from("leads")
    .select("id,conversation_id,ctwa_clid,updated_at")
    .eq("partner_id", emr.id)
    .eq("status", "sql")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (sqlErr) throw new Error(sqlErr.message);

  const metaResults: Array<{ conversationId: string; result: Awaited<ReturnType<typeof trySendMetaConversion>> }> = [];
  for (const row of sqlRows ?? []) {
    const conv = String(row.conversation_id ?? "").trim() || row.id;
    const ctwa = row.ctwa_clid != null ? String(row.ctwa_clid) : null;
    const updatedAt = row.updated_at != null ? String(row.updated_at) : "";
    const eventTime = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : undefined;
    const r = await trySendMetaConversion("sql", ctwa, emr.id, { eventTime });
    metaResults.push({ conversationId: conv, result: r });
    await new Promise((r2) => setTimeout(r2, 50));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId: emr.id,
        partnerName: emr.name,
        targetDate,
        importSummary: {
          listRows,
          candidates,
          detailsOk,
          detailsFailed,
          parsedOk,
          parsedFail,
          imported,
          importFailed,
        },
        sqlLeadsOnDate: (sqlRows ?? []).length,
        metaSqlAttempts: metaResults.length,
        metaSqlOk: metaResults.filter((m) => m.result.ok).length,
        metaSqlFailed: metaResults.filter((m) => !m.result.ok).length,
        metaSqlDetails: metaResults.map((m) => ({
          conversationId: `${m.conversationId.slice(0, 12)}…`,
          outcome: m.result,
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

