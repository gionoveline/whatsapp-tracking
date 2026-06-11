/**
 * Reprocessa SQLs com Google LP (google_lp_protocol) em um intervalo de datas.
 * Reseta para `lead`, reimporta do Octadesk e dispara conversão SQL no Google (Path A ou B).
 *
 * Uso:
 *   PARTNER_ID=<uuid> START_DATE=2026-05-19 END_DATE=2026-05-21 pnpm dlx tsx --tsconfig tsconfig.json scripts/reprocess-google-sql-batch.ts
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");
  const { persistParsedOctaDeskLead } = await import("@/lib/ingest-octadesk-lead");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { loadOctadeskCredentialsForPartner } = await import("@/lib/octadesk-desk-sync");
  const { supabase } = await import("@/lib/supabase");

  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  const startDate = (process.env.START_DATE ?? "2026-05-19").trim();
  const endDate = (process.env.END_DATE ?? "2026-05-21").trim();
  const sleepMs = Number.parseInt(process.env.SLEEP_MS ?? "120", 10) || 120;

  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const { data: rows, error: listError } = await supabase
    .from("leads")
    .select("id,conversation_id,status,google_lp_protocol,gclid,wbraid,gbraid,created_at")
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .not("google_lp_protocol", "is", null)
    .gte("created_at", `${startDate}T00:00:00.000Z`)
    .lte("created_at", `${endDate}T23:59:59.999Z`)
    .order("created_at", { ascending: true });

  if (listError) throw new Error(listError.message);

  const targets = rows ?? [];

  const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) => decryptAppSettingValue(enc));
  if (!creds) throw new Error("Credenciais Octadesk ausentes.");

  const sqlTagMarkersNormalized = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(partnerId));

  const results: Array<Record<string, unknown>> = [];
  let googleSent = 0;
  let googleFailed = 0;
  let googleSkipped = 0;

  for (const row of targets) {
    const convId = String(row.conversation_id ?? "").trim();
    if (!convId) {
      results.push({ id: row.id, ok: false, error: "sem conversation_id" });
      continue;
    }

    await supabase.from("leads").update({ status: "lead" }).eq("id", row.id);

    await sleep(sleepMs);
    const detail = await octadeskApiGet(
      creds.baseUrl,
      creds.apiToken,
      `/chat/${encodeURIComponent(convId)}`,
      20_000
    );
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      results.push({
        conversationId: convId,
        protocol: row.google_lp_protocol,
        ok: false,
        error: `octadesk_http_${detail.status}`,
      });
      continue;
    }

    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
    if (!parsed) {
      results.push({ conversationId: convId, protocol: row.google_lp_protocol, ok: false, error: "parse_failed" });
      continue;
    }

    const res = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: true });
    if (!res.ok) {
      results.push({
        conversationId: convId,
        protocol: row.google_lp_protocol,
        ok: false,
        error: res.error,
      });
      continue;
    }

    const googleSql = res.googleDispatches.find((d) => d.ourEvent === "sql");
    if (googleSql?.ok) googleSent += 1;
    else if (googleSql?.attempted) googleFailed += 1;
    else googleSkipped += 1;

    results.push({
      conversationId: convId,
      protocol: row.google_lp_protocol,
      ok: true,
      afterStatus: res.status,
      googleSql,
      metaSql: res.metaDispatches.find((d) => d.ourEvent === "sql"),
    });

    await sleep(sleepMs);
  }

  const sqlInPeriod = rows?.length ?? 0;
  const withoutClickId = sqlInPeriod - targets.length;

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        startDate,
        endDate,
        summary: {
          sqlGoogleLpInPeriod: sqlInPeriod,
          withClickId: targets.length,
          withoutClickId,
          googleSent,
          googleFailed,
          googleSkipped,
        },
        results,
        note:
          withoutClickId > 0
            ? "SQLs com protocolo GLP mas sem gclid/wbraid/gbraid no lead não entram no reprocessamento Google."
            : undefined,
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
