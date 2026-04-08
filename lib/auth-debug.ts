type AuthDebugMeta = Record<string, unknown>;

const ENABLED =
  process.env.AUTH_DEBUG_LOGS === "1" ||
  process.env.AUTH_DEBUG_LOGS === "true";

function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [name, domain] = email.toLowerCase().split("@");
  if (!name || !domain) return null;
  const safeName = name.length <= 2 ? `${name[0] ?? "*"}*` : `${name.slice(0, 2)}***`;
  return `${safeName}@${domain}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  return redactEmail(email);
}

export function authDebug(event: string, meta: AuthDebugMeta = {}) {
  if (!ENABLED) return;
  console.info(`[auth-debug] ${event}`, meta);
}

