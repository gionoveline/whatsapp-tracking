/** Chave única em `app_settings` (JSON do objeto {@link GoogleLpTrackingStored}). */
export const GOOGLE_LP_TRACKING_CONFIG_KEY = "google_lp_tracking_config";

export type GoogleLpTrackingStored = {
  protocolMessageTemplate: string;
  /** Telefone padrão do cliente para `wa.me`, só dígitos com DDI/DDD. */
  whatsappPhone: string;
  whatsappLinkHosts: string[];
  /** Hostnames da landing (sem path) permitidos em `GET /go?next=…` — vazio desativa o redirect. */
  redirectAllowedHosts: string[];
};

export const DEFAULT_GOOGLE_LP_TRACKING: GoogleLpTrackingStored = {
  protocolMessageTemplate: "{{emr_id}} - {{protocol}}",
  whatsappPhone: "",
  whatsappLinkHosts: ["wa.me", "api.whatsapp.com", "web.whatsapp.com"],
  redirectAllowedHosts: [],
};

export function sanitizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function parseHostnameFromLine(raw: string): string | null {
  const s0 = raw.trim().toLowerCase();
  if (!s0) return null;
  try {
    if (s0.includes("://")) {
      return new URL(s0).hostname.toLowerCase().replace(/^www\./, "") || null;
    }
  } catch {
    return null;
  }
  const host = s0.split("/")[0]?.split(":")[0]?.replace(/^www\./, "") ?? "";
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

export function parseHostsMultiline(text: string): string[] {
  const parts = text.split(/[\n,]+/);
  const out: string[] = [];
  for (const p of parts) {
    const h = parseHostnameFromLine(p);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export function hostsToMultiline(hosts: string[]): string {
  return hosts.join("\n");
}

export function parseStoredGoogleLpTracking(value: string | null | undefined): GoogleLpTrackingStored {
  if (!value?.trim()) return { ...DEFAULT_GOOGLE_LP_TRACKING };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed == null || typeof parsed !== "object") return { ...DEFAULT_GOOGLE_LP_TRACKING };
    const o = parsed as Record<string, unknown>;
    const tpl =
      typeof o.protocolMessageTemplate === "string"
        ? o.protocolMessageTemplate.slice(0, 1000)
        : DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate;
    const whatsappPhone = sanitizeWhatsAppPhone(o.whatsappPhone);
    let hosts: string[] = [];
    if (Array.isArray(o.whatsappLinkHosts)) {
      hosts = o.whatsappLinkHosts
        .map((x) => parseHostnameFromLine(String(x)))
        .filter((x): x is string => Boolean(x));
    }
    if (hosts.length === 0) hosts = [...DEFAULT_GOOGLE_LP_TRACKING.whatsappLinkHosts];
    if (hosts.length > 20) hosts = hosts.slice(0, 20);

    let redirectAllowedHosts: string[] = [];
    if (Array.isArray(o.redirectAllowedHosts)) {
      redirectAllowedHosts = o.redirectAllowedHosts
        .map((x) => parseHostnameFromLine(String(x)))
        .filter((x): x is string => Boolean(x));
    }
    if (redirectAllowedHosts.length > 15) redirectAllowedHosts = redirectAllowedHosts.slice(0, 15);

    return { protocolMessageTemplate: tpl, whatsappPhone, whatsappLinkHosts: hosts, redirectAllowedHosts };
  } catch {
    return { ...DEFAULT_GOOGLE_LP_TRACKING };
  }
}

export type SanitizeGoogleLpBodyResult =
  | { ok: true; config: GoogleLpTrackingStored }
  | { ok: false; error: string };

export function sanitizeGoogleLpTrackingBody(body: unknown): SanitizeGoogleLpBodyResult {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "Body inválido" };
  }
  const o = body as Record<string, unknown>;
  let template =
    typeof o.protocolMessageTemplate === "string"
      ? o.protocolMessageTemplate.trim().slice(0, 1000)
      : DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate;
  if (!template) template = DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate;
  const whatsappPhone = sanitizeWhatsAppPhone(o.whatsappPhone);

  let hosts: string[] = [];
  if (Array.isArray(o.whatsappLinkHosts)) {
    hosts = o.whatsappLinkHosts
      .map((x) => parseHostnameFromLine(String(x)))
      .filter((x): x is string => Boolean(x));
  } else if (typeof o.whatsappLinkHostsText === "string") {
    hosts = parseHostsMultiline(o.whatsappLinkHostsText);
  }
  if (hosts.length === 0) hosts = [...DEFAULT_GOOGLE_LP_TRACKING.whatsappLinkHosts];
  if (hosts.length > 20) return { ok: false, error: "No máximo 20 hosts" };

  let redirectAllowedHosts: string[] = [];
  if (Array.isArray(o.redirectAllowedHosts)) {
    redirectAllowedHosts = o.redirectAllowedHosts
      .map((x) => parseHostnameFromLine(String(x)))
      .filter((x): x is string => Boolean(x));
  } else if (typeof o.redirectAllowedHostsText === "string") {
    redirectAllowedHosts = parseHostsMultiline(o.redirectAllowedHostsText);
  }
  if (redirectAllowedHosts.length > 15) return { ok: false, error: "No máximo 15 domínios de redirect" };

  return {
    ok: true,
    config: { protocolMessageTemplate: template, whatsappPhone, whatsappLinkHosts: hosts, redirectAllowedHosts },
  };
}

/** Evita quebra de `</script>` e line/paragraph separators em assignment inline. */
export function jsonForInlineScriptAssignment(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
