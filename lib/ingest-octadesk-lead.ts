import type { ParsedLeadFromOctaDesk } from "@/lib/octadesk";
import { fetchAdInfo } from "@/lib/meta";
import { getMetaAccessToken } from "@/lib/get-meta-token";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";
import { parseIsoDatetime } from "@/lib/request-security";
import { supabase } from "@/lib/supabase";
import type { LeadRow } from "@/lib/supabase";
import { logApiError } from "@/lib/api-errors";

export type PersistOctaDeskLeadResult =
  | { ok: true; conversationId: string; leadId: string; status: LeadRow["status"] }
  | { ok: false; error: string; conversationId?: string };

function resolveStatusAfterLeadIngest(
  existing: LeadRow["status"] | null,
  hasSqlOpportunityTag: boolean
): LeadRow["status"] {
  if (existing === "venda") return "venda";
  if (hasSqlOpportunityTag || existing === "sql") return "sql";
  return "lead";
}

/**
 * Mesma persistencia do webhook /api/webhooks/lead (enriquecimento Meta + upsert leads).
 */
export async function persistParsedOctaDeskLead(
  partnerId: string,
  parsed: ParsedLeadFromOctaDesk,
  options: { sendMetaConversion?: boolean } = {}
): Promise<PersistOctaDeskLeadResult> {
  const sendMetaConversion = options.sendMetaConversion !== false;

  if (!parsed.contactPhone?.trim()) {
    return { ok: false, error: "contact_phone is required", conversationId: parsed.conversationId };
  }
  if (!parsed.headline?.trim() || !parsed.sourceUrl?.trim()) {
    return { ok: false, error: "headline and source_url are required", conversationId: parsed.conversationId };
  }
  const occurredAt = parsed.createdAt ? parseIsoDatetime(parsed.createdAt) : null;
  if (!occurredAt) {
    return { ok: false, error: "createdAt is required and must be a valid ISO datetime", conversationId: parsed.conversationId };
  }

  const token = await getMetaAccessToken(partnerId);
  let campaignId: string | null = null;
  let campaignName: string | null = null;
  let adsetId: string | null = null;
  let adsetName: string | null = null;
  let adName: string | null = null;

  if (parsed.sourceId && token) {
    const { data: cached } = await supabase
      .from("meta_ad_cache")
      .select("ad_name, campaign_id, campaign_name, adset_id, adset_name")
      .eq("partner_id", partnerId)
      .eq("ad_id", parsed.sourceId)
      .single();

    if (cached) {
      adName = cached.ad_name;
      campaignId = cached.campaign_id;
      campaignName = cached.campaign_name;
      adsetId = cached.adset_id;
      adsetName = cached.adset_name;
    } else {
      const meta = await fetchAdInfo(parsed.sourceId, token);
      if (meta) {
        adName = meta.adName;
        campaignId = meta.campaignId;
        campaignName = meta.campaignName;
        adsetId = meta.adsetId;
        adsetName = meta.adsetName;
        await supabase.from("meta_ad_cache").upsert(
          {
            partner_id: partnerId,
            ad_id: parsed.sourceId,
            ad_name: meta.adName,
            campaign_id: meta.campaignId,
            campaign_name: meta.campaignName,
            adset_id: meta.adsetId,
            adset_name: meta.adsetName,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "partner_id,ad_id" }
        );
      }
    }
  }

  const { data: existingRow } = await supabase
    .from("leads")
    .select("status")
    .eq("partner_id", partnerId)
    .eq("conversation_id", parsed.conversationId)
    .maybeSingle();

  const existingStatus = (existingRow?.status as LeadRow["status"] | undefined) ?? null;
  const nextStatus = resolveStatusAfterLeadIngest(existingStatus, parsed.hasSqlOpportunityTag);

  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(
      {
        conversation_id: parsed.conversationId,
        partner_id: partnerId,
        contact_name: parsed.contactName,
        contact_phone: parsed.contactPhone,
        source_id: parsed.sourceId,
        ctwa_clid: parsed.ctwaClid,
        headline: parsed.headline,
        ad_body: parsed.adBody,
        image_url: parsed.imageUrl,
        source_url: parsed.sourceUrl,
        campaign_id: campaignId,
        campaign_name: campaignName,
        adset_id: adsetId,
        adset_name: adsetName,
        ad_name: adName,
        status: nextStatus,
        created_at: occurredAt,
        updated_at: occurredAt,
      },
      { onConflict: "partner_id,conversation_id" }
    )
    .select("id, conversation_id, status")
    .single();

  if (error) {
    logApiError("ingest-octadesk-lead", error);
    return { ok: false, error: "Failed to save lead", conversationId: parsed.conversationId };
  }

  if (sendMetaConversion) {
    await maybeSendMetaConversion("lead", parsed.ctwaClid ?? null, partnerId);
  }

  return {
    ok: true,
    conversationId: lead.conversation_id,
    leadId: lead.id,
    status: lead.status as LeadRow["status"],
  };
}
