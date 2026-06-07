import { customerIdPreview, resolveGoogleAdsConversionDestination } from "@/lib/google-ads-accounts";
import type { GoogleConversionMatch } from "@/lib/google-conversion-match";
import { buildGoogleConversionOrderId } from "@/lib/google-conversion-match";
import type { OurEventKey } from "@/lib/google-conversions";
import type { GoogleEnhancedLeadsSettings } from "@/lib/google-enhanced-leads-settings";
import { supabase } from "@/lib/supabase";

export type GoogleEnhancedShadowResult =
  | {
      ok: true;
      shadow: true;
      matchMode: "enhanced_lead";
      hasPhone: boolean;
      hasEmail: boolean;
      orderId: string;
      conversionActionId: string;
      customerIdPreview: string;
      accountLabel: string | null;
    }
  | { ok: false; reason: "mapping_disabled" | "no_customer_id" | "no_credentials" | "not_enhanced_match" };

export async function persistGoogleEnhancedShadowEvent(input: {
  partnerId: string;
  leadId: string | null;
  conversationId: string | null;
  ourEvent: OurEventKey;
  match: Extract<GoogleConversionMatch, { mode: "enhanced_lead" }>;
  shadowWouldSend: boolean;
  skipReason?: string | null;
  conversionActionId?: string | null;
  customerIdPreview?: string | null;
  orderId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("google_enhanced_lead_shadow_events").insert({
    partner_id: input.partnerId,
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    our_event: input.ourEvent,
    match_mode: "enhanced_lead",
    shadow_would_send: input.shadowWouldSend,
    has_phone_identifier: input.match.hasPhone,
    has_email_identifier: input.match.hasEmail,
    skip_reason: input.skipReason ?? null,
    conversion_action_id: input.conversionActionId ?? null,
    customer_id_preview: input.customerIdPreview ?? null,
    order_id: input.orderId ?? null,
  });
  if (error) {
    console.error(
      JSON.stringify({
        event: "google_enhanced_shadow_persist_error",
        partnerId: input.partnerId,
        message: error.message,
      })
    );
  }
}

export async function tryGoogleEnhancedLeadShadow(
  ourEvent: OurEventKey,
  match: GoogleConversionMatch,
  partnerId: string,
  settings: GoogleEnhancedLeadsSettings,
  context: {
    leadId: string | null;
    conversationId: string | null;
    googleLpProtocol?: string | null;
    emrCampaignId?: string | null;
  }
): Promise<GoogleEnhancedShadowResult> {
  if (match.mode !== "enhanced_lead") {
    return { ok: false, reason: "not_enhanced_match" };
  }

  const destination = await resolveGoogleAdsConversionDestination(
    partnerId,
    ourEvent,
    context.emrCampaignId
  );

  const orderId = buildGoogleConversionOrderId({
    googleLpProtocol: context.googleLpProtocol,
    conversationId: context.conversationId,
  });

  if (!destination.ok) {
    await persistGoogleEnhancedShadowEvent({
      partnerId,
      leadId: context.leadId,
      conversationId: context.conversationId,
      ourEvent,
      match,
      shadowWouldSend: false,
      skipReason: destination.reason,
      orderId,
    });
    return { ok: false, reason: destination.reason };
  }

  const preview = customerIdPreview(destination.customerId);

  await persistGoogleEnhancedShadowEvent({
    partnerId,
    leadId: context.leadId,
    conversationId: context.conversationId,
    ourEvent,
    match,
    shadowWouldSend: true,
    conversionActionId: destination.conversionActionId,
    customerIdPreview: preview,
    orderId,
  });

  console.info(
    JSON.stringify({
      event: "google_enhanced_lead_shadow",
      partnerId,
      ourEvent,
      leadId: context.leadId,
      conversationId: context.conversationId,
      hasPhone: match.hasPhone,
      hasEmail: match.hasEmail,
      orderId,
      conversionActionId: destination.conversionActionId,
      customerIdPreview: preview,
      accountLabel: destination.accountLabel,
    })
  );

  return {
    ok: true,
    shadow: true,
    matchMode: "enhanced_lead",
    hasPhone: match.hasPhone,
    hasEmail: match.hasEmail,
    orderId,
    conversionActionId: destination.conversionActionId,
    customerIdPreview: preview,
    accountLabel: destination.accountLabel,
  };
}
