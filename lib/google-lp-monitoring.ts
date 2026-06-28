import { GOOGLE_LP_PROTOCOL_REGEX } from "@/lib/google-lp-protocol";
import { isWciSmokeTestGclid } from "@/lib/google-wci-smoke-test";

export const MESSAGE_PREVIEW_MAX = 120;

export type GoogleLpProtocolRow = {
  id: string;
  created_at: string;
  protocol: string;
  message: string;
  emr_campaign_id: string | null;
  capture_source: string | null;
  gclid: string | null;
  utm_campaign: string | null;
  matched_lead_id: string | null;
  matched_at: string | null;
};

export type GoogleLpMatchedLeadRow = {
  id: string;
  created_at: string;
  google_lp_protocol: string | null;
  emr_campaign_id: string | null;
  gclid: string | null;
  contact_phone: string | null;
};

export type GoogleLpCaptureChecks = {
  hasGclid: boolean;
  hasEmr: boolean;
  messageHasProtocol: boolean;
  leadGclidMatches: boolean | null;
};

export type GoogleLpCaptureEvent = {
  id: string;
  createdAt: string;
  protocol: string;
  messagePreview: string;
  emrCampaignId: string | null;
  captureSource: string | null;
  gclid: string | null;
  utmCampaign: string | null;
  matchedLeadId: string | null;
  matchedAt: string | null;
  status: "awaiting_whatsapp" | "linked";
  lead?: {
    id: string;
    gclid: string | null;
    googleLpProtocol: string | null;
    contactPhone: string | null;
    createdAt: string;
  };
  checks: GoogleLpCaptureChecks;
};

/** Percentual mínimo de cliques /go com gclid para não exibir alerta (0–100). */
export const GOOGLE_LP_GCLID_RATE_ALERT_THRESHOLD = 15;

export type GoogleLpCaptureSummary = {
  windowHours: number;
  protocolsTotal: number;
  withGclid: number;
  withEmr: number;
  matched: number;
  wciExtension: number;
  landing: number;
  leadsWithGclidInWindow: number;
  gclidRatePercent: number | null;
  gclidRateLow: boolean;
};

export type GoogleLpMonitoringSourceFilter = "all" | "wci_extension" | "landing" | "direct_go" | "google_lp";

export type GoogleWciCaptureSummary = {
  windowHours: number;
  wciClicks: number;
  withGclid: number;
  withEmr: number;
  linked: number;
  awaitingWhatsApp: number;
  smokeTests: number;
  productionClicks: number;
  linkRatePercent: number | null;
  hasClicksWithoutLead: boolean;
};

export type GoogleLpMonitoringResponse = {
  summary: GoogleLpCaptureSummary;
  wciSummary?: GoogleWciCaptureSummary;
  events: GoogleLpCaptureEvent[];
};

export function parseMonitoringSourceFilter(raw: string | null): GoogleLpMonitoringSourceFilter {
  const v = raw?.trim().toLowerCase();
  if (v === "wci" || v === "wci_extension") return "wci_extension";
  if (v === "google_lp" || v === "lp") return "google_lp";
  if (v === "landing") return "landing";
  if (v === "direct_go" || v === "direct") return "direct_go";
  return "all";
}

export function filterProtocolsBySource(
  protocols: GoogleLpProtocolRow[],
  source: GoogleLpMonitoringSourceFilter
): GoogleLpProtocolRow[] {
  if (source === "all") return protocols;
  if (source === "google_lp") {
    return protocols.filter((p) => p.capture_source !== "wci_extension");
  }
  return protocols.filter((p) => p.capture_source === source);
}

export function buildWciCaptureSummary(windowHours: number, wciProtocols: GoogleLpProtocolRow[]): GoogleWciCaptureSummary {
  const wciClicks = wciProtocols.length;
  const withGclid = wciProtocols.filter((p) => p.gclid?.trim()).length;
  const linked = wciProtocols.filter((p) => p.matched_lead_id).length;
  const smokeTests = wciProtocols.filter((p) => isWciSmokeTestGclid(p.gclid)).length;
  const productionClicks = wciClicks - smokeTests;
  const linkRatePercent =
    productionClicks > 0 ? Math.round((linked / productionClicks) * 1000) / 10 : null;

  return {
    windowHours,
    wciClicks,
    withGclid,
    withEmr: wciProtocols.filter((p) => p.emr_campaign_id?.trim()).length,
    linked,
    awaitingWhatsApp: wciClicks - linked,
    smokeTests,
    productionClicks,
    linkRatePercent,
    hasClicksWithoutLead: productionClicks > 0 && linked === 0,
  };
}

export function clampMonitoringHours(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n) || n < 1) return 24;
  return Math.min(n, 168);
}

export function clampMonitoringLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n) || n < 1) return 50;
  return Math.min(n, 100);
}

export function monitoringSinceIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function truncateMessagePreview(message: string): string {
  const t = message.trim();
  if (t.length <= MESSAGE_PREVIEW_MAX) return t;
  return `${t.slice(0, MESSAGE_PREVIEW_MAX)}…`;
}

export function buildCaptureChecks(
  row: GoogleLpProtocolRow,
  lead: GoogleLpMatchedLeadRow | undefined
): GoogleLpCaptureChecks {
  const hasGclid = Boolean(row.gclid?.trim());
  const hasEmr = Boolean(row.emr_campaign_id?.trim());
  const messageHasProtocol = GOOGLE_LP_PROTOCOL_REGEX.test(row.message ?? "");

  let leadGclidMatches: boolean | null = null;
  if (lead) {
    const protocolGclid = row.gclid?.trim() ?? "";
    const leadGclid = lead.gclid?.trim() ?? "";
    if (!protocolGclid && !leadGclid) leadGclidMatches = true;
    else if (!protocolGclid || !leadGclid) leadGclidMatches = false;
    else leadGclidMatches = protocolGclid === leadGclid;
  }

  return { hasGclid, hasEmr, messageHasProtocol, leadGclidMatches };
}

export function mapProtocolToEvent(
  row: GoogleLpProtocolRow,
  leadById: Map<string, GoogleLpMatchedLeadRow>
): GoogleLpCaptureEvent {
  const lead = row.matched_lead_id ? leadById.get(row.matched_lead_id) : undefined;
  const checks = buildCaptureChecks(row, lead);

  return {
    id: row.id,
    createdAt: row.created_at,
    protocol: row.protocol,
    messagePreview: truncateMessagePreview(row.message),
    emrCampaignId: row.emr_campaign_id,
    captureSource: row.capture_source,
    gclid: row.gclid,
    utmCampaign: row.utm_campaign,
    matchedLeadId: row.matched_lead_id,
    matchedAt: row.matched_at,
    status: row.matched_lead_id ? "linked" : "awaiting_whatsapp",
    lead: lead
      ? {
          id: lead.id,
          gclid: lead.gclid,
          googleLpProtocol: lead.google_lp_protocol,
          contactPhone: lead.contact_phone,
          createdAt: lead.created_at,
        }
      : undefined,
    checks,
  };
}

export function computeGclidCaptureRate(protocolsTotal: number, withGclid: number): number | null {
  if (protocolsTotal <= 0) return null;
  return Math.round((withGclid / protocolsTotal) * 1000) / 10;
}

export function isGclidCaptureRateLow(
  protocolsTotal: number,
  gclidRatePercent: number | null,
  threshold = GOOGLE_LP_GCLID_RATE_ALERT_THRESHOLD
): boolean {
  if (protocolsTotal < 10) return false;
  if (gclidRatePercent == null) return false;
  return gclidRatePercent < threshold;
}

export function buildCaptureSummary(
  windowHours: number,
  protocols: GoogleLpProtocolRow[],
  leadsWithGclidInWindow: number
): GoogleLpCaptureSummary {
  const protocolsTotal = protocols.length;
  const withGclid = protocols.filter((p) => p.gclid?.trim()).length;
  const gclidRatePercent = computeGclidCaptureRate(protocolsTotal, withGclid);

  return {
    windowHours,
    protocolsTotal,
    withGclid,
    withEmr: protocols.filter((p) => p.emr_campaign_id?.trim()).length,
    matched: protocols.filter((p) => p.matched_lead_id).length,
    wciExtension: protocols.filter((p) => p.capture_source === "wci_extension").length,
    landing: protocols.filter((p) => p.capture_source === "landing").length,
    leadsWithGclidInWindow,
    gclidRatePercent,
    gclidRateLow: isGclidCaptureRateLow(protocolsTotal, gclidRatePercent),
  };
}
