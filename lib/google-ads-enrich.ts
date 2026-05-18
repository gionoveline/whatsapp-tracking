/**
 * Enriquecimento de campanha Google Ads a partir do gclid (click_view).
 * @see https://developers.google.com/google-ads/api/docs/reporting/click-view
 */

import { getGoogleAdsAccessToken } from "@/lib/google-ads-auth";
import { googleAdsSearch, type GoogleAdsRequestContext } from "@/lib/google-ads-client";
import { getGoogleAdsCredentials } from "@/lib/google-ads-credentials";
import { supabase } from "@/lib/supabase";

export type GoogleGclidAdInfo = {
  gclid: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
};

function sanitizeGclid(gclid: string): string | null {
  const t = gclid.trim();
  if (!t || t.length > 256 || !/^[A-Za-z0-9_.-]+$/.test(t)) return null;
  return t;
}

type ClickViewRow = {
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  clickView?: { gclid?: string };
};

function parseClickViewRow(row: ClickViewRow, gclid: string): GoogleGclidAdInfo {
  return {
    gclid,
    campaignId: row.campaign?.id != null ? String(row.campaign.id) : null,
    campaignName: row.campaign?.name ?? null,
    adGroupId: row.adGroup?.id != null ? String(row.adGroup.id) : null,
    adGroupName: row.adGroup?.name ?? null,
  };
}

async function fetchGclidFromGoogleAds(
  gclid: string,
  partnerId: string
): Promise<GoogleGclidAdInfo | null> {
  const creds = await getGoogleAdsCredentials(partnerId);
  if (!creds) return null;

  const accessToken = await getGoogleAdsAccessToken(
    creds.refreshToken,
    creds.clientId,
    creds.clientSecret
  );
  if (!accessToken) return null;

  const ctx: GoogleAdsRequestContext = {
    accessToken,
    developerToken: creds.developerToken,
    customerId: creds.customerId,
    loginCustomerId: creds.loginCustomerId,
  };

  const escaped = gclid.replace(/'/g, "\\'");
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      click_view.gclid
    FROM click_view
    WHERE click_view.gclid = '${escaped}'
      AND segments.date DURING LAST_90_DAYS
    LIMIT 1
  `.trim();

  const result = await googleAdsSearch<ClickViewRow>(ctx, query);
  if (!result.ok || result.results.length === 0) return null;

  return parseClickViewRow(result.results[0], gclid);
}

/**
 * Resolve nomes de campanha/ad group para um gclid (cache → API).
 */
export async function enrichGoogleAdsFromGclid(
  partnerId: string,
  gclidRaw: string
): Promise<GoogleGclidAdInfo | null> {
  const gclid = sanitizeGclid(gclidRaw);
  if (!gclid) return null;

  const { data: cached } = await supabase
    .from("google_gclid_cache")
    .select("campaign_id, campaign_name, ad_group_id, ad_group_name")
    .eq("partner_id", partnerId)
    .eq("gclid", gclid)
    .maybeSingle();

  if (cached) {
    return {
      gclid,
      campaignId: cached.campaign_id,
      campaignName: cached.campaign_name,
      adGroupId: cached.ad_group_id,
      adGroupName: cached.ad_group_name,
    };
  }

  const fromApi = await fetchGclidFromGoogleAds(gclid, partnerId);
  if (!fromApi) return null;

  await supabase.from("google_gclid_cache").upsert(
    {
      partner_id: partnerId,
      gclid,
      campaign_id: fromApi.campaignId,
      campaign_name: fromApi.campaignName,
      ad_group_id: fromApi.adGroupId,
      ad_group_name: fromApi.adGroupName,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,gclid" }
  );

  return fromApi;
}

/** Mescla enriquecimento Google Ads nos nomes exibidos do lead (paralelo ao merge UTM). */
export function mergeGoogleAdsApiIntoLeadDisplayNames(
  enriched: GoogleGclidAdInfo,
  existing: {
    campaign_id: string | null;
    campaign_name: string | null;
    adset_id: string | null;
    adset_name: string | null;
    ad_name: string | null;
  }
): {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_name: string | null;
} {
  return {
    campaign_id: existing.campaign_id ?? enriched.campaignId,
    campaign_name: existing.campaign_name ?? enriched.campaignName,
    adset_id: existing.adset_id ?? enriched.adGroupId,
    adset_name: existing.adset_name ?? enriched.adGroupName,
    ad_name: existing.ad_name,
  };
}
