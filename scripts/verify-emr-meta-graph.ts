/**
 * Valida token Meta do tenant EMR + IDs Dataset/WABA via Graph API (sem imprimir segredos).
 * Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/verify-emr-meta-graph.ts
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

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphGet(path: string, token: string): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function findEmr(
  rows: Array<{ id: string; name: string; slug: string | null }>
): { id: string; name: string } | null {
  const candidates = rows.filter((p) => {
    const n = (p.name ?? "").toLowerCase();
    const slug = (p.slug ?? "").toLowerCase();
    if (slug.includes("sandbox") || n.includes("sandbox")) return false;
    return (n.includes("medico") && n.includes("residente")) || n.includes("eu medico residente");
  });
  if (candidates.length === 0) return null;
  return candidates[0]!;
}

async function main() {
  loadEnvLocal();
  const { createClient } = await import("@supabase/supabase-js");
  const { getMetaAccessToken } = await import("@/lib/get-meta-token");
  const { getMetaCapiConfig } = await import("@/lib/meta-conversions");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");

  const supabase = createClient(url, key);
  const forcedId = (process.env.PARTNER_ID ?? "").trim();
  let emr: { id: string; name: string } | null = null;
  if (forcedId) {
    const { data: one } = await supabase.from("partners").select("id,name").eq("id", forcedId).maybeSingle();
    if (one?.id) emr = { id: one.id, name: String(one.name ?? "") };
  }
  if (!emr) {
    const { data: partners } = await supabase.from("partners").select("id,name,slug");
    const found = findEmr((partners ?? []) as Array<{ id: string; name: string; slug: string | null }>);
    emr = found ? { id: found.id, name: found.name } : null;
  }
  if (!emr) throw new Error("Tenant EMR não encontrado (defina PARTNER_ID se o nome mudou).");

  const token = await getMetaAccessToken(emr.id);
  const cfg = await getMetaCapiConfig(emr.id, supabase);
  const datasetId = cfg.dataset_id?.trim() ?? "";
  const wabaId = cfg.waba_id?.trim() ?? "";

  const tokenHint = token ? { present: true, lengthChars: token.length } : { present: false, lengthChars: 0 };

  const out: Record<string, unknown> = {
    partnerId: emr.id,
    partnerName: emr.name,
    tokenFromTenant: tokenHint,
    datasetIdConfigured: datasetId || null,
    wabaIdConfigured: wabaId || null,
    sqlMapping: cfg.mapping?.sql ?? null,
  };

  if (!token) {
    out.graphChecks = { skipped: "no_token" };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const me = await graphGet("/me?fields=id,name", token);
  const ds = datasetId ? await graphGet(`/${encodeURIComponent(datasetId)}?fields=id,name`, token) : null;
  const waba = wabaId ? await graphGet(`/${encodeURIComponent(wabaId)}?fields=id,name`, token) : null;

  out.graphChecks = {
    me: { httpStatus: me.status, body: me.json },
    dataset: ds ? { httpStatus: ds.status, body: ds.json } : { skipped: "no_dataset_id" },
    waba: waba ? { httpStatus: waba.status, body: waba.json } : { skipped: "no_waba_id" },
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
