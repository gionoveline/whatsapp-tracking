import type { SupabaseClient } from "@supabase/supabase-js";
import {
  protocolTemplateUsesEmrPlaceholder,
  sanitizeEmrCampaignId,
} from "@/lib/google-lp-campaign-links";

export async function resolveEmrCampaignForGo(
  supabase: SupabaseClient,
  partnerId: string,
  rawEmrId: string | null,
  template: string
): Promise<
  | { ok: true; emrCampaignId: string | null }
  | { ok: false; error: string; status: 400 | 403 | 503 }
> {
  const needsEmr = protocolTemplateUsesEmrPlaceholder(template);
  const emrCampaignId = rawEmrId ? sanitizeEmrCampaignId(rawEmrId) : null;

  if (rawEmrId && !emrCampaignId) {
    return { ok: false, error: "Invalid emr_id format (expected ID#…)", status: 400 };
  }
  if (needsEmr && !emrCampaignId) {
    return { ok: false, error: "emr_id is required for this message template", status: 400 };
  }
  if (!emrCampaignId) return { ok: true, emrCampaignId: null };

  const { data, error } = await supabase
    .from("google_lp_campaign_links")
    .select("emr_campaign_id")
    .eq("partner_id", partnerId)
    .eq("emr_campaign_id", emrCampaignId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false, error: "Service unavailable", status: 503 };
  if (!data) {
    return { ok: false, error: "Unknown or inactive EMR campaign id", status: 403 };
  }

  return { ok: true, emrCampaignId };
}
