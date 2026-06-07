/**
 * Cliente HTTP mínimo para Google Ads API (REST).
 * @see https://developers.google.com/google-ads/api/docs/sunset-dates
 */

/** v18 foi descontinuado em 2025; manter alinhado ao sunset schedule da Google. */
export const GOOGLE_ADS_API_VERSION = "v21";

const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

function formatGoogleAdsHttpError(
  status: number,
  statusText: string,
  message: string | undefined
): string {
  const detail = message?.trim() || statusText || "unknown_error";
  if (status === 404) {
    return `HTTP 404 Not Found — verifique versão da API (${GOOGLE_ADS_API_VERSION}), customer_id e permissões MCC: ${detail}`;
  }
  return `HTTP ${status}: ${detail}`;
}

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
    return { ok: false, error: formatGoogleAdsHttpError(res.status, res.statusText, data.error?.message) };
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
    return {
      ok: false,
      error: formatGoogleAdsHttpError(res.status, res.statusText, data.error?.message),
    };
  }

  if (data.partialFailureError?.message) {
    return { ok: false, error: `partial_failure: ${data.partialFailureError.message}` };
  }

  return { ok: true };
}
