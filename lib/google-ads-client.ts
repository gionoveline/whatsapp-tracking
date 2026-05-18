/**
 * Cliente HTTP mínimo para Google Ads API (REST).
 */

const API_VERSION = "v18";
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;

export type GoogleAdsRequestContext = {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string | null;
};

function buildHeaders(ctx: GoogleAdsRequestContext): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.accessToken}`,
    "developer-token": ctx.developerToken,
    "Content-Type": "application/json",
  };
  if (ctx.loginCustomerId?.trim()) {
    headers["login-customer-id"] = ctx.loginCustomerId.replace(/-/g, "");
  }
  return headers;
}

export async function googleAdsSearch<T = unknown>(
  ctx: GoogleAdsRequestContext,
  query: string
): Promise<{ ok: true; results: T[] } | { ok: false; error: string }> {
  const customerId = ctx.customerId.replace(/-/g, "");
  const res = await fetch(`${BASE_URL}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: buildHeaders(ctx),
    body: JSON.stringify({ query }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    results?: T[];
    error?: { message?: string; status?: string; code?: number };
  };

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    return { ok: false, error: msg };
  }

  return { ok: true, results: data.results ?? [] };
}

export async function googleAdsUploadClickConversions(
  ctx: GoogleAdsRequestContext,
  body: {
    conversions: Array<Record<string, unknown>>;
    partialFailure?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const customerId = ctx.customerId.replace(/-/g, "");
  const res = await fetch(`${BASE_URL}/customers/${customerId}:uploadClickConversions`, {
    method: "POST",
    headers: buildHeaders(ctx),
    body: JSON.stringify({
      conversions: body.conversions,
      partialFailure: body.partialFailure !== false,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    partialFailureError?: { message?: string };
    error?: { message?: string };
  };

  if (!res.ok) {
    return { ok: false, error: data.error?.message ?? res.statusText };
  }

  if (data.partialFailureError?.message) {
    return { ok: false, error: data.partialFailureError.message };
  }

  return { ok: true };
}
