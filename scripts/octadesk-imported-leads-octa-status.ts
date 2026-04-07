/**
 * Para leads ja gravados no Sandbox: cruza status no banco (lead/sql/venda)
 * com item.status do GET /chat/{id} no Octadesk.
 *
 * Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/octadesk-imported-leads-octa-status.ts
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
): Promise<{ ok: boolean; parsed: unknown }> {
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
    return { ok: res.ok, parsed };
  } finally {
    clearTimeout(t);
  }
}

function rootStatus(item: Record<string, unknown>): string {
  const s = item.status;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (s == null) return "(sem status)";
  return `(tipo:${typeof s})`;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");

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

  const { data: rows, error: lErr } = await supabase
    .from("leads")
    .select("id,conversation_id,status")
    .eq("partner_id", sandbox.id);

  if (lErr || !rows?.length) {
    console.error("Sem leads no Sandbox ou erro:", lErr?.message);
    process.exit(1);
  }

  const nonSql = rows.filter((r) => r.status !== "sql" && r.status !== "venda");
  const sqlRows = rows.filter((r) => r.status === "sql");

  const countNonSqlByOctaStatus = new Map<string, number>();
  const countSqlByOctaStatus = new Map<string, number>();
  let fetchFailNonSql = 0;
  let fetchFailSql = 0;

  for (const r of nonSql) {
    const cid = encodeURIComponent(String(r.conversation_id));
    await new Promise((x) => setTimeout(x, 120));
    const d = await octaGet(baseUrl, apiToken, `/chat/${cid}`, 20000);
    if (!d.ok || !d.parsed || typeof d.parsed !== "object") {
      fetchFailNonSql += 1;
      continue;
    }
    const sk = rootStatus(d.parsed as Record<string, unknown>);
    countNonSqlByOctaStatus.set(sk, (countNonSqlByOctaStatus.get(sk) ?? 0) + 1);
  }

  for (const r of sqlRows) {
    const cid = encodeURIComponent(String(r.conversation_id));
    await new Promise((x) => setTimeout(x, 120));
    const d = await octaGet(baseUrl, apiToken, `/chat/${cid}`, 20000);
    if (!d.ok || !d.parsed || typeof d.parsed !== "object") {
      fetchFailSql += 1;
      continue;
    }
    const sk = rootStatus(d.parsed as Record<string, unknown>);
    countSqlByOctaStatus.set(sk, (countSqlByOctaStatus.get(sk) ?? 0) + 1);
  }

  const sortM = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([status, count]) => ({ octadeskRootStatus: status, count }))
      .sort((a, b) => b.count - a.count);

  console.log(
    JSON.stringify(
      {
        sandboxId: sandbox.id,
        leadsTotalInDb: rows.length,
        dbStatusSql: sqlRows.length,
        dbStatusNonSql: nonSql.length,
        importedButNotSql_octadeskItemStatus: sortM(countNonSqlByOctaStatus),
        sqlRows_octadeskItemStatus: sortM(countSqlByOctaStatus),
        fetchFailedNonSql: fetchFailNonSql,
        fetchFailedSql: fetchFailSql,
        note:
          "importedButNotSql = leads no banco com status lead (nao sql nem venda). octadeskItemStatus = campo status no JSON atual do GET /chat/{id}.",
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
