/**
 * Na mesma amostra GET /chat (ex.: 100 itens), mostra distribuicao do campo `status` (raiz)
 * para conversas que NAO viram lead (parse CTWA falhou) vs as que viraram.
 *
 * Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/octadesk-sample-status-outside-import.ts
 * Opcional: OCTADESK_INVENTORY_LIMIT=100
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

async function octaGet(
  baseUrl: string,
  apiToken: string,
  pathAndQuery: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; parsed: unknown }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${pathAndQuery}`, {
      method: "GET",
      headers: { "X-API-KEY": apiToken, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* ignore */
    }
    return { ok: res.ok, status: res.status, parsed };
  } finally {
    clearTimeout(t);
  }
}

function statusKey(item: Record<string, unknown>): string {
  const s = item.status;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (s == null) return "(sem status)";
  return `(tipo:${typeof s})`;
}

function closedHint(item: Record<string, unknown>): string {
  if (!("closed" in item)) return "(sem campo closed)";
  const c = item.closed;
  if (c === true || c === false) return String(c);
  if (c && typeof c === "object") return "objeto";
  if (c == null) return "null";
  return typeof c;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import(
    "@/lib/desk-sql-tag-markers"
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) {
    console.error("Erro partners:", pErr?.message);
    process.exit(1);
  }

  const sandbox = partners.find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) {
    console.error("Nenhum Sandbox.");
    process.exit(1);
  }

  const sqlNorm = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(sandbox.id, supabase));

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
  const baseUrl = normalizeOctadeskBaseUrl(baseUrlRaw);
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";

  if (!baseUrl || !apiToken) {
    console.error("Credenciais Octadesk ausentes.");
    process.exit(1);
  }

  const raw = Number(process.env.OCTADESK_INVENTORY_LIMIT ?? "100");
  const limit = Math.min(200, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 100));

  const list = await octaGet(baseUrl, apiToken, `/chat?page=1&limit=${limit}`, 30000);
  if (!list.ok || list.parsed == null) {
    console.error("GET /chat falhou", list.status);
    process.exit(1);
  }

  const rows = extractOctadeskTicketList(list.parsed);

  const outsideByStatus = new Map<string, number>();
  const importedByStatus = new Map<string, number>();
  const outsideSamples: { rootStatus: string; closed: string; idSuffix: string }[] = [];

  let detailsOk = 0;
  let imported = 0;
  let outside = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
    const chatId = String(row.id);
    const enc = encodeURIComponent(chatId);
    await new Promise((r) => setTimeout(r, 120));

    const detail = await octaGet(baseUrl, apiToken, `/chat/${enc}`, 25000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") continue;
    detailsOk += 1;
    const item = detail.parsed as Record<string, unknown>;

    const sk = statusKey(item);
    const ch = closedHint(item);
    const idSuffix = chatId.length > 10 ? `…${chatId.slice(-8)}` : chatId;

    const ok = Boolean(parseOctaDeskItem(item, { sqlTagMarkersNormalized: sqlNorm }));
    if (ok) {
      imported += 1;
      importedByStatus.set(sk, (importedByStatus.get(sk) ?? 0) + 1);
    } else {
      outside += 1;
      outsideByStatus.set(sk, (outsideByStatus.get(sk) ?? 0) + 1);
      if (outsideSamples.length < 45) {
        outsideSamples.push({ rootStatus: sk, closed: ch, idSuffix });
      }
    }
  }

  const toSorted = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

  console.log(
    JSON.stringify(
      {
        partnerSandbox: sandbox.name,
        limitRequested: limit,
        listRows: rows.length,
        detailsFetchedOk: detailsOk,
        importedCtwaOk: imported,
        outsideImport: outside,
        outsideByRootStatus: toSorted(outsideByStatus),
        importedByRootStatus: toSorted(importedByStatus),
        outsideSamples: outsideSamples,
        note:
          "outside = nao passou em parseOctaDeskItem (CTWA: referral source_id + ctwa_clid, telefone, headline, source_url, etc.). " +
          "rootStatus = item.status no JSON do GET /chat/{id}.",
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
