import { supabase } from "@/lib/supabase";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";

const REFRESH_TOKEN_KEY = "google_ads_refresh_token";
const CUSTOMER_ID_KEY = "google_ads_customer_id";
const LOGIN_CUSTOMER_ID_KEY = "google_ads_login_customer_id";

export type GoogleAdsCredentials = {
  refreshToken: string;
  customerId: string;
  loginCustomerId: string | null;
  developerToken: string;
  clientId: string;
  clientSecret: string;
};

function normalizeCustomerId(id: string): string {
  return id.replace(/-/g, "").trim();
}

async function getAppSetting(partnerId: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", key)
    .maybeSingle();
  const raw = data?.value?.trim();
  return raw || null;
}

/**
 * Credenciais Google Ads por tenant.
 * OAuth client + developer token: env global; refresh token e customer id: app_settings ou env fallback.
 */
export async function getGoogleAdsCredentials(
  partnerId: string
): Promise<GoogleAdsCredentials | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!clientId || !clientSecret || !developerToken) return null;

  let refreshToken =
    (await getAppSetting(partnerId, REFRESH_TOKEN_KEY)) ??
    process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ??
    null;
  if (refreshToken?.startsWith("enc:v1:")) {
    refreshToken = decryptAppSettingValue(refreshToken);
  }
  if (!refreshToken?.trim()) return null;

  let customerId =
    (await getAppSetting(partnerId, CUSTOMER_ID_KEY)) ??
    process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() ??
    null;
  if (!customerId?.trim()) return null;

  const loginRaw =
    (await getAppSetting(partnerId, LOGIN_CUSTOMER_ID_KEY)) ??
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() ??
    null;

  return {
    refreshToken: refreshToken.trim(),
    customerId: normalizeCustomerId(customerId),
    loginCustomerId: loginRaw ? normalizeCustomerId(loginRaw) : null,
    developerToken,
    clientId,
    clientSecret,
  };
}

export { REFRESH_TOKEN_KEY, CUSTOMER_ID_KEY, LOGIN_CUSTOMER_ID_KEY };
