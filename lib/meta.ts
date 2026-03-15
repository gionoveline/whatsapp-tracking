/**
 * Meta Marketing API – leitura de Ad (campaign, adset, name).
 * Graph API: GET /vXX.X/{ad_id}?fields=name,campaign{id,name},adset{id,name}
 */

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

export type MetaAdInfo = {
  adId: string;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
};

export async function fetchAdInfo(adId: string, accessToken: string): Promise<MetaAdInfo | null> {
  const url = `${META_GRAPH_BASE}/${adId}?fields=name,campaign{id,name},adset{id,name}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  if (data.error) return null;

  const campaign = data.campaign as Record<string, unknown> | undefined;
  const adset = data.adset as Record<string, unknown> | undefined;

  return {
    adId: String(data.id ?? adId),
    adName: (data.name as string) ?? null,
    campaignId: campaign ? String(campaign.id ?? "") : null,
    campaignName: campaign ? (campaign.name as string) ?? null : null,
    adsetId: adset ? String(adset.id ?? "") : null,
    adsetName: adset ? (adset.name as string) ?? null : null,
  };
}
