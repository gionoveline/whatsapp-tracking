/**
 * Auditoria exaustiva de conversas no Octadesk por janela de datas.
 * Nao grava no banco. Apenas conta:
 * - total na janela
 * - quantas passariam no parse CTWA (importaveis)
 * - quantas ficariam de fora (parse falhou)
 *
 * Uso:
 *   START_DATE=2026-04-03 END_DATE=2026-04-05 pnpm dlx tsx --tsconfig tsconfig.json scripts/octadesk-range-exhaustive-audit.ts
 *
 * Opcional:
 *   OCTADESK_PAGE_LIMIT=100
 *   OCTADESK_MAX_PAGES=200
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

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

async function main() {
  const startDate = (process.env.START_DATE ?? "").trim();
  const endDate = (process.env.END_DATE ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    console.error("START_DATE e END_DATE obrigatorias no formato YYYY-MM-DD.");
    process.exit(1);
  }
  if (startDate > endDate) {
    console.error("START_DATE deve ser <= END_DATE.");
    process.exit(1);
  }

  const pageLimitRaw = Number(process.env.OCTADESK_PAGE_LIMIT ?? "100");
  const maxPagesRaw = Number(process.env.OCTADESK_MAX_PAGES ?? "200");
  const pageLimit = Math.min(100, Math.max(10, Number.isFinite(pageLimitRaw) ? Math.floor(pageLimitRaw) : 100));
  const maxPages = Math.min(500, Math.max(1, Number.isFinite(maxPagesRaw) ? Math.floor(maxPagesRaw) : 200));

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
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

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: sErr } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", sandbox.id)
    .in("key", [keys.baseUrl, keys.apiToken]);
  if (sErr) {
    console.error("Erro app_settings:", sErr.message);
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
  let pageFailures = 0;
  let detailsOk = 0;
  let detailsFail = 0;
  let totalInWindowByList = 0;
  let totalInWindowByDetail = 0;
  let importableCtwa = 0;
  let notImportable = 0;
  let outsideWindowByList = 0;
  const sampleNonImportableIds: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const list = await octadeskApiGet(baseUrl, apiToken, `/chat?page=${page}&limit=${pageLimit}`, 30000);
    if (!list.ok || list.parsed == null) {
      pageFailures += 1;
      continue;
    }
    const rows = extractOctadeskTicketList(list.parsed);
    if (rows.length === 0) break;
    listRows += rows.length;

    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
      const rowCreatedAt = "createdAt" in row ? String((row as Record<string, unknown>).createdAt ?? "") : "";
      const rowDate = isoDatePart(rowCreatedAt);
      if (!rowDate || !inRange(rowDate, startDate, endDate)) {
        outsideWindowByList += 1;
        continue;
      }
      totalInWindowByList += 1;

      const cidRaw = String(row.id);
      const cid = encodeURIComponent(cidRaw);
      await new Promise((r) => setTimeout(r, 80));
      const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${cid}`, 24000);
      if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
        detailsFail += 1;
        continue;
      }
      detailsOk += 1;
      const item = detail.parsed as Record<string, unknown>;
      const detailDate = isoDatePart(String(item.createdAt ?? ""));
      if (!detailDate || !inRange(detailDate, startDate, endDate)) {
        continue;
      }
      totalInWindowByDetail += 1;

      const parsed = parseOctaDeskItem(item, { sqlTagMarkersNormalized: sqlNorm });
      if (parsed) {
        importableCtwa += 1;
      } else {
        notImportable += 1;
        if (sampleNonImportableIds.length < 50) {
          sampleNonImportableIds.push(cidRaw.length > 10 ? `...${cidRaw.slice(-8)}` : cidRaw);
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sandboxId: sandbox.id,
        dateRange: { startDate, endDate },
        pageLimit,
        maxPages,
        listRows,
        outsideWindowByList,
        totalInWindowByList,
        detailsOk,
        detailsFail,
        totalInWindowByDetail,
        importableCtwa,
        notImportable,
        sampleNonImportableIds,
        note:
          "importableCtwa = passaria no parse de lead do produto. notImportable = conversa no periodo que nao atende requisitos CTWA/campos obrigatorios.",
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

