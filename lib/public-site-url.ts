/**
 * URL pública do app (snippet de tracking, emails, etc.).
 * Em produção defina NEXT_PUBLIC_SITE_URL; no browser usa origin como fallback.
 */
export function getPublicSiteUrlForClient(): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}
