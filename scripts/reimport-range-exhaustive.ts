/**
 * Reimportacao exaustiva por janela (sem deletar antes): varre paginas do /chat,
 * busca detalhes, aplica parse CTWA e faz upsert em leads.
 *
 * Uso:
 *   START_DATE=2026-04-03 END_DATE=2026-04-05 pnpm dlx tsx --tsconfig tsconfig.json scripts/reimport-range-exhaustive.ts
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

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

async function main() {
  loadEnvLocal();
  const startDate = (process.env.START_DATE ?? "").trim();
  const endDate = (process.env.END_DATE ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("START_DATE/END_DATE invalidos.");
  }
  const pageLimit = 100;
  const maxPages = 200;

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");
  const { persistParsedOctaDeskLead } = await import("@/lib/ingest-octadesk-lead");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: partners } = await supabase.from("partners").select("id,name,slug");
  const sandbox = (partners ?? []).find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) throw new Error("Sandbox not found");

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", sandbox.id)
    .in("key", [keys.baseUrl, keys.apiToken]);
  const baseUrl = normalizeOctadeskBaseUrl(String(settings?.find((r) => r.key === keys.baseUrl)?.value ?? ""));
  const tokenEnc = String(settings?.find((r) => r.key === keys.apiToken)?.value ?? "");
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";
  if (!baseUrl || !apiToken) throw new Error("Missing octadesk credentials");

  const sqlNorm = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(sandbox.id, supabase));

  let listRows = 0;
  let inWindow = 0;
  let detailsOk = 0;
  let parseOk = 0;
  let parseFail = 0;
  let persisted = 0;
  let persistedSql = 0;
  let persistedLead = 0;

  for (let page = 1; page <= maxPages; page++) {
    const list = await octadeskApiGet(baseUrl, apiToken, `/chat?page=${page}&limit=${pageLimit}`, 30000);
    if (!list.ok || list.parsed == null) continue;
    const rows = extractOctadeskTicketList(list.parsed);
    if (rows.length === 0) break;
    listRows += rows.length;
    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
      const rowDate = isoDatePart(String((row as Record<string, unknown>).createdAt ?? ""));
      if (!rowDate || !inRange(rowDate, startDate, endDate)) continue;
      inWindow += 1;
      const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${encodeURIComponent(String(row.id))}`, 22000);
      if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") continue;
      detailsOk += 1;
      const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
        sqlTagMarkersNormalized: sqlNorm,
      });
      if (!parsed) {
        parseFail += 1;
        continue;
      }
      parseOk += 1;
      const res = await persistParsedOctaDeskLead(sandbox.id, parsed, { sendMetaConversion: false });
      if (!res.ok) continue;
      persisted += 1;
      if (res.status === "sql") persistedSql += 1;
      if (res.status === "lead") persistedLead += 1;
      await new Promise((r) => setTimeout(r, 70));
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
        listRows,
        inWindow,
        detailsOk,
        parseOk,
        parseFail,
        persisted,
        persistedSql,
        persistedLead,
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

