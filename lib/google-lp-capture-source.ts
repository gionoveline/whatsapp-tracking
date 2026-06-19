export const GOOGLE_LP_CAPTURE_SOURCES = ["landing", "wci_extension", "direct_go"] as const;

export type GoogleLpCaptureSource = (typeof GOOGLE_LP_CAPTURE_SOURCES)[number];

export function isGoogleLpCaptureSource(value: string): value is GoogleLpCaptureSource {
  return (GOOGLE_LP_CAPTURE_SOURCES as readonly string[]).includes(value);
}

/** Rótulo legível no painel de monitoria. */
export function googleLpCaptureSourceLabel(source: GoogleLpCaptureSource | string | null | undefined): string {
  switch (source) {
    case "wci_extension":
      return "Extensão WhatsApp (WCI)";
    case "landing":
      return "Landing Google LP";
    case "direct_go":
      return "Link direto /go";
    default:
      return "Desconhecido";
  }
}

/**
 * Classifica origem do protocolo gerado em `/go` ou `/wci`.
 * Extensões de mensagem do Google Ads devem usar `/wci` (sem landing).
 */
export function resolveGoogleLpCaptureSource(input: {
  entryPath: "/go" | "/wci";
  refererHeader: string | null | undefined;
  allowedLandingHosts: string[];
  /** Origem do app (ex. https://wpptracking.vercel.app) — referer interno /go|/wci = clique direto. */
  trackingOrigin?: string | null;
}): GoogleLpCaptureSource {
  if (input.entryPath === "/wci") return "wci_extension";

  const referer = input.refererHeader?.trim();
  if (!referer) return "direct_go";

  try {
    const url = new URL(referer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "direct_go";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = (url.pathname || "").replace(/\/+$/, "") || "/";

    if (input.trackingOrigin?.trim()) {
      try {
        const trackingHost = new URL(input.trackingOrigin.trim()).hostname.toLowerCase().replace(/^www\./, "");
        if (host === trackingHost && (path === "/go" || path === "/wci")) return "direct_go";
      } catch {
        /* ignore */
      }
    }

    const allowed = input.allowedLandingHosts.map((h) => h.toLowerCase().replace(/^www\./, "")).filter(Boolean);
    if (allowed.length > 0) return allowed.includes(host) ? "landing" : "direct_go";

    // Sem allowlist: qualquer referer externo indica landing → /go (fluxo EMR).
    return "landing";
  } catch {
    return "direct_go";
  }
}
