/**
 * Reprocessa no Sandbox os leads do app em uma data alvo (created_at UTC YYYY-MM-DD),
 * buscando detalhe no Octadesk e reaplicando persistParsedOctaDeskLead.
 *
 * Uso:
 *   TARGET_DATE=2026-04-05 pnpm dlx tsx --tsconfig tsconfig.json scripts/refresh-sandbox-leads-by-date.ts
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

async function main() {
  loadEnvLocal();
  const targetDate = (process.env.TARGET_DATE ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("TARGET_DATE obrigatoria no formato YYYY-MM-DD.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");
  const { persistParsedOctaDeskLead } = await import("@/lib/ingest-octadesk-lead");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: partners } = await supabase.from("partners").select("id,name,slug");
  const sandbox = (partners ?? []).find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) throw new Error("Sandbox not found.");

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", sandbox.id)
    .in("key", [keys.baseUrl, keys.apiToken]);
  const baseUrl = normalizeOctadeskBaseUrl(String(settings?.find((r) => r.key === keys.baseUrl)?.value ?? ""));
  const tokenEnc = String(settings?.find((r) => r.key === keys.apiToken)?.value ?? "");
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";
  if (!baseUrl || !apiToken) throw new Error("Missing Octadesk credentials.");

  const startIso = `${targetDate}T00:00:00.000Z`;
  const endIso = `${targetDate}T23:59:59.999Z`;

  const { data: rows, error: rErr } = await supabase
    .from("leads")
    .select("conversation_id,status,created_at")
    .eq("partner_id", sandbox.id)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (rErr) throw new Error(rErr.message);
  const convs = (rows ?? [])
    .map((r) => String(r.conversation_id ?? "").trim())
    .filter(Boolean);

  const sqlNorm = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(sandbox.id, supabase));
  let detailsOk = 0;
  let detailsFail = 0;
  let parseFail = 0;
  let persisted = 0;
  let persistFail = 0;
  let sqlNow = 0;
  let leadNow = 0;

  for (const convId of convs) {
    const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${encodeURIComponent(convId)}`, 22000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      detailsFail += 1;
      continue;
    }
    detailsOk += 1;
    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
      sqlTagMarkersNormalized: sqlNorm,
    });
    if (!parsed) {
      parseFail += 1;
      continue;
    }
    const res = await persistParsedOctaDeskLead(sandbox.id, parsed, { sendMetaConversion: false });
    if (!res.ok) {
      persistFail += 1;
      continue;
    }
    persisted += 1;
    if (res.status === "sql") sqlNow += 1;
    if (res.status === "lead") leadNow += 1;
    await new Promise((r) => setTimeout(r, 70));
  }

  const { count: totalSql } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", sandbox.id)
    .eq("status", "sql");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sandboxId: sandbox.id,
        targetDate,
        leadsInDbOnDate: convs.length,
        detailsOk,
        detailsFail,
        parseFail,
        persisted,
        persistFail,
        statusesFromRefresh: { sqlNow, leadNow },
        totalSqlInSandboxAfterRefresh: totalSql ?? null,
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

