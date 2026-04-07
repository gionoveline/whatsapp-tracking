/**
 * Tags (campo raiz `item.tags`) dos leads Sandbox com status `lead` no banco (nao sql/venda).
 *
 * Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/octadesk-non-sql-lead-tags.ts
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

function pushIfString(out: string[], v: unknown): void {
  if (typeof v === "string" && v.trim()) out.push(v.trim());
}

function collectStringsFromRootTagsField(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const tags = item.tags;
  if (tags == null) return out;
  if (typeof tags === "string") {
    pushIfString(out, tags);
    return out;
  }
  if (!Array.isArray(tags)) return out;
  for (const el of tags) {
    if (typeof el === "string") pushIfString(out, el);
    else if (el && typeof el === "object") {
      const o = el as Record<string, unknown>;
      for (const k of ["name", "label", "title", "text", "value", "tag"]) {
        pushIfString(out, o[k]);
      }
    }
  }
  return out;
}

async function octaGet(
  baseUrl: string,
  apiToken: string,
  pathAndQuery: string,
  timeoutMs: number
): Promise<{ ok: boolean; parsed: unknown }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${pathAndQuery}`, {
      method: "GET",
      headers: { "X-API-KEY": apiToken, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* ignore */
    }
    return { ok: res.ok, parsed };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) {
    console.error("Erro partners:", pErr?.message);
    process.exit(1);
  }

  const sandbox = partners.find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) {
    console.error("Nenhum Sandbox.");
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
    console.error("Credenciais Octadesk ausentes.");
    process.exit(1);
  }

  const { data: rows, error: lErr } = await supabase
    .from("leads")
    .select("conversation_id,status")
    .eq("partner_id", sandbox.id)
    .eq("status", "lead");

  if (lErr) {
    console.error("Erro leads:", lErr.message);
    process.exit(1);
  }

  const nonSql = rows ?? [];
  const tagFreq = new Map<string, { display: string; chats: Set<string> }>();
  let chatsWithAnyTag = 0;
  let chatsEmptyTags = 0;
  let fetchFail = 0;

  for (const r of nonSql) {
    const convId = String(r.conversation_id);
    const cid = encodeURIComponent(convId);
    await new Promise((x) => setTimeout(x, 120));
    const d = await octaGet(baseUrl, apiToken, `/chat/${cid}`, 20000);
    if (!d.ok || !d.parsed || typeof d.parsed !== "object") {
      fetchFail += 1;
      continue;
    }
    const item = d.parsed as Record<string, unknown>;
    const tags = collectStringsFromRootTagsField(item);
    if (tags.length === 0) {
      chatsEmptyTags += 1;
      continue;
    }
    chatsWithAnyTag += 1;
    const seenNorm = new Set<string>();
    for (const raw of tags) {
      const norm = raw.toLowerCase();
      if (seenNorm.has(norm)) continue;
      seenNorm.add(norm);
      let agg = tagFreq.get(norm);
      if (!agg) {
        agg = { display: raw, chats: new Set() };
        tagFreq.set(norm, agg);
      }
      agg.chats.add(convId);
    }
  }

  const ranked = Array.from(tagFreq.values())
    .map((a) => ({ tag: a.display, chats: a.chats.size }))
    .sort((x, y) => y.chats - x.chats);

  console.log(
    JSON.stringify(
      {
        sandboxId: sandbox.id,
        dbLeadsStatusLead: nonSql.length,
        octadeskFetchFailed: fetchFail,
        chatsWithAtLeastOneRootTag: chatsWithAnyTag,
        chatsWithEmptyOrMissingRootTags: chatsEmptyTags,
        uniqueTagsFromRootTagsField: ranked.length,
        tagsRankedByChatCount: ranked,
        note:
          "Extrai strings de item.tags (strings ou objetos com name/label/title/text/value/tag). " +
          "chats = quantos dos 56 distintos tinham essa tag na lista.",
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
