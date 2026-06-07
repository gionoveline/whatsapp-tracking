/**
 * Preenche gclid (e UTMs) em protocolos/leads a partir de referrer/landing_url quando a coluna está vazia.
 *
 * Uso:
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/backfill-gclid-from-referrer.ts
 *   FROM=2026-05-28 TO=2026-06-01 SEND_GOOGLE=1  (opcional)
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

const ATTRIBUTION_KEYS = [
  "gclid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

function parseAttributionLoose(urlRaw: string | null | undefined): Attribution {
  if (!urlRaw?.trim()) return {};
  try {
    const sp = new URL(urlRaw.trim()).searchParams;
    const out: Attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const v = sp.get(key)?.trim();
      if (v) out[key] = v.slice(0, 500);
    }
    return out;
  } catch {
    return {};
  }
}

function mergeAttribution(primary: Attribution, secondary: Attribution): Attribution {
  const out = { ...primary };
  for (const key of ATTRIBUTION_KEYS) {
    if (!out[key] && secondary[key]) out[key] = secondary[key];
  }
  return out;
}

function pickAttributionFromProtocolRow(row: {
  gclid: string | null;
  referrer: string | null;
  landing_url: string | null;
}): Attribution | null {
  if (row.gclid?.trim()) return null;

  const fromReferrer = parseAttributionLoose(row.referrer);
  const fromLanding = parseAttributionLoose(row.landing_url);
  const merged = mergeAttribution(fromReferrer, fromLanding);
  if (!merged.gclid && !merged.wbraid && !merged.gbraid) return null;
  return merged;
}

async function main() {
  const { supabase } = await import("@/lib/supabase");
  const { hasGoogleAdsAttribution } = await import("@/lib/google-lp-attribution");
  const { trySendGoogleConversion } = await import("@/lib/google-conversions");
  const { markGoogleSqlConversionSent } = await import("@/lib/google-sql-sent");

  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  const from = (process.env.FROM ?? "2026-05-28").trim();
  const to = (process.env.TO ?? "2026-06-01").trim();
  const sendGoogle = process.env.SEND_GOOGLE === "1" || process.env.SEND_GOOGLE === "true";

  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const { data: protocols, error } = await supabase
    .from("google_lp_protocols")
    .select("id, protocol, partner_id, gclid, wbraid, gbraid, referrer, landing_url, matched_lead_id, attribution")
    .eq("partner_id", partnerId)
    .is("gclid", null)
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lt("created_at", `${to}T23:59:59.999Z`);

  if (error) throw new Error(error.message);

  let protocolsUpdated = 0;
  let leadsUpdated = 0;
  let googleSent = 0;
  let googleSkipped = 0;

  for (const row of protocols ?? []) {
    const attr = pickAttributionFromProtocolRow(row);
    if (!attr) continue;

    const { error: upProtoErr } = await supabase
      .from("google_lp_protocols")
      .update({
        gclid: attr.gclid ?? null,
        wbraid: attr.wbraid ?? null,
        gbraid: attr.gbraid ?? null,
        utm_source: attr.utm_source ?? null,
        utm_medium: attr.utm_medium ?? null,
        utm_campaign: attr.utm_campaign ?? null,
        utm_content: attr.utm_content ?? null,
        utm_term: attr.utm_term ?? null,
        attribution: attr,
      })
      .eq("id", row.id);

    if (upProtoErr) {
      console.error("protocol update failed", row.id, upProtoErr.message);
      continue;
    }
    protocolsUpdated += 1;

    const { data: leads, error: leadErr } = await supabase
      .from("leads")
      .update({
        gclid: attr.gclid ?? null,
        wbraid: attr.wbraid ?? null,
        gbraid: attr.gbraid ?? null,
        utm_source: attr.utm_source ?? null,
        utm_medium: attr.utm_medium ?? null,
        utm_campaign: attr.utm_campaign ?? null,
        utm_content: attr.utm_content ?? null,
        utm_term: attr.utm_term ?? null,
      })
      .eq("partner_id", partnerId)
      .eq("google_lp_protocol", row.protocol)
      .is("gclid", null)
      .select("id, status, emr_campaign_id, google_sql_sent_at");

    if (leadErr) {
      console.error("lead update failed", row.protocol, leadErr.message);
      continue;
    }
    leadsUpdated += (leads ?? []).length;

    if (!sendGoogle || !hasGoogleAdsAttribution(attr)) continue;

    for (const lead of leads ?? []) {
      if (lead.status !== "sql" || lead.google_sql_sent_at) {
        googleSkipped += 1;
        continue;
      }
      const outcome = await trySendGoogleConversion("sql", attr, partnerId, {
        emrCampaignId: lead.emr_campaign_id,
      });
      if (outcome.ok) {
        await markGoogleSqlConversionSent(lead.id, "click_id");
        googleSent += 1;
      } else {
        googleSkipped += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        from,
        to,
        sendGoogle,
        protocolsScanned: protocols?.length ?? 0,
        protocolsUpdated,
        leadsUpdated,
        googleSent,
        googleSkipped,
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
