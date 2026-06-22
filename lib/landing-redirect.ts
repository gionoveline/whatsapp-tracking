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

export type LandingAttribution = Partial<Record<(typeof ATTRIBUTION_QUERY_KEYS)[number], string>>;

export function readAttributionFromUrl(incoming: URL): LandingAttribution {
  return readAttributionFromUrlSearchParams(incoming.searchParams);
}

export function readAttributionFromUrlSearchParams(
  searchParams: URLSearchParams
): LandingAttribution {
  const out: LandingAttribution = {};
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

/** Completa chaves ausentes em `primary` com valores de `secondary` (não sobrescreve). */
export function mergeAttributionSources(primary: LandingAttribution, secondary: LandingAttribution): LandingAttribution {
  const out: LandingAttribution = { ...primary };
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    if (!out[key] && secondary[key]) out[key] = secondary[key];
  }
  return out;
}

function refererHasGoogleClickId(url: URL): boolean {
  return Boolean(
    url.searchParams.get("gclid")?.trim() ||
      url.searchParams.get("wbraid")?.trim() ||
      url.searchParams.get("gbraid")?.trim()
  );
}

export function readAttributionFromRefererHeader(
  refererRaw: string | null | undefined,
  allowedHosts: string[]
): LandingAttribution {
  if (!refererRaw?.trim()) return {};
  try {
    const url = new URL(refererRaw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return {};

    if (allowedHosts.length > 0) {
      if (!isLandingHostAllowed(url.hostname, allowedHosts)) return {};
    } else if (!refererHasGoogleClickId(url)) {
      // Sem allowlist configurada: só confia no referer se trouxer id de clique Google.
      return {};
    }

    return readAttributionFromUrl(url);
  } catch {
    return {};
  }
}

/** Para backfill: extrai atribuição de qualquer URL válida (sem checagem de host). */
export function readAttributionFromUrlStringLoose(urlRaw: string | null | undefined): LandingAttribution {
  if (!urlRaw?.trim()) return {};
  try {
    return readAttributionFromUrl(new URL(urlRaw.trim()));
  } catch {
    return {};
  }
}

export function buildAttributionRefererAllowlist(options: {
  redirectAllowedHosts?: string[];
  siteUrl?: string | null;
}): string[] {
  const hosts = new Set<string>();
  for (const h of options.redirectAllowedHosts ?? []) {
    const n = normalizeLandingHost(h);
    if (n) hosts.add(n);
  }
  if (options.siteUrl?.trim()) {
    try {
      const h = normalizeLandingHost(new URL(options.siteUrl.trim()).hostname);
      if (h) hosts.add(h);
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}

const LANDING_SRC_QUERY_KEYS = ["src", "landing", "lp"] as const;
const MAX_LANDING_SRC_CHARS = 2048;

/**
 * O script da landing envia `src=` com a URL completa da página (inclui gclid na query).
 * O Referer HTTP quase nunca traz query string.
 */
export function readAttributionFromLandingSrcParam(requestUrl: URL): LandingAttribution {
  for (const key of LANDING_SRC_QUERY_KEYS) {
    const raw = requestUrl.searchParams.get(key)?.trim();
    if (!raw) continue;
    const decoded = raw.slice(0, MAX_LANDING_SRC_CHARS);
    try {
      return readAttributionFromUrl(new URL(decoded));
    } catch {
      const loose = readAttributionFromUrlStringLoose(decoded);
      if (Object.keys(loose).length > 0) return loose;
    }
  }
  return {};
}

/**
 * Atribuição do clique em `/go`: query do request + `src` da landing + fallback no Referer.
 */
export function readAttributionForGoRequest(
  requestUrl: URL,
  refererHeader: string | null | undefined,
  allowedRefererHosts: string[]
): LandingAttribution {
  const fromRequest = readAttributionFromUrl(requestUrl);
  const fromLandingSrc = readAttributionFromLandingSrcParam(requestUrl);
  const fromReferer = readAttributionFromRefererHeader(refererHeader, allowedRefererHosts);
  return mergeAttributionSources(mergeAttributionSources(fromRequest, fromLandingSrc), fromReferer);
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
    // Protocolo/EMR primeiro para o lead colar o ID no início da conversa.
    destination.searchParams.set("text", `${message}\n\n${existing}`);
  }
  return destination;
}
