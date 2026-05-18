/**
 * OAuth2 access token a partir do refresh token (Google Ads API).
 */

type TokenCacheEntry = { accessToken: string; expiresAt: number };
const tokenCache = new Map<string, TokenCacheEntry>();

export async function getGoogleAdsAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const cacheKey = refreshToken.slice(0, 24);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  const accessToken = data.access_token?.trim();
  if (!accessToken) return null;

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return accessToken;
}
