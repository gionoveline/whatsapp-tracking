/** Chaves em `app_settings` para credenciais Google Ads por empresa. */
export const GOOGLE_ADS_DEVELOPER_TOKEN_KEY = "google_ads_developer_token";
export const GOOGLE_ADS_OAUTH_CLIENT_ID_KEY = "google_ads_oauth_client_id";
export const GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY = "google_ads_oauth_client_secret";
export const GOOGLE_ADS_REFRESH_TOKEN_KEY = "google_ads_refresh_token";
export const GOOGLE_ADS_CUSTOMER_ID_KEY = "google_ads_customer_id";
export const GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY = "google_ads_login_customer_id";

export const GOOGLE_ADS_CREDENTIAL_SETTING_KEYS = [
  GOOGLE_ADS_DEVELOPER_TOKEN_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_ID_KEY,
  GOOGLE_ADS_OAUTH_CLIENT_SECRET_KEY,
  GOOGLE_ADS_REFRESH_TOKEN_KEY,
  GOOGLE_ADS_CUSTOMER_ID_KEY,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_KEY,
] as const;

export type GoogleAdsConnectionStatus = {
  developer_token_configured: boolean;
  oauth_client_id_configured: boolean;
  oauth_client_secret_configured: boolean;
  refresh_token_configured: boolean;
  customer_id_configured: boolean;
  login_customer_id_configured: boolean;
  /** Todas as chaves obrigatórias presentes (app ou variáveis de ambiente). */
  credentials_ready: boolean;
  /** Últimos 4 dígitos do customer ID, se houver. */
  customer_id_preview: string | null;
};
