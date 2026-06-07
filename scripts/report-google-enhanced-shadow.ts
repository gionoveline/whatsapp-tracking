/**
 * Relatório de shadow EC for Leads + elegibilidade retroativa (sem envio).
 *
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/report-google-enhanced-shadow.ts
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

async function main() {
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const { supabase } = await import("@/lib/supabase");
  const { getGoogleEnhancedLeadsSettings } = await import("@/lib/google-enhanced-leads-settings");
  const { resolveGoogleConversionMatch } = await import("@/lib/google-conversion-match");
  const { googleAdsClickIdsFromRow } = await import("@/lib/google-conversions");

  const settings = await getGoogleEnhancedLeadsSettings(partnerId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sqlLeads } = await supabase
    .from("leads")
    .select("id, conversation_id, google_lp_protocol, gclid, wbraid, gbraid, contact_phone, contact_email, google_sql_sent_at")
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .not("google_lp_protocol", "is", null)
    .gte("updated_at", since);

  let clickEligible = 0;
  let enhancedEligible = 0;
  let none = 0;
  let withPhone = 0;
  let withEmail = 0;

  for (const row of sqlLeads ?? []) {
    const match = resolveGoogleConversionMatch({
      clickIds: googleAdsClickIdsFromRow(row),
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      settings: { ...settings, enabled: true },
    });
    if (match.mode === "click_id") clickEligible += 1;
    else if (match.mode === "enhanced_lead") {
      enhancedEligible += 1;
      if (match.hasPhone) withPhone += 1;
      if (match.hasEmail) withEmail += 1;
    } else none += 1;
  }

  const { count: shadowEventsTotal } = await supabase
    .from("google_enhanced_lead_shadow_events")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("our_event", "sql");

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        settings,
        windowDays: 30,
        sqlGoogleLp: sqlLeads?.length ?? 0,
        retrospective: {
          clickEligible,
          enhancedEligible,
          none,
          enhancedWithPhone: withPhone,
          enhancedWithEmail: withEmail,
        },
        shadowEventsRecorded: shadowEventsTotal ?? 0,
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
