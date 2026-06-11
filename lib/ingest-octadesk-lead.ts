import type { ParsedLeadFromOctaDesk } from "@/lib/octadesk";
import {
  enrichGoogleAdsFromGclid,
  mergeGoogleAdsApiIntoLeadDisplayNames,
} from "@/lib/google-ads-enrich";
import {
  leadAttributionFromGoogleLpProtocol,
  mergeGoogleUtmIntoLeadDisplayNames,
} from "@/lib/google-lp-attribution";
import {
  isGoogleSqlConversionSkipped,
  isGoogleConversionsSkipped,
  trySendGoogleMatchedConversion,
  type OurEventKey as GoogleOurEventKey,
  type TrySendGoogleConversionResult,
  googleAdsClickIdsFromRow,
  type GoogleAdsClickIds,
} from "@/lib/google-conversions";
import { resolveGoogleConversionMatch, buildGoogleConversionOrderId } from "@/lib/google-conversion-match";
import { getGoogleEnhancedLeadsSettings } from "@/lib/google-enhanced-leads-settings";
import type { GoogleEnhancedShadowResult } from "@/lib/google-enhanced-lead-shadow";
import { dispatchGoogleSqlConversion } from "@/lib/google-sql-dispatch";
import { fetchAdInfo } from "@/lib/meta";
import { getMetaAccessToken } from "@/lib/get-meta-token";
import { trySendMetaConversion, type OurEventKey } from "@/lib/meta-conversions";
import { parseIsoDatetime } from "@/lib/request-security";
import { supabase } from "@/lib/supabase";
import type { LeadRow } from "@/lib/supabase";
import { logApiError } from "@/lib/api-errors";

export type PersistOctaDeskLeadResult =
  | {
      ok: true;
      conversationId: string;
      leadId: string;
      status: LeadRow["status"];
      metaDispatches: MetaDispatchLog[];
      googleDispatches: GoogleDispatchLog[];
      googleLpProtocolMatched: boolean;
    }
  | { ok: false; error: string; conversationId?: string };

export type MetaDispatchLog = {
  ourEvent: OurEventKey;
  attempted: boolean;
  ok: boolean;
  eventName?: string;
  reason?: string;
  error?: string;
};

export type GoogleDispatchLog = {
  ourEvent: GoogleOurEventKey;
  attempted: boolean;
  ok: boolean;
  conversionActionId?: string;
  customerIdPreview?: string;
  accountLabel?: string | null;
  reason?: string;
  error?: string;
  matchMode?: "click_id" | "enhanced_lead" | "none";
  shadow?: boolean;
  enhancedPhone?: boolean;
  enhancedEmail?: boolean;
};

function pushGoogleShadowDispatchLog(
  dispatches: GoogleDispatchLog[],
  ourEvent: GoogleOurEventKey,
  outcome: GoogleEnhancedShadowResult
): void {
  if (!outcome.ok) {
    dispatches.push({
      ourEvent,
      attempted: false,
      ok: false,
      matchMode: "enhanced_lead",
      shadow: true,
      reason: outcome.reason,
    });
    return;
  }
  dispatches.push({
    ourEvent,
    attempted: false,
    ok: true,
    shadow: true,
    matchMode: "enhanced_lead",
    enhancedPhone: outcome.hasPhone,
    enhancedEmail: outcome.hasEmail,
    conversionActionId: outcome.conversionActionId,
    customerIdPreview: outcome.customerIdPreview,
    accountLabel: outcome.accountLabel,
  });
}

function pushGoogleDispatchLog(dispatches: GoogleDispatchLog[], ourEvent: GoogleOurEventKey, outcome: TrySendGoogleConversionResult): void {
  if (outcome.ok) {
    dispatches.push({
      ourEvent,
      attempted: true,
      ok: true,
      matchMode: outcome.matchMode,
      enhancedPhone: outcome.enhancedPhone,
      enhancedEmail: outcome.enhancedEmail,
      conversionActionId: outcome.conversionActionId,
      customerIdPreview: outcome.customerIdPreview,
      accountLabel: outcome.accountLabel,
    });
    return;
  }
  if (outcome.reason === "send_failed") {
    dispatches.push({
      ourEvent,
      attempted: true,
      ok: false,
      matchMode: outcome.matchMode,
      conversionActionId: outcome.conversionActionId,
      customerIdPreview: outcome.customerIdPreview,
      accountLabel: outcome.accountLabel,
      reason: outcome.reason,
      error: outcome.error,
    });
    return;
  }
  dispatches.push({
    ourEvent,
    attempted: false,
    ok: false,
    matchMode: outcome.matchMode,
    reason: outcome.reason,
  });
}

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
  if (!parsed.googleLpProtocol && (!parsed.headline?.trim() || !parsed.sourceUrl?.trim())) {
    return { ok: false, error: "headline and source_url are required unless googleLpProtocol is present", conversationId: parsed.conversationId };
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
    .select("status, google_sql_sent_at, gclid, wbraid, gbraid, google_lp_protocol, emr_campaign_id")
    .eq("partner_id", partnerId)
    .eq("conversation_id", parsed.conversationId)
    .maybeSingle();

  const existingStatus = (existingRow?.status as LeadRow["status"] | undefined) ?? null;
  const existingGoogleSqlSentAt =
    typeof existingRow?.google_sql_sent_at === "string" ? existingRow.google_sql_sent_at : null;
  const isNewConversation = existingRow == null;
  const nextStatus = resolveStatusAfterLeadIngest(existingStatus, parsed.hasSqlOpportunityTag);
  const metaDispatches: MetaDispatchLog[] = [];
  const googleDispatches: GoogleDispatchLog[] = [];

  const protocolKey =
    parsed.googleLpProtocol?.trim() ||
    (typeof existingRow?.google_lp_protocol === "string" ? existingRow.google_lp_protocol.trim() : "") ||
    null;
  const isGoogleLpLead = Boolean(protocolKey);

  let googleAttribution: ReturnType<typeof leadAttributionFromGoogleLpProtocol> | null = null;
  if (protocolKey) {
    const { data: protocolRow, error: protocolFetchError } = await supabase
      .from("google_lp_protocols")
      .select(
        "protocol, emr_campaign_id, gclid, wbraid, gbraid, utm_source, utm_medium, utm_campaign, utm_content, utm_term"
      )
      .eq("partner_id", partnerId)
      .eq("protocol", protocolKey)
      .maybeSingle();

    if (protocolFetchError) {
      logApiError("ingest-octadesk-lead:google-lp-protocol-fetch", protocolFetchError);
    } else if (protocolRow) {
      googleAttribution = leadAttributionFromGoogleLpProtocol(protocolRow);
    }
  }

  const googleSqlClickIds: GoogleAdsClickIds = googleAdsClickIdsFromRow({
    gclid: googleAttribution?.gclid ?? existingRow?.gclid ?? null,
    wbraid: googleAttribution?.wbraid ?? existingRow?.wbraid ?? null,
    gbraid: googleAttribution?.gbraid ?? existingRow?.gbraid ?? null,
  });

  if (googleAttribution?.gclid) {
    const googleEnriched = await enrichGoogleAdsFromGclid(partnerId, googleAttribution.gclid);
    if (googleEnriched) {
      const merged = mergeGoogleAdsApiIntoLeadDisplayNames(googleEnriched, {
        campaign_id: campaignId,
        campaign_name: campaignName,
        adset_id: adsetId,
        adset_name: adsetName,
        ad_name: adName,
      });
      campaignId = merged.campaign_id;
      campaignName = merged.campaign_name;
      adsetId = merged.adset_id;
      adsetName = merged.adset_name;
      adName = merged.ad_name;
    }
  }

  const displayNames = googleAttribution
    ? mergeGoogleUtmIntoLeadDisplayNames(googleAttribution, {
        campaign_name: campaignName,
        adset_name: adsetName,
        ad_name: adName,
      })
    : { campaign_name: campaignName, adset_name: adsetName, ad_name: adName };

  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(
      {
        conversation_id: parsed.conversationId,
        partner_id: partnerId,
        contact_name: parsed.contactName,
        contact_phone: parsed.contactPhone,
        contact_email: parsed.contactEmail,
        source_id: parsed.sourceId,
        ctwa_clid: parsed.ctwaClid,
        headline: parsed.headline,
        ad_body: parsed.adBody,
        image_url: parsed.imageUrl,
        source_url: parsed.sourceUrl,
        campaign_id: campaignId,
        campaign_name: displayNames.campaign_name,
        adset_id: adsetId,
        adset_name: displayNames.adset_name,
        ad_name: displayNames.ad_name,
        ...(googleAttribution ?? {}),
        emr_campaign_id:
          googleAttribution?.emr_campaign_id ?? parsed.emrCampaignId ?? null,
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

  let googleLpProtocolMatched = false;
  if (parsed.googleLpProtocol) {
    const { data: matchedRows, error: matchError } = await supabase
      .from("google_lp_protocols")
      .update({
        matched_lead_id: lead.id,
        matched_at: new Date().toISOString(),
      })
      .eq("partner_id", partnerId)
      .eq("protocol", parsed.googleLpProtocol)
      .is("matched_lead_id", null)
      .select("id");

    if (matchError) {
      logApiError("ingest-octadesk-lead:google-lp-protocol-match", matchError);
    } else {
      googleLpProtocolMatched = (matchedRows?.length ?? 0) > 0;
    }
  }

  const eventTimeMs = new Date(occurredAt).getTime();
  const eventTimeSec = Number.isNaN(eventTimeMs)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(eventTimeMs / 1000);

  const emrCampaignIdForGoogle =
    googleAttribution?.emr_campaign_id ??
    parsed.emrCampaignId ??
    (typeof existingRow?.emr_campaign_id === "string" ? existingRow.emr_campaign_id : null);

  const enhancedSettings = await getGoogleEnhancedLeadsSettings(partnerId);
  const googleConversionMatch = resolveGoogleConversionMatch({
    clickIds: googleSqlClickIds,
    contactPhone: parsed.contactPhone,
    contactEmail: parsed.contactEmail,
    settings: enhancedSettings,
  });

  // Evita duplicidade no CAPI em reprocessamentos/sincronizacoes da mesma conversa.
  if (sendMetaConversion && isNewConversation && !isGoogleLpLead) {
    const outcome = await trySendMetaConversion("lead", parsed.ctwaClid ?? null, partnerId, { eventTime: eventTimeSec });
    if (outcome.ok) {
      metaDispatches.push({ ourEvent: "lead", attempted: true, ok: true, eventName: outcome.eventName });
    } else if (outcome.reason === "send_failed") {
      metaDispatches.push({
        ourEvent: "lead",
        attempted: true,
        ok: false,
        eventName: outcome.eventName,
        reason: outcome.reason,
        error: outcome.error,
      });
    } else {
      metaDispatches.push({ ourEvent: "lead", attempted: false, ok: false, reason: outcome.reason });
    }
  }

  if (
    sendMetaConversion &&
    isNewConversation &&
    !isGoogleConversionsSkipped() &&
    isGoogleLpLead &&
    googleConversionMatch.mode !== "none"
  ) {
    const orderId = buildGoogleConversionOrderId({
      googleLpProtocol: protocolKey,
      conversationId: parsed.conversationId,
    });
    const googleLeadOutcome = await trySendGoogleMatchedConversion(
      "lead",
      googleConversionMatch,
      partnerId,
      {
        eventTimeIso: new Date(eventTimeSec * 1000).toISOString(),
        emrCampaignId: emrCampaignIdForGoogle,
        orderId,
      }
    );
    pushGoogleDispatchLog(googleDispatches, "lead", googleLeadOutcome);
  }

  // SQL qualificado: envia quando vira SQL ou quando ainda não registrou envio OK ao Google (retry após falha).
  const becameSql =
    lead.status === "sql" && existingStatus !== "sql" && existingStatus !== "venda";
  const shouldSendGoogleSql =
    lead.status === "sql" &&
    isGoogleLpLead &&
    googleConversionMatch.mode !== "none" &&
    (becameSql || !existingGoogleSqlSentAt);
  const skipSqlMetaForScript =
    process.env.SYNC_SKIP_SQL_META === "1" || process.env.SYNC_SKIP_SQL_META === "true";
  if (sendMetaConversion && becameSql && !skipSqlMetaForScript && !isGoogleLpLead) {
    const outcome = await trySendMetaConversion("sql", parsed.ctwaClid ?? null, partnerId, { eventTime: eventTimeSec });
    if (outcome.ok) {
      metaDispatches.push({ ourEvent: "sql", attempted: true, ok: true, eventName: outcome.eventName });
    } else if (outcome.reason === "send_failed") {
      metaDispatches.push({
        ourEvent: "sql",
        attempted: true,
        ok: false,
        eventName: outcome.eventName,
        reason: outcome.reason,
        error: outcome.error,
      });
    } else {
      metaDispatches.push({ ourEvent: "sql", attempted: false, ok: false, reason: outcome.reason });
    }
  }

  if (shouldSendGoogleSql && !isGoogleSqlConversionSkipped()) {
    const dispatchResult = await dispatchGoogleSqlConversion(
      partnerId,
      {
        id: lead.id,
        conversation_id: lead.conversation_id,
        contact_phone: parsed.contactPhone,
        contact_email: parsed.contactEmail,
        google_lp_protocol: protocolKey,
        emr_campaign_id: emrCampaignIdForGoogle,
        google_sql_sent_at: existingGoogleSqlSentAt,
        gclid: googleSqlClickIds.gclid ?? null,
        wbraid: googleSqlClickIds.wbraid ?? null,
        gbraid: googleSqlClickIds.gbraid ?? null,
      },
      { eventTimeIso: new Date(eventTimeSec * 1000).toISOString() }
    );

    if (dispatchResult.kind === "shadow") {
      pushGoogleShadowDispatchLog(googleDispatches, "sql", dispatchResult.outcome);
    } else if (dispatchResult.kind === "live") {
      pushGoogleDispatchLog(googleDispatches, "sql", dispatchResult.outcome);
    }
  }

  return {
    ok: true,
    conversationId: lead.conversation_id,
    leadId: lead.id,
    status: lead.status as LeadRow["status"],
    metaDispatches,
    googleDispatches,
    googleLpProtocolMatched,
  };
}
