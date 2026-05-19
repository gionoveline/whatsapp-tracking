import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import {
  GOOGLE_ADS_CUSTOMER_ID_KEY,
  GOOGLE_ADS_DEVELOPER_TOKEN_KEY,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_ID_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY,
  GOOGLE_ADS_REFRESH_TOKEN_KEY,
  GOOGLE_ADS_CREDENTIAL_SETTING_KEYS,
  type GoogleAdsConnectionStatus,
} from "@/lib/google-ads-settings-keys";
import { supabase } from "@/lib/supabase";

export {
  GOOGLE_ADS_CUSTOMER_ID_KEY,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY,
  GOOGLE_ADS_REFRESH_TOKEN_KEY,
} from "@/lib/google-ads-settings-keys";

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

function readEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

async function getAppSetting(
  supabaseClient: SupabaseClient,
  partnerId: string,
  key: string
): Promise<string | null> {
  const { data } = await supabaseClient
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", key)
    .maybeSingle();
  const raw = data?.value?.trim();
  return raw || null;
}

function decryptSetting(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("enc:v1:")) {
    return decryptAppSettingValue(raw)?.trim() || null;
  }
  return raw;
}

function isConfigured(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Credenciais Google Ads por tenant (app_settings criptografados, com fallback em env).
 */
export async function getGoogleAdsCredentials(
  partnerId: string,
  supabaseClient: SupabaseClient = supabase
): Promise<GoogleAdsCredentials | null> {
  const developerToken =
    decryptSetting(await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_DEVELOPER_TOKEN_KEY)) ??
    readEnv("GOOGLE_ADS_DEVELOPER_TOKEN");

  const clientId =
    (await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_OAUTH_CLIENT_ID_KEY)) ??
    readEnv("GOOGLE_OAUTH_CLIENT_ID");

  const clientSecret =
    decryptSetting(await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY)) ??
    readEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const refreshToken =
    decryptSetting(await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_REFRESH_TOKEN_KEY)) ??
    readEnv("GOOGLE_ADS_REFRESH_TOKEN");

  const customerId =
    (await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_CUSTOMER_ID_KEY)) ??
    readEnv("GOOGLE_ADS_CUSTOMER_ID");

  const loginRaw =
    (await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY)) ??
    readEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

  if (
    !isConfigured(developerToken) ||
    !isConfigured(clientId) ||
    !isConfigured(clientSecret) ||
    !isConfigured(refreshToken) ||
    !isConfigured(customerId)
  ) {
    return null;
  }

  return {
    refreshToken: refreshToken!.trim(),
    customerId: normalizeCustomerId(customerId!),
    loginCustomerId: loginRaw ? normalizeCustomerId(loginRaw) : null,
    developerToken: developerToken!.trim(),
    clientId: clientId!.trim(),
    clientSecret: clientSecret!.trim(),
  };
}

export async function getGoogleAdsConnectionStatus(
  partnerId: string,
  supabaseClient: SupabaseClient = supabase
): Promise<GoogleAdsConnectionStatus> {
  const { data: rows } = await supabaseClient
    .from("app_settings")
    .select("key")
    .eq("partner_id", partnerId)
    .in("key", [...GOOGLE_ADS_CREDENTIAL_SETTING_KEYS]);

  const configuredKeys = new Set((rows ?? []).map((r) => r.key));

  const developer_token_configured =
    configuredKeys.has(GOOGLE_ADS_DEVELOPER_TOKEN_KEY) || Boolean(readEnv("GOOGLE_ADS_DEVELOPER_TOKEN"));
  const oauth_client_id_configured =
    configuredKeys.has(GOOGLE_ADS_OAUTH_CLIENT_ID_KEY) || Boolean(readEnv("GOOGLE_OAUTH_CLIENT_ID"));
  const oauth_client_secret_configured =
    configuredKeys.has(GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY) || Boolean(readEnv("GOOGLE_OAUTH_CLIENT_SECRET"));
  const refresh_token_configured =
    configuredKeys.has(GOOGLE_ADS_REFRESH_TOKEN_KEY) || Boolean(readEnv("GOOGLE_ADS_REFRESH_TOKEN"));
  const customer_id_configured =
    configuredKeys.has(GOOGLE_ADS_CUSTOMER_ID_KEY) || Boolean(readEnv("GOOGLE_ADS_CUSTOMER_ID"));
  const login_customer_id_configured =
    configuredKeys.has(GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY) || Boolean(readEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));

  const credentials_ready =
    developer_token_configured &&
    oauth_client_id_configured &&
    oauth_client_secret_configured &&
    refresh_token_configured &&
    customer_id_configured;

  let customer_id_preview: string | null = null;
  const customerRaw = await getAppSetting(supabaseClient, partnerId, GOOGLE_ADS_CUSTOMER_ID_KEY);
  const cid = customerRaw?.replace(/-/g, "") ?? readEnv("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");
  if (cid && cid.length >= 4) {
    customer_id_preview = `***${cid.slice(-4)}`;
  }

  return {
    developer_token_configured,
    oauth_client_id_configured,
    oauth_client_secret_configured,
    refresh_token_configured,
    customer_id_configured,
    login_customer_id_configured,
    credentials_ready,
    customer_id_preview,
  };
}
