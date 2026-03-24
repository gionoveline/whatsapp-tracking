import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const PARTNER_WEBHOOK_SECRET_KEY = "webhook_secret";

function isUuidLike(value: string): boolean {
  // Simple UUIDv4/v1-ish validator (hex groups x4 + 12 chars).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Validates shared secret (constant-time) and optionally HMAC(timestamp + body) for replay protection.
 * When WEBHOOK_REQUIRE_HMAC=true, clients must send:
 * - X-Webhook-Timestamp: Unix seconds
 * - X-Webhook-Signature: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 * Use WEBHOOK_HMAC_SECRET or fallback to WEBHOOK_SECRET for signing.
 */
async function getPartnerWebhookSecret(partnerId: string | null | undefined): Promise<string | null> {
  if (!partnerId || !isUuidLike(partnerId)) return null;

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PARTNER_WEBHOOK_SECRET_KEY)
    .eq("partner_id", partnerId)
    .single();

  const secret = data?.value?.trim();
  return secret || null;
}

function verifySharedWebhookSecret(request: NextRequest, expectedSecret: string): boolean {
  const providedRaw =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const provided = providedRaw.trim();

  const secretBuf = Buffer.from(expectedSecret, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  return (
    secretBuf.length === providedBuf.length && timingSafeEqual(secretBuf, providedBuf)
  );
}

function verifyWebhookHmac(request: NextRequest, rawBody: string, opts: {
  expectedSecret: string;
  partnerId: string | null;
  includePartnerInHmac: boolean;
}): boolean {
  const requireHmac = process.env.WEBHOOK_REQUIRE_HMAC === "true";
  if (!requireHmac) return true;

  const hmacKey = (process.env.WEBHOOK_HMAC_SECRET ?? opts.expectedSecret).trim();
  const tsHeader = request.headers.get("x-webhook-timestamp")?.trim();
  const sigHeader = request.headers.get("x-webhook-signature")?.trim();
  if (!tsHeader || !sigHeader) return false;

  const ts = parseInt(tsHeader, 10);
  if (Number.isNaN(ts) || ts < 0) return false;

  const windowSec = Math.min(
    3600,
    Math.max(60, parseInt(process.env.WEBHOOK_REPLAY_WINDOW_SEC ?? "300", 10) || 300)
  );
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > windowSec) return false;

  if (opts.includePartnerInHmac && !opts.partnerId) return false;
  const payload = opts.includePartnerInHmac
    ? `${tsHeader}.${opts.partnerId}.${rawBody}`
    : `${tsHeader}.${rawBody}`;

  const expectedHex = createHmac("sha256", hmacKey).update(payload, "utf8").digest("hex");
  return timingSafeEqualHex(sigHeader.toLowerCase(), expectedHex.toLowerCase());
}

/**
 * Verifies webhook authenticity:
 * - Chooses the secret by `x-partner-id` (tenant-scoped) when configured.
 * - Optionally falls back to `WEBHOOK_SECRET` only when `WEBHOOK_LEGACY_GLOBAL_SECRET=true`.
 *
 * If `WEBHOOK_REQUIRE_HMAC=true`, HMAC can include `partner_id` in the payload to prevent
 * signature reuse across tenants with the same body + timestamp.
 */
export async function verifyWebhookRequest(
  request: NextRequest,
  rawBody: string,
  partnerId?: string | null
): Promise<boolean> {
  const insecureDev =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_WEBHOOKS === "true";

  const globalSecret = process.env.WEBHOOK_SECRET?.trim() ?? null;
  const legacyGlobalAllowed = process.env.WEBHOOK_LEGACY_GLOBAL_SECRET === "true";

  const resolvedPartnerId = partnerId ?? request.headers.get("x-partner-id")?.trim() ?? null;
  const partnerSecret = await getPartnerWebhookSecret(resolvedPartnerId);

  // Secret selection
  if (partnerSecret) {
    const sharedOk = verifySharedWebhookSecret(request, partnerSecret);
    if (!sharedOk) return false;
    return verifyWebhookHmac(request, rawBody, {
      expectedSecret: partnerSecret,
      partnerId: resolvedPartnerId,
      includePartnerInHmac: true,
    });
  }

  // Legacy global secret fallback (transition only)
  if (globalSecret && legacyGlobalAllowed) {
    const sharedOk = verifySharedWebhookSecret(request, globalSecret);
    if (!sharedOk) return false;
    const includePartnerInHmac = process.env.WEBHOOK_HMAC_INCLUDE_PARTNER === "true";
    return verifyWebhookHmac(request, rawBody, {
      expectedSecret: globalSecret,
      partnerId: resolvedPartnerId,
      includePartnerInHmac,
    });
  }

  // No configured secret: allow only in insecure dev mode
  if (!globalSecret) {
    if (process.env.NODE_ENV === "production") return false;
    return insecureDev;
  }

  // Global secret exists but legacy fallback not enabled
  return false;
}

// Backward-compatible function name (legacy env WEBHOOK_SECRET + legacy payload).
export function requireWebhookAuth(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.WEBHOOK_SECRET?.trim();
  if (!secret) {
    const insecureDev =
      process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_WEBHOOKS === "true";
    if (process.env.NODE_ENV === "production") return false;
    return insecureDev;
  }

  const okSecret = verifySharedWebhookSecret(request, secret);
  if (!okSecret) return false;

  return verifyWebhookHmac(request, rawBody, {
    expectedSecret: secret,
    partnerId: request.headers.get("x-partner-id")?.trim() ?? null,
    includePartnerInHmac: false,
  });
}

/**
 * Reads the raw body via a cloned request so callers can still call request.json() afterward.
 * When WEBHOOK_REQUIRE_HMAC=true, signature covers the exact bytes received.
 */
export async function requireWebhookSecret(request: NextRequest): Promise<boolean> {
  let rawBody: string;
  try {
    rawBody = await request.clone().text();
  } catch {
    return false;
  }
  return verifyWebhookRequest(request, rawBody);
}

export async function requireWebhookSecretForPartner(
  request: NextRequest,
  partnerId: string
): Promise<boolean> {
  let rawBody: string;
  try {
    rawBody = await request.clone().text();
  } catch {
    return false;
  }
  return verifyWebhookRequest(request, rawBody, partnerId);
}

export { isUuidLike };
