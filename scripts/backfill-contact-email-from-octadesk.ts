/**
 * Preenche leads.contact_email a partir do Octadesk (GET /chat/{id}).
 * Atualiza só a coluna — não dispara Meta/Google.
 *
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/backfill-contact-email-from-octadesk.ts
 *
 * Opcionais:
 *   GOOGLE_LP_ONLY=1   — só leads com google_lp_protocol (default 1)
 *   STATUS=sql         — filtra status (default sql)
 *   SLEEP_MS=90
 *   DRY_RUN=1          — não grava no banco
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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

function readPositiveInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function envFlag(name: string, defaultOn = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultOn;
  return raw === "1" || raw === "true" || raw === "yes";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const googleLpOnly = envFlag("GOOGLE_LP_ONLY", true);
  const dryRun = envFlag("DRY_RUN", false);
  const status = (process.env.STATUS ?? "sql").trim() || "sql";
  const sleepMs = readPositiveInt("SLEEP_MS", 90);

  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { loadOctadeskCredentialsForPartner } = await import("@/lib/octadesk-desk-sync");
  const { supabase } = await import("@/lib/supabase");

  const creds = await loadOctadeskCredentialsForPartner(partnerId, (enc) => decryptAppSettingValue(enc));
  if (!creds) throw new Error("Credenciais Octadesk ausentes para este tenant.");

  const sqlTagMarkersNormalized = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(partnerId));

  let query = supabase
    .from("leads")
    .select("id, conversation_id, contact_email, google_lp_protocol, status")
    .eq("partner_id", partnerId)
    .eq("status", status)
    .is("contact_email", null)
    .order("updated_at", { ascending: false });

  if (googleLpOnly) {
    query = query.not("google_lp_protocol", "is", null);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Falha ao listar leads: ${error.message}`);

  let scanned = 0;
  let detailOk = 0;
  let detailFailed = 0;
  let parsedWithEmail = 0;
  let updated = 0;
  let skippedNoEmail = 0;
  let updateFailed = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    scanned += 1;
    const convId = row.conversation_id?.trim();
    if (!convId) {
      skippedNoEmail += 1;
      continue;
    }

    await sleep(sleepMs);
    const detail = await octadeskApiGet(
      creds.baseUrl,
      creds.apiToken,
      `/chat/${encodeURIComponent(convId)}`,
      20_000
    );
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      detailFailed += 1;
      if (errors.length < 20) errors.push(`chat ${convId.slice(0, 8)} HTTP ${detail.status}`);
      continue;
    }
    detailOk += 1;

    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
    const email = parsed?.contactEmail?.trim() ?? null;
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }
    parsedWithEmail += 1;

    if (dryRun) {
      updated += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update({ contact_email: email })
      .eq("id", row.id);

    if (updateError) {
      updateFailed += 1;
      if (errors.length < 20) errors.push(`${convId.slice(0, 8)} update: ${updateError.message}`);
    } else {
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        dryRun,
        filters: { status, googleLpOnly },
        candidates: rows?.length ?? 0,
        summary: {
          scanned,
          detailOk,
          detailFailed,
          parsedWithEmail,
          updated,
          skippedNoEmail,
          updateFailed,
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
