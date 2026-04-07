/**
 * Zera leads + meta_ad_cache do tenant Sandbox e reimporta conversas com createdAt dentro da janela [START_DATE, END_DATE].
 *
 * Uso:
 *   START_DATE=2026-04-03 END_DATE=2026-04-05 pnpm dlx tsx --tsconfig tsconfig.json scripts/reset-sandbox-and-import-date-range.ts
 *
 * Opcional:
 *   OCTADESK_PAGE_LIMIT=100
 *   OCTADESK_MAX_PAGES=60
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

function isoDatePart(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = iso.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isBetween(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

async function main() {
  const startDate = (process.env.START_DATE ?? "").trim();
  const endDate = (process.env.END_DATE ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    console.error("START_DATE e END_DATE sao obrigatorias no formato YYYY-MM-DD.");
    process.exit(1);
  }
  if (startDate > endDate) {
    console.error("START_DATE deve ser <= END_DATE.");
    process.exit(1);
  }

  const pageLimitRaw = Number(process.env.OCTADESK_PAGE_LIMIT ?? "100");
  const maxPagesRaw = Number(process.env.OCTADESK_MAX_PAGES ?? "60");
  const pageLimit = Math.min(100, Math.max(10, Number.isFinite(pageLimitRaw) ? Math.floor(pageLimitRaw) : 100));
  const maxPages = Math.min(300, Math.max(1, Number.isFinite(maxPagesRaw) ? Math.floor(maxPagesRaw) : 60));

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { persistParsedOctaDeskLead } = await import("@/lib/ingest-octadesk-lead");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) {
    console.error("Erro ao listar partners:", pErr?.message);
    process.exit(1);
  }
  const sandbox = partners.find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) {
    console.error("Nenhum tenant Sandbox encontrado.");
    process.exit(1);
  }

  const { error: delLeads, count: delLeadsCount } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .eq("partner_id", sandbox.id);
  if (delLeads) {
    console.error("Erro ao apagar leads:", delLeads.message);
    process.exit(1);
  }
  const { error: delCache } = await supabase.from("meta_ad_cache").delete().eq("partner_id", sandbox.id);
  if (delCache) {
    console.error("Erro ao apagar meta_ad_cache:", delCache.message);
    process.exit(1);
  }

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: sErr } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", sandbox.id)
    .in("key", [keys.baseUrl, keys.apiToken]);
  if (sErr) {
    console.error("Erro ao ler app_settings:", sErr.message);
    process.exit(1);
  }

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";
  if (!baseUrl || !apiToken) {
    console.error("Credenciais Octadesk ausentes para o Sandbox.");
    process.exit(1);
  }

  const sqlNorm = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(sandbox.id, supabase));

  let listRows = 0;
  let detailsOk = 0;
  let detailsFailed = 0;
  let listCandidatesInRange = 0;
  let listSkippedByDate = 0;
  let matchedRange = 0;
  let imported = 0;
  let skippedParse = 0;
  let importFailed = 0;
  let importedSql = 0;
  let importedLead = 0;

  for (let page = 1; page <= maxPages; page++) {
    const list = await octadeskApiGet(baseUrl, apiToken, `/chat?page=${page}&limit=${pageLimit}`, 30000);
    if (!list.ok || list.parsed == null) {
      console.error(`GET /chat falhou na page=${page} (HTTP ${list.status}).`);
      break;
    }
    const rows = extractOctadeskTicketList(list.parsed);
    listRows += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
      const rowCreatedAt = "createdAt" in row ? String((row as Record<string, unknown>).createdAt ?? "") : "";
      const rowDate = isoDatePart(rowCreatedAt);
      if (!rowDate || !isBetween(rowDate, startDate, endDate)) {
        listSkippedByDate += 1;
        continue;
      }
      listCandidatesInRange += 1;

      const cid = encodeURIComponent(String(row.id));
      await new Promise((r) => setTimeout(r, 100));
      const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${cid}`, 22000);
      if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
        detailsFailed += 1;
        continue;
      }
      detailsOk += 1;

      const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
        sqlTagMarkersNormalized: sqlNorm,
      });
      if (!parsed) {
        skippedParse += 1;
        continue;
      }

      const d = isoDatePart(parsed.createdAt);
      if (!d || !isBetween(d, startDate, endDate)) continue;
      matchedRange += 1;

      const persisted = await persistParsedOctaDeskLead(sandbox.id, parsed, { sendMetaConversion: false });
      if (!persisted.ok) {
        importFailed += 1;
        continue;
      }
      imported += 1;
      if (persisted.status === "sql") importedSql += 1;
      if (persisted.status === "lead") importedLead += 1;
    }

  }

  const { count: totalNow } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", sandbox.id);
  const { count: sqlNow } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", sandbox.id)
    .eq("status", "sql");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sandboxId: sandbox.id,
        dateRange: { startDate, endDate },
        deletedLeadsReportedCount: delLeadsCount ?? null,
        pageLimit,
        maxPages,
        listRows,
        detailsOk,
        detailsFailed,
        listCandidatesInRange,
        listSkippedByDate,
        matchedRange,
        imported,
        importedLead,
        importedSql,
        skippedParse,
        importFailed,
        leadsTotalNow: totalNow ?? null,
        leadsSqlNow: sqlNow ?? null,
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

