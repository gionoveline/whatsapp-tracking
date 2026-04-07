import { normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { deskTagTextMatchesSqlMarkers } from "@/lib/octadesk";
import { collectOctadeskTagInventoryStrings } from "@/lib/octadesk";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { collectStringsFromRootTagsField } from "@/lib/octadesk-root-tags";

const DETAIL_MS = 18_000;
const GAP_MS = 100;

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

  for (const convId of input.conversationIds) {
    const trimmed = convId.trim();
    if (!trimmed) continue;
    const cid = encodeURIComponent(trimmed);
    await new Promise((r) => setTimeout(r, GAP_MS));
    const d = await octadeskApiGet(input.baseUrl, input.apiToken, `/chat/${cid}`, DETAIL_MS);
    chatsScanned += 1;
    if (!d.ok || !d.parsed || typeof d.parsed !== "object") {
      fetchFailed += 1;
      continue;
    }
    const parsedObj = d.parsed as Record<string, unknown>;
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
