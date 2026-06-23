/**
 * Testa GET /chat com octa-agent-email e opcionalmente salva o e-mail vencedor.
 *
 * Uso:
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/probe-octadesk-agent-emails.ts
 *   SAVE_AGENT_EMAIL=ga-mkt@... (opcional) — grava em app_settings
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

const DEFAULT_EMAILS = [
  "almir.junior@eumedicoresidente.com.br",
  "ga-mkt@eumedicoresidente.com.br",
];

async function main() {
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");

  const emailsRaw = (process.env.TEST_EMAILS ?? "").trim();
  const emails = emailsRaw
    ? emailsRaw.split(",").map((e) => e.trim()).filter(Boolean)
    : DEFAULT_EMAILS;

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { buildOctadeskApiHeaders } = await import("@/lib/integrations/octadesk-headers");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, key);
  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (error) throw error;

  const baseUrl = normalizeOctadeskBaseUrl(String(data?.find((r) => r.key === keys.baseUrl)?.value ?? ""));
  const tokenEnc = data?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const apiToken = tokenEnc ? decryptAppSettingValue(tokenEnc) ?? "" : "";
  if (!baseUrl || !apiToken) throw new Error("Credenciais Octadesk ausentes.");

  const authCheck = await fetch(`${baseUrl}/auth/check`, {
    headers: buildOctadeskApiHeaders(apiToken),
  });
  console.log("GET /auth/check ->", authCheck.status, (await authCheck.text()).slice(0, 40));

  const results: { email: string; status: number; ok: boolean; preview: string }[] = [];
  for (const email of emails) {
    const res = await fetch(`${baseUrl}/chat?page=1&limit=1`, {
      headers: buildOctadeskApiHeaders(apiToken, email),
      cache: "no-store",
    });
    const text = await res.text();
    results.push({
      email,
      status: res.status,
      ok: res.ok,
      preview: text.slice(0, 100),
    });
    console.log(`GET /chat + octa-agent-email=${email} -> HTTP ${res.status}`);
  }

  const saveEmail = (process.env.SAVE_AGENT_EMAIL ?? "").trim();
  let saved: string | null = null;
  if (saveEmail) {
    const now = new Date().toISOString();
    const { error: upErr } = await supabase.from("app_settings").upsert(
      { partner_id: partnerId, key: keys.agentEmail, value: saveEmail, updated_at: now },
      { onConflict: "partner_id,key" }
    );
    if (upErr) throw upErr;
    saved = saveEmail;
  }

  console.log(JSON.stringify({ partnerId, baseUrl, results, savedAgentEmail: saved }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
