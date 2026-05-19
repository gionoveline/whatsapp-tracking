/**
 * Upload de conversões offline (click) para o Google Ads via gclid / wbraid / gbraid.
 * @see https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 */

import { getGoogleAdsAccessToken } from "@/lib/google-ads-auth";
import { googleAdsUploadClickConversions, type GoogleAdsRequestContext } from "@/lib/google-ads-client";
import { getGoogleAdsCredentials } from "@/lib/google-ads-credentials";
import { supabase } from "@/lib/supabase";

export type OurEventKey = "lead" | "sql" | "venda";

export type GoogleAdsClickIds = {
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
};

export type GoogleAdsConversionMappingItem = {
  enabled: boolean;
  conversion_action_id: string | null;
};

export type GoogleAdsConversionMapping = {
  lead: GoogleAdsConversionMappingItem;
  sql: GoogleAdsConversionMappingItem;
  venda: GoogleAdsConversionMappingItem;
};

export type GoogleAdsConversionConfig = {
  customer_id: string | null;
  currency_code: string;
  mapping: GoogleAdsConversionMapping;
};

const DEFAULT_MAPPING: GoogleAdsConversionMapping = {
  lead: { enabled: false, conversion_action_id: null },
  sql: { enabled: false, conversion_action_id: null },
  venda: { enabled: false, conversion_action_id: null },
};

function parseMapping(value: string | null): GoogleAdsConversionMapping {
  if (!value) return DEFAULT_MAPPING;
  try {
    const parsed = JSON.parse(value) as Partial<GoogleAdsConversionMapping>;
    return {
      lead: { ...DEFAULT_MAPPING.lead, ...parsed.lead },
      sql: { ...DEFAULT_MAPPING.sql, ...parsed.sql },
      venda: { ...DEFAULT_MAPPING.venda, ...parsed.venda },
    };
  } catch {
    return DEFAULT_MAPPING;
  }
}

export async function getGoogleAdsConversionConfig(
  partnerId: string,
  supabaseClient = supabase
): Promise<GoogleAdsConversionConfig> {
  const keys = ["google_ads_customer_id", "google_ads_currency_code", "google_ads_conversion_mapping"];
  const { data: rows } = await supabaseClient
    .from("app_settings")
    .select("key, value")
    .eq("partner_id", partnerId)
    .in("key", keys);

  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const customerId = map.get("google_ads_customer_id")?.trim().replace(/-/g, "") ?? null;

  return {
    customer_id: customerId || null,
    currency_code: map.get("google_ads_currency_code")?.trim() || "BRL",
    mapping: parseMapping(map.get("google_ads_conversion_mapping") ?? null),
  };
}

function pickClickId(ids: GoogleAdsClickIds): { field: "gclid" | "wbraid" | "gbraid"; value: string } | null {
  const gclid = ids.gclid?.trim();
  const wbraid = ids.wbraid?.trim();
  const gbraid = ids.gbraid?.trim();
  const count = [gclid, wbraid, gbraid].filter(Boolean).length;
  if (count !== 1) return null;
  if (gclid) return { field: "gclid", value: gclid };
  if (wbraid) return { field: "wbraid", value: wbraid };
  if (gbraid) return { field: "gbraid", value: gbraid };
  return null;
}

/** Formato exigido pela API: yyyy-mm-dd hh:mm:ss+|-hh:mm (UTC). */
export function formatGoogleAdsConversionDateTime(isoDatetime: string): string | null {
  const d = new Date(isoDatetime);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  );
}

function conversionActionResourceName(customerId: string, actionId: string): string {
  const cid = customerId.replace(/-/g, "");
  const aid = actionId.replace(/\D/g, "");
  return `customers/${cid}/conversionActions/${aid}`;
}

export async function sendGoogleAdsClickConversion(
  params: {
    customerId: string;
    conversionActionId: string;
    clickIds: GoogleAdsClickIds;
    conversionDateTime: string;
    currencyCode: string;
    conversionValue?: number;
  },
  partnerId: string
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getGoogleAdsCredentials(partnerId);
  if (!creds) return { ok: false, error: "missing_credentials" };

  const accessToken = await getGoogleAdsAccessToken(
    creds.refreshToken,
    creds.clientId,
    creds.clientSecret
  );
  if (!accessToken) return { ok: false, error: "oauth_failed" };

  const clickId = pickClickId(params.clickIds);
  if (!clickId) return { ok: false, error: "exactly_one_click_id_required" };

  const formattedTime = formatGoogleAdsConversionDateTime(params.conversionDateTime);
  if (!formattedTime) return { ok: false, error: "invalid_conversion_datetime" };

  const customerId = creds.customerId;
  const conversion: Record<string, unknown> = {
    conversionAction: conversionActionResourceName(customerId, params.conversionActionId),
    conversionDateTime: formattedTime,
    currencyCode: params.currencyCode,
    [clickId.field]: clickId.value,
  };
  if (params.conversionValue != null && !Number.isNaN(params.conversionValue)) {
    conversion.conversionValue = params.conversionValue;
  }

  const ctx: GoogleAdsRequestContext = {
    accessToken,
    developerToken: creds.developerToken,
    customerId,
    loginCustomerId: creds.loginCustomerId,
  };

  const result = await googleAdsUploadClickConversions(ctx, {
    conversions: [conversion],
    partialFailure: true,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export type TrySendGoogleConversionResult =
  | { ok: true; conversionActionId: string }
  | { ok: false; reason: "no_click_id" | "mapping_disabled" | "no_customer_id" | "no_credentials" }
  | { ok: false; reason: "send_failed"; conversionActionId: string; error: string };

export type TrySendGoogleConversionOptions = {
  eventTimeIso?: string;
  conversionValue?: number;
};

/** Desliga todos os uploads Google Ads (scripts em massa). */
export function isGoogleConversionsSkipped(): boolean {
  return (
    process.env.SYNC_SKIP_GOOGLE_CONVERSIONS === "1" ||
    process.env.SYNC_SKIP_GOOGLE_CONVERSIONS === "true"
  );
}

/** Mantém compatibilidade com flag antiga focada em SQL. */
export function isGoogleSqlConversionSkipped(): boolean {
  return (
    isGoogleConversionsSkipped() ||
    process.env.SYNC_SKIP_SQL_GOOGLE === "1" ||
    process.env.SYNC_SKIP_SQL_GOOGLE === "true"
  );
}

export function googleAdsClickIdsFromRow(row: {
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
}): GoogleAdsClickIds {
  return {
    gclid: row.gclid,
    wbraid: row.wbraid,
    gbraid: row.gbraid,
  };
}

function resolveEventTimeIso(options?: TrySendGoogleConversionOptions): string {
  if (options?.eventTimeIso) {
    const d = new Date(options.eventTimeIso);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      return d.getTime() > now.getTime() ? now.toISOString() : d.toISOString();
    }
  }
  return new Date().toISOString();
}

export async function trySendGoogleConversion(
  ourEvent: OurEventKey,
  clickIds: GoogleAdsClickIds,
  partnerId: string,
  options?: TrySendGoogleConversionOptions
): Promise<TrySendGoogleConversionResult> {
  if (!pickClickId(clickIds)) {
    return { ok: false, reason: "no_click_id" };
  }

  const config = await getGoogleAdsConversionConfig(partnerId);
  const mapping = config.mapping[ourEvent];
  if (!mapping?.enabled || !mapping.conversion_action_id?.trim()) {
    return { ok: false, reason: "mapping_disabled" };
  }

  const creds = await getGoogleAdsCredentials(partnerId);
  if (!creds) {
    return { ok: false, reason: "no_credentials" };
  }

  const customerId = config.customer_id ?? creds.customerId;
  if (!customerId) {
    return { ok: false, reason: "no_customer_id" };
  }

  const actionId = mapping.conversion_action_id.trim();
  const result = await sendGoogleAdsClickConversion(
    {
      customerId,
      conversionActionId: actionId,
      clickIds,
      conversionDateTime: resolveEventTimeIso(options),
      currencyCode: config.currency_code,
      conversionValue: options?.conversionValue,
    },
    partnerId
  );

  if (!result.ok) {
    return {
      ok: false,
      reason: "send_failed",
      conversionActionId: actionId,
      error: result.error ?? "unknown_error",
    };
  }
  return { ok: true, conversionActionId: actionId };
}

export async function maybeSendGoogleConversion(
  ourEvent: OurEventKey,
  clickIds: GoogleAdsClickIds,
  partnerId: string,
  options?: TrySendGoogleConversionOptions & { eventTime?: number }
): Promise<void> {
  const eventTimeIso =
    options?.eventTime != null
      ? new Date(options.eventTime * 1000).toISOString()
      : options?.eventTimeIso;

  const outcome = await trySendGoogleConversion(ourEvent, clickIds, partnerId, {
    ...options,
    eventTimeIso,
  });

  if (outcome.ok) return;
  if (outcome.reason !== "send_failed") return;
  console.error("[google-ads] failed to send conversion", {
    partnerId,
    ourEvent,
    conversionActionId: outcome.conversionActionId,
    error: outcome.error,
  });
}
