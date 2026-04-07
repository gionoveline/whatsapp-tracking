import { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { parseOctaDeskItem } from "@/lib/octadesk";
import { getMetaAccessToken } from "@/lib/get-meta-token";
import { persistParsedOctaDeskLead } from "@/lib/ingest-octadesk-lead";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { extractOctadeskTicketList } from "@/lib/integrations/octadesk-probe";

export type OctadeskChatImportSummary = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  metaTokenConfigured: boolean;
  chatsListed: number;
};

/**
 * Lista conversas via GET /chat e importa leads via GET /chat/{id} + parseOctaDeskItem.
 * Nao dispara conversao Meta (CAPI) por padrao.
 */
export async function importOctadeskChatSampleToLeads(
  partnerId: string,
  baseUrl: string,
  apiToken: string,
  limit: number
): Promise<OctadeskChatImportSummary> {
  const bu = normalizeOctadeskBaseUrl(baseUrl);
  const token = apiToken.trim();
  const summary: OctadeskChatImportSummary = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    metaTokenConfigured: Boolean(await getMetaAccessToken(partnerId)),
    chatsListed: 0,
  };

  const list = await octadeskApiGet(bu, token, `/chat?page=1&limit=${limit}`, 25000);
  if (!list.ok || !list.parsed) {
    summary.errors.push(`GET /chat falhou (HTTP ${list.status})`);
    return summary;
  }

  const chats = extractOctadeskTicketList(list.parsed);
  summary.chatsListed = chats.length;

  const sqlTagMarkersNormalized = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(partnerId));

  for (let i = 0; i < chats.length; i++) {
    const row = chats[i];
    if (!row || typeof row !== "object" || !("id" in row) || row.id == null) {
      summary.skipped += 1;
      continue;
    }
    const id = encodeURIComponent(String(row.id));
    await new Promise((r) => setTimeout(r, 120));

    const detail = await octadeskApiGet(bu, token, `/chat/${id}`, 20000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      summary.failed += 1;
      if (summary.errors.length < 12) {
        summary.errors.push(`chat ${String(row.id).slice(0, 8)}… HTTP ${detail.status}`);
      }
      continue;
    }

    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
      sqlTagMarkersNormalized,
    });
    if (!parsed) {
      summary.skipped += 1;
      continue;
    }

    const res = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: false });
    if (res.ok) {
      summary.imported += 1;
    } else {
      summary.failed += 1;
      if (summary.errors.length < 12) {
        summary.errors.push(`${parsed.conversationId.slice(0, 8)}… ${res.error}`);
      }
    }
  }

  return summary;
}
