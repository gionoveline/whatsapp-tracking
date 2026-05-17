import { NextRequest, NextResponse } from "next/server";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import {
  generateGoogleLpProtocol,
  hashClientIp,
  renderProtocolMessage,
  sanitizeGoogleLpProtocolPayload,
} from "@/lib/google-lp-protocol";
import { resolveEmrCampaignForGo } from "@/lib/google-lp-resolve-emr";
import { GOOGLE_LP_TRACKING_CONFIG_KEY, parseStoredGoogleLpTracking } from "@/lib/google-lp-tracking-settings";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { supabase } from "@/lib/supabase";
import { isUuidLike } from "@/lib/webhook-auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`google-lp-protocol:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sanitized = sanitizeGoogleLpProtocolPayload(body);
  if (!sanitized.ok) {
    return json({ error: sanitized.error }, { status: 400 });
  }

  const { payload } = sanitized;
  if (!isUuidLike(payload.partnerId)) {
    return json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", payload.partnerId)
    .eq("key", GOOGLE_LP_TRACKING_CONFIG_KEY)
    .maybeSingle();

  if (settingsError) {
    logApiError("google-lp-protocol:settings", settingsError);
    return json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const config = parseStoredGoogleLpTracking(settingsRow?.value ?? null);
  const emrResolved = await resolveEmrCampaignForGo(
    supabase,
    payload.partnerId,
    payload.emrCampaignId,
    config.protocolMessageTemplate
  );
  if (!emrResolved.ok) {
    return json({ error: emrResolved.error }, { status: emrResolved.status });
  }

  const protocol = generateGoogleLpProtocol();
  const message = renderProtocolMessage(config.protocolMessageTemplate, {
    protocol,
    emrCampaignId: emrResolved.emrCampaignId,
  });
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error: insertError } = await supabase.from("google_lp_protocols").insert({
    partner_id: payload.partnerId,
    protocol,
    message,
    emr_campaign_id: emrResolved.emrCampaignId,
    attribution: payload.attribution,
    gclid: payload.attribution.gclid ?? null,
    wbraid: payload.attribution.wbraid ?? null,
    gbraid: payload.attribution.gbraid ?? null,
    utm_source: payload.attribution.utm_source ?? null,
    utm_medium: payload.attribution.utm_medium ?? null,
    utm_campaign: payload.attribution.utm_campaign ?? null,
    utm_content: payload.attribution.utm_content ?? null,
    utm_term: payload.attribution.utm_term ?? null,
    landing_url: payload.landingUrl,
    referrer: payload.referrer,
    user_agent: userAgent,
    ip_hash: hashClientIp(ip),
  });

  if (insertError) {
    logApiError("google-lp-protocol:insert", insertError);
    return json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return json({ protocol, message });
}
