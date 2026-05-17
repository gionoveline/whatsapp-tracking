/** Formato usado pela EMR na mensagem inicial, ex.: `ID#00111`. */
export const EMR_CAMPAIGN_ID_REGEX = /\bID#[A-Z0-9]+\b/i;

export type GoogleLpCampaignLinkRow = {
  id: string;
  partner_id: string;
  emr_campaign_id: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Resposta da API com link /go já montado para o Google Ads. */
export type GoogleLpCampaignLinkWithGoUrl = GoogleLpCampaignLinkRow & {
  go_url: string;
};

export function sanitizeEmrCampaignId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^ID#[A-Z0-9]{1,24}$/.test(normalized)) return null;
  return normalized;
}

export function extractEmrCampaignIdFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(EMR_CAMPAIGN_ID_REGEX);
  if (!match?.[0]) return null;
  return sanitizeEmrCampaignId(match[0]);
}

export function protocolTemplateUsesEmrPlaceholder(template: string): boolean {
  return /\{\{\s*emr_(campaign_)?id\s*\}\}/i.test(template);
}

export function buildGoogleLpGoUrl(
  origin: string,
  partnerId: string,
  emrCampaignId: string,
  options?: { next?: string }
): string {
  const base = origin.trim().replace(/\/$/, "");
  const url = new URL("/go", base || "http://localhost");
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("emr_id", emrCampaignId);
  if (options?.next?.trim()) url.searchParams.set("next", options.next.trim());
  return url.toString();
}

export function readEmrCampaignIdFromSearchParams(
  searchParams: URLSearchParams
): string | null {
  for (const key of ["emr_id", "emr_campaign_id", "campaign_id"]) {
    const v = searchParams.get(key);
    const sanitized = sanitizeEmrCampaignId(v);
    if (sanitized) return sanitized;
  }
  return null;
}
