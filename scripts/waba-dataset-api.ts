/**
 * Graph API — edge `/{whatsapp-business-account-id}/dataset` (doc Meta).
 *
 * Fluxo recomendado (API):
 * 1. Token de **usuário do sistema** da BM, com a WABA atribuída ao app e escopos
 *    `whatsapp_business_management` (e o que a doc do edge listar).
 * 2. `post` — `POST /{WABA_ID}/dataset` com `dataset_name` → resposta inclui `id` (dataset).
 * 3. Salvar no produto: **WABA ID** + **Dataset ID** (`id` retornado) em Configurações → Conversões.
 *
 * Token:
 * - `META_ACCESS_TOKEN` (recomendado na call): token da BM / system user com acesso à WABA.
 * - Ou `PARTNER_ID` + `.env.local` com Supabase: usa o token Meta salvo do tenant (pode falhar com 403/100).
 *
 * Uso (PowerShell):
 *   $env:META_ACCESS_TOKEN = "<token>"
 *   $env:WABA_ID = "<waba_id>"
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-dataset-api.ts get
 *
 *   Sem WABA_ID: use PARTNER_ID (UUID) + Supabase no .env.local — lê `meta_capi_waba_id` em app_settings.
 *   $env:PARTNER_ID = "<uuid>"
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-dataset-api.ts get
 *
 *   $env:META_ACCESS_TOKEN = "<token>"
 *   $env:WABA_ID = "<waba_id>"
 *   $env:DATASET_NAME = "Nome visível do dataset"
 *   pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-dataset-api.ts post
 *
 * Opcional: `META_GRAPH_VERSION` (default v21.0).
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

function graphBase(): string {
  const v = (process.env.META_GRAPH_VERSION ?? "v21.0").trim().replace(/^v?/, "v");
  return `https://graph.facebook.com/${v}`;
}

async function resolveToken(): Promise<string> {
  const direct = (process.env.META_ACCESS_TOKEN ?? process.env.GRAPH_ACCESS_TOKEN ?? "").trim();
  if (direct) return direct;

  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) {
    throw new Error(
      "Defina META_ACCESS_TOKEN (token com gestão da WABA) ou PARTNER_ID (token do tenant no Supabase)."
    );
  }
  const { getMetaAccessToken } = await import("@/lib/get-meta-token");
  const t = await getMetaAccessToken(partnerId);
  if (!t) throw new Error("Token Meta ausente para este partner.");
  return t;
}

/** WABA explícita em `WABA_ID`, ou `meta_capi_waba_id` do tenant quando só `PARTNER_ID` está definido. */
async function resolveWabaId(): Promise<string> {
  const direct = (process.env.WABA_ID ?? "").trim();
  if (direct) return direct;

  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) {
    throw new Error("WABA_ID ou PARTNER_ID obrigatório (PARTNER_ID busca meta_capi_waba_id no Supabase).");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Para resolver WABA pelo tenant, defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", "meta_capi_waba_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const w = (data?.value ?? "").trim();
  if (!w) {
    throw new Error("meta_capi_waba_id vazio para este partner. Defina WABA_ID ou salve a WABA em Configurações → Conversões.");
  }
  return w;
}

async function cmdGet(wabaId: string, token: string) {
  const url = `${graphBase()}/${encodeURIComponent(wabaId)}/dataset?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }
  console.log(JSON.stringify({ command: "get", httpStatus: res.status, wabaId, response: parsed }, null, 2));
}

async function cmdPost(wabaId: string, token: string, datasetName: string) {
  const url = `${graphBase()}/${encodeURIComponent(wabaId)}/dataset`;
  const body = new URLSearchParams({
    access_token: token,
    dataset_name: datasetName,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }
  const out: Record<string, unknown> = {
    command: "post",
    httpStatus: res.status,
    wabaId,
    datasetName,
    response: parsed,
  };
  if (res.ok && parsed && typeof parsed === "object" && parsed !== null && "id" in parsed) {
    out.nextStep = "Copie response.id para meta_capi_dataset_id (Configurações → Conversões) com o mesmo WABA ID.";
    out.dataset_id = (parsed as { id: string }).id;
  }
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  loadEnvLocal();
  const cmd = (process.argv[2] ?? "").toLowerCase();
  if (cmd !== "get" && cmd !== "post") {
    console.error('Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-dataset-api.ts <get|post>');
    process.exit(1);
  }

  const wabaId = await resolveWabaId();

  const token = await resolveToken();

  if (cmd === "get") {
    await cmdGet(wabaId, token);
    return;
  }

  const datasetName = (process.env.DATASET_NAME ?? "").trim();
  if (!datasetName) throw new Error("DATASET_NAME obrigatório para post (ex.: nome da integração CAPI).");
  await cmdPost(wabaId, token, datasetName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
