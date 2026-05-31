import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeEmrCampaignId } from "@/lib/google-lp-campaign-links";
import {
  getGoogleAdsConversionConfig,
  type GoogleAdsConversionMapping,
  type OurEventKey,
} from "@/lib/google-conversions";
import { supabase } from "@/lib/supabase";

export type GoogleAdsAccountRow = {
  id: string;
  partner_id: string;
  label: string;
  customer_id: string;
  login_customer_id: string | null;
  currency_code: string;
  conversion_mapping: GoogleAdsConversionMapping;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type GoogleAdsConversionDestination = {
  customerId: string;
  loginCustomerId: string | null;
  currencyCode: string;
  conversionActionId: string;
  accountId: string | null;
  accountLabel: string | null;
};

const DEFAULT_MAPPING: GoogleAdsConversionMapping = {
  lead: { enabled: false, conversion_action_id: null },
  sql: { enabled: false, conversion_action_id: null },
  venda: { enabled: false, conversion_action_id: null },
};

export function normalizeGoogleAdsCustomerId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/-/g, "").trim();
  return /^[0-9]{8,12}$/.test(normalized) ? normalized : null;
}

export function parseGoogleAdsConversionMapping(value: unknown): GoogleAdsConversionMapping {
  if (!value || typeof value !== "object") return DEFAULT_MAPPING;
  const parsed = value as Partial<GoogleAdsConversionMapping>;
  return {
    lead: { ...DEFAULT_MAPPING.lead, ...parsed.lead },
    sql: { ...DEFAULT_MAPPING.sql, ...parsed.sql },
    venda: { ...DEFAULT_MAPPING.venda, ...parsed.venda },
  };
}

export function customerIdPreview(customerId: string): string {
  const cid = customerId.replace(/-/g, "");
  return cid.length >= 4 ? `***${cid.slice(-4)}` : cid;
}

function rowToAccount(row: Record<string, unknown>): GoogleAdsAccountRow {
  return {
    id: String(row.id),
    partner_id: String(row.partner_id),
    label: String(row.label),
    customer_id: String(row.customer_id).replace(/-/g, ""),
    login_customer_id: row.login_customer_id
      ? String(row.login_customer_id).replace(/-/g, "")
      : null,
    currency_code: String(row.currency_code || "BRL").toUpperCase(),
    conversion_mapping: parseGoogleAdsConversionMapping(row.conversion_mapping),
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listGoogleAdsAccounts(
  partnerId: string,
  supabaseClient: SupabaseClient = supabase
): Promise<GoogleAdsAccountRow[]> {
  const { data, error } = await supabaseClient
    .from("google_ads_accounts")
    .select(
      "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
    )
    .eq("partner_id", partnerId)
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => rowToAccount(row as Record<string, unknown>));
}

async function loadGoogleAdsAccountById(
  partnerId: string,
  accountId: string,
  supabaseClient: SupabaseClient
): Promise<GoogleAdsAccountRow | null> {
  const { data, error } = await supabaseClient
    .from("google_ads_accounts")
    .select(
      "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
    )
    .eq("partner_id", partnerId)
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToAccount(data as Record<string, unknown>) : null;
}

async function loadDefaultGoogleAdsAccount(
  partnerId: string,
  supabaseClient: SupabaseClient
): Promise<GoogleAdsAccountRow | null> {
  const { data, error } = await supabaseClient
    .from("google_ads_accounts")
    .select(
      "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
    )
    .eq("partner_id", partnerId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToAccount(data as Record<string, unknown>) : null;
}

async function resolveAccountForEmrCampaign(
  partnerId: string,
  emrCampaignId: string | null | undefined,
  supabaseClient: SupabaseClient
): Promise<GoogleAdsAccountRow | null> {
  const sanitized = emrCampaignId ? sanitizeEmrCampaignId(emrCampaignId) : null;
  if (sanitized) {
    const { data: link, error: linkError } = await supabaseClient
      .from("google_lp_campaign_links")
      .select("google_ads_account_id")
      .eq("partner_id", partnerId)
      .eq("emr_campaign_id", sanitized)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError) throw linkError;

    const accountId =
      typeof link?.google_ads_account_id === "string" ? link.google_ads_account_id : null;
    if (accountId) {
      return loadGoogleAdsAccountById(partnerId, accountId, supabaseClient);
    }
  }

  return loadDefaultGoogleAdsAccount(partnerId, supabaseClient);
}

function destinationFromAccount(
  account: GoogleAdsAccountRow,
  ourEvent: OurEventKey
): ResolveGoogleAdsDestinationResult {
  const mapping = account.conversion_mapping[ourEvent];
  if (!mapping?.enabled || !mapping.conversion_action_id?.trim()) {
    return { ok: false, reason: "mapping_disabled" };
  }
  const customerId = normalizeGoogleAdsCustomerId(account.customer_id);
  if (!customerId) {
    return { ok: false, reason: "no_customer_id" };
  }
  return {
    ok: true,
    customerId,
    loginCustomerId: account.login_customer_id,
    currencyCode: account.currency_code || "BRL",
    conversionActionId: mapping.conversion_action_id.trim(),
    accountId: account.id,
    accountLabel: account.label,
  };
}

function destinationFromLegacyConfig(
  config: Awaited<ReturnType<typeof getGoogleAdsConversionConfig>>,
  ourEvent: OurEventKey
): ResolveGoogleAdsDestinationResult {
  const mapping = config.mapping[ourEvent];
  if (!mapping?.enabled || !mapping.conversion_action_id?.trim()) {
    return { ok: false, reason: "mapping_disabled" };
  }
  const customerId = normalizeGoogleAdsCustomerId(config.customer_id);
  if (!customerId) {
    return { ok: false, reason: "no_customer_id" };
  }
  return {
    ok: true,
    customerId,
    loginCustomerId: null,
    currencyCode: config.currency_code || "BRL",
    conversionActionId: mapping.conversion_action_id.trim(),
    accountId: null,
    accountLabel: null,
  };
}

export type ResolveGoogleAdsDestinationResult =
  | ({ ok: true } & GoogleAdsConversionDestination)
  | { ok: false; reason: "mapping_disabled" | "no_customer_id" };

/**
 * Resolve conta + ação de conversão: campanha EMR → conta vinculada → padrão → config legado.
 */
export async function resolveGoogleAdsConversionDestination(
  partnerId: string,
  ourEvent: OurEventKey,
  emrCampaignId?: string | null,
  supabaseClient: SupabaseClient = supabase
): Promise<ResolveGoogleAdsDestinationResult> {
  const account = await resolveAccountForEmrCampaign(partnerId, emrCampaignId, supabaseClient);
  if (account) {
    return destinationFromAccount(account, ourEvent);
  }

  const legacy = await getGoogleAdsConversionConfig(partnerId, supabaseClient);
  return destinationFromLegacyConfig(legacy, ourEvent);
}

export async function importLegacyGoogleAdsAccountAsDefault(
  partnerId: string,
  supabaseClient: SupabaseClient = supabase
): Promise<GoogleAdsAccountRow | null> {
  const existing = await listGoogleAdsAccounts(partnerId, supabaseClient);
  if (existing.length > 0) return existing.find((a) => a.is_default) ?? existing[0] ?? null;

  const legacy = await getGoogleAdsConversionConfig(partnerId, supabaseClient);
  const customerId = normalizeGoogleAdsCustomerId(legacy.customer_id);
  if (!customerId) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabaseClient
    .from("google_ads_accounts")
    .insert({
      partner_id: partnerId,
      label: "Conta padrão",
      customer_id: customerId,
      currency_code: legacy.currency_code || "BRL",
      conversion_mapping: legacy.mapping,
      is_default: true,
      updated_at: now,
    })
    .select(
      "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
    )
    .single();

  if (error) throw error;
  return rowToAccount(data as Record<string, unknown>);
}

export async function clearDefaultGoogleAdsAccounts(
  partnerId: string,
  exceptId: string | null,
  supabaseClient: SupabaseClient
): Promise<void> {
  let query = supabaseClient
    .from("google_ads_accounts")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("partner_id", partnerId)
    .eq("is_default", true);

  if (exceptId) {
    query = query.neq("id", exceptId);
  }

  const { error } = await query;
  if (error) throw error;
}
