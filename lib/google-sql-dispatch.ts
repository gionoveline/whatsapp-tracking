import { buildGoogleConversionOrderId, resolveGoogleConversionMatch } from "@/lib/google-conversion-match";
import { buildGoogleEnhancedUserIdentifiers } from "@/lib/google-enhanced-conversions";
import {
  googleAdsClickIdsFromRow,
  isGoogleSqlConversionSkipped,
  trySendGoogleMatchedConversion,
  type GoogleAdsClickIds,
} from "@/lib/google-conversions";
import {
  getGoogleEnhancedLeadsSettings,
  isGoogleEnhancedLeadsLiveSendBlocked,
} from "@/lib/google-enhanced-leads-settings";
import { tryGoogleEnhancedLeadShadow, type GoogleEnhancedShadowResult } from "@/lib/google-enhanced-lead-shadow";
import { markGoogleSqlConversionSent } from "@/lib/google-sql-sent";
import type { TrySendGoogleConversionResult } from "@/lib/google-conversions";

export type GoogleSqlDispatchResult =
  | { kind: "skipped"; reason: string; matchMode?: string }
  | { kind: "shadow"; outcome: GoogleEnhancedShadowResult }
  | { kind: "live"; outcome: TrySendGoogleConversionResult };

export type GoogleSqlLeadContext = {
  id: string;
  conversation_id: string;
  contact_phone: string | null;
  contact_email: string | null;
  google_lp_protocol: string | null;
  emr_campaign_id: string | null;
  google_sql_sent_at: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
};

export async function dispatchGoogleSqlConversion(
  partnerId: string,
  lead: GoogleSqlLeadContext,
  options: { eventTimeIso: string; skipIfAlreadySent?: boolean }
): Promise<GoogleSqlDispatchResult> {
  if (options.skipIfAlreadySent !== false && lead.google_sql_sent_at) {
    return { kind: "skipped", reason: "already_sent" };
  }
  if (!lead.google_lp_protocol?.trim()) {
    return { kind: "skipped", reason: "not_google_lp" };
  }
  if (isGoogleSqlConversionSkipped()) {
    return { kind: "skipped", reason: "skipped_by_env" };
  }

  const enhancedSettings = await getGoogleEnhancedLeadsSettings(partnerId);
  const clickIds: GoogleAdsClickIds = googleAdsClickIdsFromRow(lead);
  const match = resolveGoogleConversionMatch({
    clickIds,
    contactPhone: lead.contact_phone,
    contactEmail: lead.contact_email,
    settings: enhancedSettings,
  });

  if (match.mode === "none") {
    return { kind: "skipped", reason: "no_match", matchMode: "none" };
  }

  const orderId = buildGoogleConversionOrderId({
    googleLpProtocol: lead.google_lp_protocol,
    conversationId: lead.conversation_id,
  });

  if (match.mode === "enhanced_lead" && isGoogleEnhancedLeadsLiveSendBlocked(enhancedSettings)) {
    const shadowOutcome = await tryGoogleEnhancedLeadShadow("sql", match, partnerId, enhancedSettings, {
      leadId: lead.id,
      conversationId: lead.conversation_id,
      googleLpProtocol: lead.google_lp_protocol,
      emrCampaignId: lead.emr_campaign_id,
    });
    return { kind: "shadow", outcome: shadowOutcome };
  }

  const supplementaryIdentifiers =
    match.mode === "click_id" && enhancedSettings.enabled && enhancedSettings.usePhone
      ? buildGoogleEnhancedUserIdentifiers({
          contactPhone: lead.contact_phone,
          usePhone: true,
          useEmail: false,
        })
      : undefined;

  const outcome = await trySendGoogleMatchedConversion("sql", match, partnerId, {
    eventTimeIso: options.eventTimeIso,
    emrCampaignId: lead.emr_campaign_id,
    orderId,
    supplementaryIdentifiers,
  });

  if (outcome.ok && outcome.matchMode) {
    await markGoogleSqlConversionSent(lead.id, outcome.matchMode);
  }

  return { kind: "live", outcome };
}
