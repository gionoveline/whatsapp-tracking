/**
 * Meta Conversions API for Business Messaging (WhatsApp).
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging
 */

import { getMetaAccessToken } from "@/lib/get-meta-token";
import { supabase } from "@/lib/supabase";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/** Eventos suportados pela Conversions API for Business Messaging (WhatsApp). */
export const META_CAPI_EVENT_NAMES = [
  "LeadSubmitted",
  "QualifiedLead",
  "Purchase",
  "ViewContent",
  "InitiateCheckout",
  "AddToCart",
  "OrderCreated",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "CartAbandoned",
  "RatingProvided",
  "ReviewProvided",
] as const;

export type MetaCapiEventName = (typeof META_CAPI_EVENT_NAMES)[number];

export type OurEventKey = "lead" | "sql" | "venda";

export type MetaCapiMapping = {
  lead: { enabled: boolean; event_name: string | null };
  sql: { enabled: boolean; event_name: string | null };
  venda: { enabled: boolean; event_name: string | null };
};

export type MetaCapiConfig = {
  waba_id: string | null;
  dataset_id: string | null;
  partner_agent: string | null;
  mapping: MetaCapiMapping;
};

const DEFAULT_MAPPING: MetaCapiMapping = {
  lead: { enabled: false, event_name: null },
  sql: { enabled: false, event_name: null },
  venda: { enabled: false, event_name: null },
};

function parseMapping(value: string | null): MetaCapiMapping {
  if (!value) return DEFAULT_MAPPING;
  try {
    const parsed = JSON.parse(value) as Partial<MetaCapiMapping & { opp?: MetaCapiMapping["sql"]; ganho?: MetaCapiMapping["venda"] }>;
    return {
      lead: { ...DEFAULT_MAPPING.lead, ...parsed.lead },
      sql: { ...DEFAULT_MAPPING.sql, ...(parsed.sql ?? parsed.opp) },
      venda: { ...DEFAULT_MAPPING.venda, ...(parsed.venda ?? parsed.ganho) },
    };
  } catch {
    return DEFAULT_MAPPING;
  }
}

export async function getMetaCapiConfig(
  partnerId: string,
  supabaseClient = supabase
): Promise<MetaCapiConfig> {
  const keys = [
    "meta_capi_waba_id",
    "meta_capi_dataset_id",
    "meta_capi_partner_agent",
    "meta_capi_mapping",
  ];
  const { data: rows } = await supabaseClient
    .from("app_settings")
    .select("key, value")
    .eq("partner_id", partnerId)
    .in("key", keys);

  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  return {
    waba_id: map.get("meta_capi_waba_id") ?? null,
    dataset_id: map.get("meta_capi_dataset_id") ?? null,
    partner_agent: map.get("meta_capi_partner_agent") ?? null,
    mapping: parseMapping(map.get("meta_capi_mapping") ?? null),
  };
}

/**
 * Envia um evento para a Meta Conversions API (WhatsApp).
 * Requer ctwa_clid (vindo do referral do webhook).
 */
export async function sendMetaConversionEvent(
  params: {
    dataset_id: string;
    waba_id: string;
    ctwa_clid: string;
    event_name: string;
    event_time?: number;
    custom_data?: Record<string, unknown>;
  },
  accessToken: string,
  partnerAgent?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const url = `${GRAPH_BASE}/${params.dataset_id}/events?access_token=${encodeURIComponent(accessToken)}`;
  const eventTime = params.event_time ?? Math.floor(Date.now() / 1000);
  const body = {
    data: [
      {
        event_name: params.event_name,
        event_time: eventTime,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: {
          whatsapp_business_account_id: params.waba_id,
          ctwa_clid: params.ctwa_clid,
        },
        ...(params.custom_data && Object.keys(params.custom_data).length > 0
          ? { custom_data: params.custom_data }
          : {}),
      },
    ],
    ...(partnerAgent ? { partner_agent: partnerAgent } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    return { ok: false, error: data.error?.message ?? res.statusText };
  }
  return { ok: true };
}

export type TrySendMetaConversionResult =
  | { ok: true; eventName: string }
  | { ok: false; reason: "no_ctwa_clid" | "mapping_disabled" | "no_dataset_or_waba" | "no_meta_token"; detail?: string }
  | { ok: false; reason: "send_failed"; eventName: string; error: string };

/**
 * Mesma lógica de envio CAPI que `maybeSendMetaConversion`, mas retorna resultado (útil para scripts e relatórios).
 */
export async function trySendMetaConversion(
  ourEvent: OurEventKey,
  ctwaClid: string | null,
  partnerId: string
): Promise<TrySendMetaConversionResult> {
  if (!ctwaClid?.trim()) {
    return { ok: false, reason: "no_ctwa_clid" };
  }

  const config = await getMetaCapiConfig(partnerId);
  const mapping = config.mapping[ourEvent];
  if (!mapping?.enabled || !mapping.event_name?.trim()) {
    return { ok: false, reason: "mapping_disabled" };
  }
  if (!config.dataset_id?.trim() || !config.waba_id?.trim()) {
    return { ok: false, reason: "no_dataset_or_waba" };
  }

  const token = await getMetaAccessToken(partnerId);
  if (!token) {
    return { ok: false, reason: "no_meta_token" };
  }

  const eventName = mapping.event_name.trim();
  const result = await sendMetaConversionEvent(
    {
      dataset_id: config.dataset_id,
      waba_id: config.waba_id,
      ctwa_clid: ctwaClid.trim(),
      event_name: eventName,
    },
    token,
    config.partner_agent
  ).catch(() => ({ ok: false, error: "request_failed" }));

  if (!result.ok) {
    return {
      ok: false,
      reason: "send_failed",
      eventName,
      error: result.error ?? "unknown_error",
    };
  }
  return { ok: true, eventName };
}

/**
 * Se a configuração CAPI estiver ativa para o evento nosso, envia o evento para a Meta.
 * Só envia se ctwa_clid existir.
 */
export async function maybeSendMetaConversion(
  ourEvent: OurEventKey,
  ctwaClid: string | null,
  partnerId: string
): Promise<void> {
  const outcome = await trySendMetaConversion(ourEvent, ctwaClid, partnerId);
  if (outcome.ok) return;
  if (outcome.reason === "no_ctwa_clid" || outcome.reason === "mapping_disabled" || outcome.reason === "no_dataset_or_waba" || outcome.reason === "no_meta_token") {
    return;
  }
  console.error("[meta-capi] failed to send conversion", {
    partnerId,
    ourEvent,
    eventName: outcome.eventName,
    error: outcome.error,
  });
}
