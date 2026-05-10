/** Parâmetros de clique/atribuição repassados do `/go` para a URL final. */
export const ATTRIBUTION_QUERY_KEYS = [
  "gclid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const MAX_NEXT_URL_CHARS = 2048;

export function normalizeLandingHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

export function isLandingHostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const allowed = allowedHosts.map((h) => normalizeLandingHost(h)).filter(Boolean);
  if (allowed.length === 0) return false;
  const h = normalizeLandingHost(hostname);
  return allowed.includes(h);
}

export function mergeAttributionQueryOntoTarget(target: URL, incoming: URL): void {
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const v = incoming.searchParams.get(key);
    if (v != null && v !== "") {
      target.searchParams.set(key, v);
    }
  }
}

export function readAttributionFromUrl(incoming: URL): Partial<Record<(typeof ATTRIBUTION_QUERY_KEYS)[number], string>> {
  const out: Partial<Record<(typeof ATTRIBUTION_QUERY_KEYS)[number], string>> = {};
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const value = incoming.searchParams.get(key)?.trim();
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

export function isAllowedRedirectTargetUrl(url: URL): boolean {
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    const h = url.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  }
  return false;
}

export type ParseNextUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: "invalid" | "too_long" | "protocol" };

export function parseNextRedirectUrl(nextRaw: string | null): ParseNextUrlResult {
  if (nextRaw == null || !String(nextRaw).trim()) return { ok: false, reason: "invalid" };
  const s = String(nextRaw).trim();
  if (s.length > MAX_NEXT_URL_CHARS) return { ok: false, reason: "too_long" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isAllowedRedirectTargetUrl(u)) return { ok: false, reason: "protocol" };
  return { ok: true, url: u };
}

export function isWhatsAppRedirectTargetUrl(url: URL, allowedHosts: string[]): boolean {
  if (url.username || url.password) return false;
  if (url.protocol !== "https:") return false;
  const host = normalizeLandingHost(url.hostname);
  return allowedHosts.map((h) => normalizeLandingHost(h)).includes(host);
}

export function appendMessageToWhatsAppUrl(url: URL, message: string): URL {
  const destination = new URL(url.href);
  const existing = destination.searchParams.get("text")?.trim();
  if (!existing) {
    destination.searchParams.set("text", message);
  } else if (!existing.includes(message)) {
    destination.searchParams.set("text", `${existing}\n\n${message}`);
  }
  return destination;
}
