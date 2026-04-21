/**
 * Reprocessa historico de leads `lead` de um tenant para detectar evolucao para SQL
 * e disparar CAPI SQL quando houver transicao.
 *
 * Uso:
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/reprocess-octadesk-lead-history.ts
 *
 * Opcionais:
 *   BATCH_SIZE=200   # default 100 (consulta de leads por pagina)
 *   SLEEP_MS=90      # default 90 (throttle entre requests no Octadesk)
 *   MAX_ROWS=5000    # default sem limite
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { persistParsedOctaDeskLead } from "@/lib/ingest-octadesk-lead";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { parseOctaDeskItem } from "@/lib/octadesk";
import { loadOctadeskCredentialsForPartner } from "@/lib/octadesk-desk-sync";
import { supabase } from "@/lib/supabase";

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

function readPositiveInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvLocal();
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) {
    throw new Error("PARTNER_ID obrigatorio.");
  }

  const BATCH_SIZE = readPositiveInt("BATCH_SIZE", 100);
  const SLEEP_MS = readPositiveInt("SLEEP_MS", 90);
  const MAX_ROWS = readPositiveInt("MAX_ROWS", Number.MAX_SAFE_INTEGER);

  const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) => decryptAppSettingValue(enc));
  if (!creds) {
    throw new Error("Credenciais Octadesk ausentes para este tenant.");
  }

  const sqlTagMarkersNormalized = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(partnerId));

  let cursor: string | null = null;
  let scanned = 0;
  let detailOk = 0;
  let detailFailed = 0;
  let parsedOk = 0;
  let parsedFailed = 0;
  let persistedOk = 0;
  let persistedFailed = 0;
  let transitionedToSql = 0;
  const errors: string[] = [];

  while (scanned < MAX_ROWS) {
    let query = supabase
      .from("leads")
      .select("id,conversation_id,status")
      .eq("partner_id", partnerId)
      .eq("status", "lead")
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (cursor) {
      query = query.gt("id", cursor);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(`Falha ao listar leads: ${error.message}`);
    }

    const chunk = (rows ?? []) as Array<{ id: string; conversation_id: string | null; status: string }>;
    if (chunk.length === 0) break;

    for (const row of chunk) {
      if (scanned >= MAX_ROWS) break;
      scanned += 1;
      cursor = row.id;

      const convId = row.conversation_id?.trim();
      if (!convId) {
        persistedFailed += 1;
        if (errors.length < 30) errors.push(`lead ${row.id.slice(0, 8)} sem conversation_id`);
        continue;
      }

      await sleep(SLEEP_MS);
      const detail = await octadeskApiGet(
        creds.baseUrl,
        creds.apiToken,
        `/chat/${encodeURIComponent(convId)}`,
        20_000
      );
      if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
        detailFailed += 1;
        if (errors.length < 30) errors.push(`chat ${convId.slice(0, 8)} HTTP ${detail.status}`);
        continue;
      }
      detailOk += 1;

      const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
      if (!parsed) {
        parsedFailed += 1;
        continue;
      }
      parsedOk += 1;

      const persisted = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: true });
      if (!persisted.ok) {
        persistedFailed += 1;
        if (errors.length < 30) errors.push(`${convId.slice(0, 8)} ${persisted.error}`);
        continue;
      }
      persistedOk += 1;
      if (persisted.status === "sql") {
        transitionedToSql += 1;
      }
    }

    if (chunk.length < BATCH_SIZE) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        config: {
          batchSize: BATCH_SIZE,
          sleepMs: SLEEP_MS,
          maxRows: MAX_ROWS === Number.MAX_SAFE_INTEGER ? null : MAX_ROWS,
        },
        summary: {
          scanned,
          detailOk,
          detailFailed,
          parsedOk,
          parsedFailed,
          persistedOk,
          persistedFailed,
          transitionedToSql,
        },
        errors,
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
