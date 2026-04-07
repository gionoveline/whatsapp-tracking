import { normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { deskTagTextMatchesSqlMarkers } from "@/lib/octadesk";
import { collectOctadeskTagInventoryStrings } from "@/lib/octadesk";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { unwrapOctadeskChatDetail } from "@/lib/integrations/octadesk-probe";
import { collectStringsFromRootTagsField } from "@/lib/octadesk-root-tags";

const DETAIL_MS = 18_000;
/** Lotes pequenos evitam 500×delay sequencial (estourava timeout) sem martelar a API. */
const BATCH_SIZE = 5;
const BETWEEN_BATCHES_MS = 40;

export type SandboxNonSqlTagRow = { tag: string; chatCount: number; matchesSqlMarker: boolean };

/**
 * Inventario de tags no campo raiz `item.tags` para conversas ainda `lead` no app (diagnostico Sandbox).
 */
export async function inventorySandboxNonSqlRootTags(input: {
  baseUrl: string;
  apiToken: string;
  conversationIds: string[];
  sqlMarkers: readonly string[];
}): Promise<{
  chatsScanned: number;
  fetchFailed: number;
  chatsWithEmptyRootTags: number;
  octadeskLeadChats: number;
  octadeskSqlChats: number;
  uniqueTagsRanked: SandboxNonSqlTagRow[];
  tagsNotMatchingSqlMarkers: { tag: string; chatCount: number }[];
}> {
  const sqlNorm = normalizedMarkersForScan(input.sqlMarkers);
  const tagFreq = new Map<string, { display: string; chats: Set<string> }>();

  let fetchFailed = 0;
  let chatsWithEmptyRootTags = 0;
  let chatsScanned = 0;
  let octadeskLeadChats = 0;
  let octadeskSqlChats = 0;

  const ids = input.conversationIds.map((c) => c.trim()).filter(Boolean);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (trimmed) => {
        const cid = encodeURIComponent(trimmed);
        const d = await octadeskApiGet(input.baseUrl, input.apiToken, `/chat/${cid}`, DETAIL_MS);
        return { trimmed, d };
      })
    );

    for (const { trimmed, d } of batchResults) {
      chatsScanned += 1;
      if (!d.ok || !d.parsed || typeof d.parsed !== "object") {
        fetchFailed += 1;
        continue;
      }
      const parsedObj = unwrapOctadeskChatDetail(d.parsed) ?? (d.parsed as Record<string, unknown>);
      const rootTags = collectStringsFromRootTagsField(parsedObj);
      const tags = rootTags.length > 0 ? rootTags : collectOctadeskTagInventoryStrings(parsedObj);
      if (tags.length === 0) {
        chatsWithEmptyRootTags += 1;
        continue;
      }
      const chatIsSql = tags.some((t) => deskTagTextMatchesSqlMarkers(t, sqlNorm));
      if (chatIsSql) octadeskSqlChats += 1;
      else octadeskLeadChats += 1;

      const seenNorm = new Set<string>();
      for (const raw of tags) {
        const norm = raw.trim().toLowerCase();
        if (!norm || seenNorm.has(norm)) continue;
        seenNorm.add(norm);
        let agg = tagFreq.get(norm);
        if (!agg) {
          agg = { display: raw.trim(), chats: new Set() };
          tagFreq.set(norm, agg);
        }
        agg.chats.add(trimmed);
      }
    }

    if (i + BATCH_SIZE < ids.length) {
      await new Promise((r) => setTimeout(r, BETWEEN_BATCHES_MS));
    }
  }

  const uniqueTagsRanked: SandboxNonSqlTagRow[] = Array.from(tagFreq.values())
    .map((a) => {
      const matchesSqlMarker = deskTagTextMatchesSqlMarkers(a.display, sqlNorm);
      return {
        tag: a.display,
        chatCount: a.chats.size,
        matchesSqlMarker,
      };
    })
    .sort((x, y) => y.chatCount - x.chatCount);

  const tagsNotMatchingSqlMarkers = uniqueTagsRanked
    .filter((t) => !t.matchesSqlMarker)
    .map(({ tag, chatCount }) => ({ tag, chatCount }));

  return {
    chatsScanned,
    fetchFailed,
    chatsWithEmptyRootTags,
    octadeskLeadChats,
    octadeskSqlChats,
    uniqueTagsRanked,
    tagsNotMatchingSqlMarkers,
  };
}
