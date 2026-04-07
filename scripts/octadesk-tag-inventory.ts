/**
 * Inventário de textos candidatos a tag/estágio nos detalhes GET /chat/{id} (Sandbox Octadesk).
 * Não grava no banco; só imprime JSON com frequências para alinhar o parser de SQL.
 *
 * Uso: pnpm dlx tsx --tsconfig tsconfig.json scripts/octadesk-tag-inventory.ts
 * Opcional: OCTADESK_INVENTORY_LIMIT=100
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

async function octaGet(
  baseUrl: string,
  apiToken: string,
  pathAndQuery: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; parsed: unknown }> {
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
    return { ok: res.ok, status: res.status, parsed };
  } finally {
    clearTimeout(t);
  }
}

type Agg = { display: string; occurrences: number; chatIds: Set<string> };

function pushIfString(out: string[], v: unknown): void {
  if (typeof v === "string" && v.trim()) out.push(v.trim());
}

/**
 * Somente o array/objeto `tags` no topo do chat (formato real da API Octadesk).
 */
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

function bumpFreq(
  map: Map<string, Agg>,
  strings: string[],
  chatId: string
): void {
  const seenNormInChat = new Set<string>();
  for (const s of strings) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase();
    let agg = map.get(norm);
    if (!agg) {
      agg = { display: trimmed, occurrences: 0, chatIds: new Set() };
      map.set(norm, agg);
    }
    agg.occurrences += 1;
    if (!seenNormInChat.has(norm)) {
      seenNormInChat.add(norm);
      agg.chatIds.add(chatId);
    }
  }
}

function mapToRanked(m: Map<string, Agg>) {
  return Array.from(m.entries())
    .map(([norm, a]) => ({
      label: a.display,
      norm,
      occurrences: a.occurrences,
      chats: a.chatIds.size,
    }))
    .sort((x, y) => y.chats - x.chats || y.occurrences - x.occurrences);
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { extractOctadeskTicketList } = await import("@/lib/integrations/octadesk-probe");
  const {
    collectOctadeskTagInventoryStrings,
    octadeskItemIndicatesSqlOpportunityTag,
    parseOctaDeskItem,
  } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import(
    "@/lib/desk-sql-tag-markers"
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).");
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
    console.error("Nenhum Sandbox encontrado.");
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

  const sqlMarkerStrings = await getDeskSqlTagMarkersForPartner(sandbox.id, supabase);
  const sqlTagMarkersNormalized = normalizedMarkersForScan(sqlMarkerStrings);

  const raw = Number(process.env.OCTADESK_INVENTORY_LIMIT ?? "100");
  const limit = Math.min(200, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 100));

  const list = await octaGet(baseUrl, apiToken, `/chat?page=1&limit=${limit}`, 30000);
  if (!list.ok || list.parsed == null) {
    console.error("GET /chat falhou", list.status);
    process.exit(1);
  }

  const rows = extractOctadeskTicketList(list.parsed);
  const byNorm = new Map<string, Agg>();
  const rootTagsOnly = new Map<string, Agg>();
  const topLevelKeyHits = new Map<string, number>();
  let detailsOk = 0;
  let chatsWithAnyString = 0;
  let chatsWithRootTagsStrings = 0;
  let ctwaParseOk = 0;
  let sqlMarkerChats = 0;

  const venn = {
    ctwaAndSqlMarker: [] as string[],
    ctwaOnly: [] as string[],
    sqlMarkerOnly: [] as string[],
    neither: [] as string[],
  };
  const maxIdsPerBucket = 40;
  let countCtwaAndSql = 0;
  let countCtwaOnly = 0;
  let countSqlMarkerOnly = 0;
  let countNeither = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object" || !("id" in row) || row.id == null) continue;
    const chatId = String(row.id);
    const enc = encodeURIComponent(chatId);
    await new Promise((r) => setTimeout(r, 120));

    const detail = await octaGet(baseUrl, apiToken, `/chat/${enc}`, 25000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") continue;
    detailsOk += 1;
    const item = detail.parsed as Record<string, unknown>;

    for (const k of Object.keys(item)) {
      topLevelKeyHits.set(k, (topLevelKeyHits.get(k) ?? 0) + 1);
    }

    const ctwa = Boolean(parseOctaDeskItem(item, { sqlTagMarkersNormalized }));
    const sqlM = octadeskItemIndicatesSqlOpportunityTag(item, sqlTagMarkersNormalized);
    if (ctwa) ctwaParseOk += 1;
    if (sqlM) sqlMarkerChats += 1;

    const shortId = chatId.length > 10 ? `…${chatId.slice(-8)}` : chatId;
    const pushVenn = (arr: string[]) => {
      if (arr.length < maxIdsPerBucket) arr.push(shortId);
    };
    if (ctwa && sqlM) {
      countCtwaAndSql += 1;
      pushVenn(venn.ctwaAndSqlMarker);
    } else if (ctwa) {
      countCtwaOnly += 1;
      pushVenn(venn.ctwaOnly);
    } else if (sqlM) {
      countSqlMarkerOnly += 1;
      pushVenn(venn.sqlMarkerOnly);
    } else {
      countNeither += 1;
      pushVenn(venn.neither);
    }

    const strings = collectOctadeskTagInventoryStrings(item);
    if (strings.length > 0) chatsWithAnyString += 1;
    bumpFreq(byNorm, strings, chatId);

    const fromRootTags = collectStringsFromRootTagsField(item);
    if (fromRootTags.length > 0) chatsWithRootTagsStrings += 1;
    bumpFreq(rootTagsOnly, fromRootTags, chatId);
  }

  const stringsRanked = mapToRanked(byNorm);
  const rootTagsRanked = mapToRanked(rootTagsOnly);

  const topKeys = Array.from(topLevelKeyHits.entries())
    .map(([key, count]) => ({ key, chats: count }))
    .sort((a, b) => b.chats - a.chats);

  console.log(
    JSON.stringify(
      {
        partnerSandbox: sandbox.name,
        sqlMarkersResolved: sqlMarkerStrings,
        limitRequested: limit,
        listRows: rows.length,
        detailsFetchedOk: detailsOk,
        chatsWithCtwaParsed: ctwaParseOk,
        chatsWithSqlMarkerRule: sqlMarkerChats,
        chatsWithAnyInventoryString: chatsWithAnyString,
        chatsWithRootTagsStrings,
        uniqueInventoryStrings: byNorm.size,
        uniqueRootTagStrings: rootTagsOnly.size,
        whySqlInAppIsRare:
          "Só viram lead (e podem virar SQL) conversas que passam no parse CTWA (referral source_id + ctwa_clid, etc.). " +
          "Marcador 'Oportunidade…' pode existir em chat sem CTWA: importa 0 linha no banco. " +
          "vennExactCounts.ctwaAndSqlMarker = máximo de leads que poderiam sair como SQL nesta amostra.",
        vennExactCounts: {
          ctwaAndSqlMarker: countCtwaAndSql,
          ctwaOnly: countCtwaOnly,
          sqlMarkerOnly: countSqlMarkerOnly,
          neither: countNeither,
          sumCheck: countCtwaAndSql + countCtwaOnly + countSqlMarkerOnly + countNeither,
          shouldMatchDetailsFetchedOk: detailsOk,
        },
        sampleConversationIdSuffixes: {
          ctwaAndSqlMarker: venn.ctwaAndSqlMarker,
          ctwaOnly: venn.ctwaOnly,
          sqlMarkerOnly: venn.sqlMarkerOnly,
          neither: venn.neither,
          maxListed: maxIdsPerBucket,
        },
        stringsFromRootTagsFieldOnly: rootTagsRanked,
        stringsFullInventory: stringsRanked,
        topLevelKeysOnChatDetail: topKeys,
        note:
          "chats = conversas distintas com esse texto ≥1 vez. " +
          "rootTagsFieldOnly = só extrai de item.tags (API). " +
          "fullInventory = tags + customFields + status + chaves com nome tag/label/categoria/oportunidade…",
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
