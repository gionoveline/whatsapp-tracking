import { createHash, randomInt } from "crypto";

export const GOOGLE_LP_PROTOCOL_PREFIX = "GLP";
export const GOOGLE_LP_PROTOCOL_REGEX = /\bGLP-[A-Z0-9]+-[A-Z0-9]{4}\b/i;

export const GOOGLE_LP_ATTRIBUTION_KEYS = [
  "gclid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type GoogleLpAttributionKey = (typeof GOOGLE_LP_ATTRIBUTION_KEYS)[number];

export type GoogleLpProtocolPayload = {
  partnerId: string;
  attribution: Partial<Record<GoogleLpAttributionKey, string>>;
  landingUrl: string | null;
  referrer: string | null;
};

export type SanitizeGoogleLpProtocolPayloadResult =
  | { ok: true; payload: GoogleLpProtocolPayload }
  | { ok: false; error: string };

const MAX_TRACKING_VALUE_CHARS = 500;
const MAX_URL_CHARS = 2048;

function sanitizeText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxChars);
}

function sanitizeUrl(value: unknown): string | null {
  const trimmed = sanitizeText(value, MAX_URL_CHARS);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeGoogleLpProtocolPayload(body: unknown): SanitizeGoogleLpProtocolPayloadResult {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "Body inválido" };
  }

  const o = body as Record<string, unknown>;
  const partnerId = sanitizeText(o.partnerId ?? o.partner_id, 80);
  if (!partnerId) return { ok: false, error: "partner_id is required" };

  const rawAttribution =
    o.attribution != null && typeof o.attribution === "object"
      ? (o.attribution as Record<string, unknown>)
      : o;
  const attribution: Partial<Record<GoogleLpAttributionKey, string>> = {};
  for (const key of GOOGLE_LP_ATTRIBUTION_KEYS) {
    const value = sanitizeText(rawAttribution[key], MAX_TRACKING_VALUE_CHARS);
    if (value) attribution[key] = value;
  }

  return {
    ok: true,
    payload: {
      partnerId,
      attribution,
      landingUrl: sanitizeUrl(o.landingUrl ?? o.landing_url),
      referrer: sanitizeUrl(o.referrer),
    },
  };
}

export function generateGoogleLpProtocol(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = randomInt(0, 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return `${GOOGLE_LP_PROTOCOL_PREFIX}-${now}-${rand}`;
}

export function renderProtocolMessage(template: string, protocol: string): string {
  const safeTemplate = template.trim() || "Protocolo: {{protocol}}\nOlá!";
  if (safeTemplate.includes("{{protocol}}")) {
    return safeTemplate.replaceAll("{{protocol}}", protocol);
  }
  return `${safeTemplate} ${protocol}`.trim();
}

export function extractGoogleLpProtocolFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(GOOGLE_LP_PROTOCOL_REGEX);
  return match?.[0]?.toUpperCase() ?? null;
}

export function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}
