/**
 * Reimporta a amostra Octadesk (GET /chat + detalhe) para o partner Sandbox.
 * Mesma lógica de POST /api/settings/desk-import-octadesk-sample — útil após mudar parse (ex.: tags SQL).
 *
 * Uso (na raiz do projeto):
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/reimport-octadesk-sample.ts
 *
 * Opcional: OCTADESK_REIMPORT_LIMIT=100 (máx. 100; alinhado à API desk-import)
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

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { importOctadeskChatSampleToLeads } = await import("@/lib/octadesk-chat-import");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: .env.local).");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) {
    console.error("Erro ao listar partners:", pErr?.message);
    process.exit(1);
  }

  const sandbox = partners.find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) {
    console.error("Nenhum tenant Sandbox encontrado (slug/nome conforme lib/sandbox-partner).");
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
    console.error("Credenciais Octadesk ausentes para o Sandbox.");
    process.exit(1);
  }

  const raw = Number(process.env.OCTADESK_REIMPORT_LIMIT ?? "100");
  const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 100));

  console.error(`Partner Sandbox: ${sandbox.name} (${sandbox.id})`);
  console.error(`Reimportando até ${limit} chats...`);

  const summary = await importOctadeskChatSampleToLeads(sandbox.id, baseUrl, apiToken, limit);

  const { count: sqlCount, error: cErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", sandbox.id)
    .eq("status", "sql");

  if (cErr) {
    console.error("Aviso: não foi possível contar SQLs:", cErr.message);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partnerId: sandbox.id,
        limit,
        ...summary,
        leadsWithStatusSqlInDb: sqlCount ?? null,
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
