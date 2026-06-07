import {
  buildGoogleEnhancedUserIdentifiers,
  type GoogleEnhancedUserIdentifiers,
} from "@/lib/google-enhanced-conversions";
import type { GoogleAdsClickIds } from "@/lib/google-conversions";
import type { GoogleEnhancedLeadsSettings } from "@/lib/google-enhanced-leads-settings";

export type GoogleConversionMatchMode = "click_id" | "enhanced_lead" | "none";

export type GoogleConversionMatch =
  | {
      mode: "click_id";
      field: "gclid" | "wbraid" | "gbraid";
      value: string;
    }
  | {
      mode: "enhanced_lead";
      identifiers: GoogleEnhancedUserIdentifiers;
      hasPhone: boolean;
      hasEmail: boolean;
    }
  | {
      mode: "none";
      reason: "no_click_id_or_pii" | "enhanced_disabled";
    };

function pickClickId(ids: GoogleAdsClickIds): { field: "gclid" | "wbraid" | "gbraid"; value: string } | null {
  const gclid = ids.gclid?.trim();
  const wbraid = ids.wbraid?.trim();
  const gbraid = ids.gbraid?.trim();
  if (gclid) return { field: "gclid", value: gclid };
  if (wbraid) return { field: "wbraid", value: wbraid };
  if (gbraid) return { field: "gbraid", value: gbraid };
  return null;
}

export function resolveGoogleConversionMatch(input: {
  clickIds: GoogleAdsClickIds;
  contactPhone?: string | null;
  contactEmail?: string | null;
  settings: GoogleEnhancedLeadsSettings;
}): GoogleConversionMatch {
  const click = pickClickId(input.clickIds);
  if (click) {
    return { mode: "click_id", field: click.field, value: click.value };
  }

  if (!input.settings.enabled) {
    return { mode: "none", reason: "enhanced_disabled" };
  }

  const identifiers = buildGoogleEnhancedUserIdentifiers({
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    usePhone: input.settings.usePhone,
    useEmail: input.settings.useEmail,
  });

  const hasPhone = Boolean(identifiers.hashedPhoneNumber);
  const hasEmail = Boolean(identifiers.hashedEmail);
  if (hasPhone || hasEmail) {
    return { mode: "enhanced_lead", identifiers, hasPhone, hasEmail };
  }

  return { mode: "none", reason: "no_click_id_or_pii" };
}

export function buildGoogleConversionOrderId(input: {
  googleLpProtocol?: string | null;
  conversationId?: string | null;
}): string {
  const protocol = input.googleLpProtocol?.trim();
  if (protocol) return protocol.slice(0, 128);
  const conv = input.conversationId?.trim();
  if (conv) return `conv:${conv}`.slice(0, 128);
  return `conv:unknown-${Date.now()}`.slice(0, 128);
}
