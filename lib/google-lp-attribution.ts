/** Colunas de atribuição Google copiadas de `google_lp_protocols` → `leads`. */
export type GoogleLpLeadAttribution = {
  google_lp_protocol: string;
  emr_campaign_id: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

export type GoogleLpProtocolAttributionRow = {
  protocol: string;
  emr_campaign_id?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

export function leadAttributionFromGoogleLpProtocol(
  row: GoogleLpProtocolAttributionRow
): GoogleLpLeadAttribution {
  return {
    google_lp_protocol: row.protocol,
    emr_campaign_id: row.emr_campaign_id ?? null,
    gclid: row.gclid ?? null,
    wbraid: row.wbraid ?? null,
    gbraid: row.gbraid ?? null,
    utm_source: row.utm_source ?? null,
    utm_medium: row.utm_medium ?? null,
    utm_campaign: row.utm_campaign ?? null,
    utm_content: row.utm_content ?? null,
    utm_term: row.utm_term ?? null,
  };
}

/** Lead com clique Google (gclid / wbraid / gbraid). */
export function hasGoogleAdsAttribution(
  row: Partial<Pick<GoogleLpLeadAttribution, "gclid" | "wbraid" | "gbraid">>
): boolean {
  return Boolean(row.gclid?.trim() || row.wbraid?.trim() || row.gbraid?.trim());
}

/** Lead que passou pelo `/go` (protocolo GLP-… na 1ª mensagem). */
export function isGoogleLpLead(
  row: Partial<{ google_lp_protocol?: string | null }>
): boolean {
  return Boolean(row.google_lp_protocol?.trim());
}

/** Google Ads no funil: clique OU protocolo GLP (mesmo sem gclid). */
export function isGoogleFunnelLead(
  row: Partial<LeadFunnelSourceRow>
): boolean {
  return hasGoogleAdsAttribution(row) || isGoogleLpLead(row);
}

const GOOGLE_LP_NO_CLICK_AD_ID = "google-lp-enhanced";

function googleFunnelAdIdentity(row: LeadFunnelSourceRow): { adId: string; adName: string } {
  const clickId = row.gclid?.trim() || row.wbraid?.trim() || row.gbraid?.trim();
  if (clickId) {
    const adName =
      row.utm_content?.trim() ||
      row.utm_term?.trim() ||
      (row.gclid ? `gclid …${row.gclid.slice(-10)}` : clickId);
    return { adId: clickId, adName };
  }
  if (isGoogleLpLead(row)) {
    return {
      adId: GOOGLE_LP_NO_CLICK_AD_ID,
      adName: row.utm_content?.trim() || row.utm_term?.trim() || "Google LP (sem gclid)",
    };
  }
  return { adId: "_unknown", adName: "—" };
}

export type FunnelAttributionBucket = {
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  channel: "google" | "meta";
};

export type LeadFunnelSourceRow = {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_name: string | null;
  source_id: string | null;
  emr_campaign_id?: string | null;
  google_lp_protocol?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

/** Chaves de agrupamento do funil: Google (gclid, GLP ou UTM) ou Meta (campanha/ad). */
export function resolveFunnelAttributionBucket(row: LeadFunnelSourceRow): FunnelAttributionBucket {
  if (isGoogleFunnelLead(row)) {
    const emr = row.emr_campaign_id?.trim() || row.campaign_name?.trim();
    const campaignLabel = emr
      ? emr + (row.utm_campaign?.trim() ? ` · ${row.utm_campaign.trim()}` : "")
      : row.utm_campaign?.trim() || "Google Ads";
    const medium = row.utm_medium?.trim() || "—";
    const { adId, adName } = googleFunnelAdIdentity(row);
    return {
      campaignId: `google:${campaignLabel}`,
      campaignName: campaignLabel,
      adsetId: `google-medium:${medium}`,
      adsetName: medium,
      adId,
      adName,
      channel: "google",
    };
  }

  return {
    campaignId: row.campaign_id ?? "_unknown",
    campaignName: row.campaign_name ?? "Sem campanha",
    adsetId: row.adset_id ?? "_unknown",
    adsetName: row.adset_name ?? "Sem conjunto de anúncios",
    adId: row.source_id ?? "_unknown",
    adName: row.ad_name ?? "Sem anúncio",
    channel: "meta",
  };
}

/** Preenche nomes de campanha no lead quando só há atribuição Google (sem Meta). */
export function mergeGoogleUtmIntoLeadDisplayNames(
  attribution: GoogleLpLeadAttribution,
  existing: {
    campaign_name: string | null;
    adset_name: string | null;
    ad_name: string | null;
  }
): { campaign_name: string | null; adset_name: string | null; ad_name: string | null } {
  const emr = attribution.emr_campaign_id?.trim();
  return {
    campaign_name:
      existing.campaign_name ?? (emr || attribution.utm_campaign) ?? (emr ? emr : "Google Ads"),
    adset_name: existing.adset_name ?? attribution.utm_medium,
    ad_name: existing.ad_name ?? attribution.utm_content ?? attribution.utm_term,
  };
}
