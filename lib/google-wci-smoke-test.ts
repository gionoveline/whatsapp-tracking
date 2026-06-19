import { buildGoogleWciUrl } from "@/lib/google-lp-campaign-links";

/** Prefixo de gclid gerado pelo painel — fácil de filtrar na monitoria. */
export const WCI_SMOKE_GCLID_PREFIX = "WT_SMOKE_";

export const WCI_SMOKE_SESSION_KEY = "wt_google_lp_wci_smoke_gclid";

export function generateWciSmokeGclid(): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `${WCI_SMOKE_GCLID_PREFIX}${suffix}`;
}

export function isWciSmokeTestGclid(gclid: string | null | undefined): boolean {
  return Boolean(gclid?.trim().startsWith(WCI_SMOKE_GCLID_PREFIX));
}

export function buildWciSmokeTestUrl(
  origin: string,
  partnerId: string,
  emrCampaignId: string,
  smokeGclid: string
): string {
  const base = buildGoogleWciUrl(origin, partnerId, emrCampaignId);
  const url = new URL(base);
  url.searchParams.set("gclid", smokeGclid);
  url.searchParams.set("utm_source", "wt_smoke_test");
  url.searchParams.set("utm_medium", "panel");
  url.searchParams.set("utm_campaign", "wci_validation");
  return url.toString();
}

export type WciSmokeTestVerdict = {
  passed: boolean;
  gclid: string;
  protocol: string | null;
  captureSource: string | null;
  hasGclid: boolean;
  isWciExtension: boolean;
  message: string;
};

export function evaluateWciSmokeCapture(
  gclid: string,
  event: { gclid: string | null; captureSource: string | null; protocol: string; checks: { hasGclid: boolean } } | undefined
): WciSmokeTestVerdict {
  if (!event) {
    return {
      passed: false,
      gclid,
      protocol: null,
      captureSource: null,
      hasGclid: false,
      isWciExtension: false,
      message: "Aguardando registro na monitoria… Abra o link de teste se ainda não abriu.",
    };
  }

  const isWciExtension = event.captureSource === "wci_extension";
  const hasGclid = Boolean(event.checks.hasGclid && event.gclid?.trim() === gclid.trim());
  const passed = isWciExtension && hasGclid;

  let message: string;
  if (passed) {
    message = `WCI validado: origem extensão e gclid ${gclid} capturados. Protocolo ${event.protocol}.`;
  } else if (!isWciExtension) {
    message = `Clique registrado, mas origem foi "${event.captureSource ?? "desconhecida"}" — confira se a URL usa /wci.`;
  } else if (!hasGclid) {
    message = "Origem WCI ok, mas o gclid do teste não foi gravado.";
  } else {
    message = "Registro encontrado, mas critérios do teste não foram atendidos.";
  }

  return {
    passed,
    gclid,
    protocol: event.protocol,
    captureSource: event.captureSource,
    hasGclid,
    isWciExtension,
    message,
  };
}
