/**
 * URL pública do app (snippet de tracking, emails, etc.).
 * Em produção defina NEXT_PUBLIC_SITE_URL; no browser usa origin como fallback.
 */
export function getPublicSiteUrlFromEnv(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export function getPublicSiteUrlForClient(): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return getPublicSiteUrlFromEnv();
}

/** Origem pública para montar links /go na API (env → headers do request). */
export function resolvePublicSiteOrigin(request?: {
  headers: { get(name: string): string | null };
}): string {
  const fromEnv = getPublicSiteUrlFromEnv();
  if (fromEnv) return fromEnv;
  if (!request) return "";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return "";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`.replace(/\/$/, "");
}
