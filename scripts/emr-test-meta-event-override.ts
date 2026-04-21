/**
 * Testa envio CAPI para um SQL do EMR com event_name forçado (sem alterar config do tenant).
 * Uso:
 *   PARTNER_ID=<uuid> TARGET_DATE=2026-04-08 EVENT_NAME=QualifiedLead pnpm dlx tsx --tsconfig tsconfig.json scripts/emr-test-meta-event-override.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  const targetDate = (process.env.TARGET_DATE ?? "").trim();
  const eventName = (process.env.EVENT_NAME ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("TARGET_DATE inválida.");
  if (!eventName) throw new Error("EVENT_NAME obrigatório.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) throw new Error("Faltam vars do Supabase.");
  const supabase = createClient(supabaseUrl, key);

  const { getMetaAccessToken } = await import("@/lib/get-meta-token");
  const { getMetaCapiConfig } = await import("@/lib/meta-conversions");

  const startIso = `${targetDate}T00:00:00.000Z`;
  const endIso = `${targetDate}T23:59:59.999Z`;
  const { data: sqlRows, error: qErr } = await supabase
    .from("leads")
    .select("id,conversation_id,ctwa_clid")
    .eq("partner_id", partnerId)
    .eq("status", "sql")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(1);
  if (qErr) throw new Error(qErr.message);
  const row = sqlRows?.[0];
  if (!row) throw new Error("Nenhum SQL encontrado na data.");

  const config = await getMetaCapiConfig(partnerId, supabase);
  const token = await getMetaAccessToken(partnerId);
  if (!token) throw new Error("Token Meta ausente.");
  if (!config.dataset_id || !config.waba_id) throw new Error("Dataset/WABA ausentes.");

  const ctwa = row.ctwa_clid != null ? String(row.ctwa_clid) : "";
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
    config.dataset_id
  )}/events?access_token=${encodeURIComponent(token)}`;
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: {
          whatsapp_business_account_id: config.waba_id,
          ctwa_clid: ctwa,
        },
      },
    ],
    ...(config.partner_agent ? { partner_agent: config.partner_agent } : {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let parsed: unknown = { raw };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId,
        targetDate,
        conversationId: row.conversation_id,
        usedEventName: eventName,
        datasetId: config.dataset_id,
        wabaId: config.waba_id,
        hasCtwaClid: Boolean(ctwa),
        httpStatus: res.status,
        response: parsed,
        sentPayload: {
          data: [
            {
              event_name: eventName,
              action_source: "business_messaging",
              messaging_channel: "whatsapp",
              user_data: {
                whatsapp_business_account_id: config.waba_id,
                ctwa_clid_present: Boolean(ctwa),
              },
            },
          ],
          hasPartnerAgent: Boolean(config.partner_agent),
        },
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

