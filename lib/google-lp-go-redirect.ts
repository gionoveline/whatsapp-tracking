import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_GOOGLE_LP_TRACKING,
  GOOGLE_LP_TRACKING_CONFIG_KEY,
  parseStoredGoogleLpTracking,
} from "@/lib/google-lp-tracking-settings";
import { isUuidLike } from "@/lib/webhook-auth";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  appendMessageToWhatsAppUrl,
  isWhatsAppRedirectTargetUrl,
  parseNextRedirectUrl,
  buildAttributionRefererAllowlist,
  readAttributionForGoRequest,
} from "@/lib/landing-redirect";
import { resolvePublicSiteOrigin } from "@/lib/public-site-url";
import { readEmrCampaignIdFromSearchParams } from "@/lib/google-lp-campaign-links";
import { resolveEmrCampaignForGo } from "@/lib/google-lp-resolve-emr";
import {
  generateGoogleLpProtocol,
  hashClientIp,
  renderProtocolMessage,
} from "@/lib/google-lp-protocol";
import { resolveGoogleLpCaptureSource, type GoogleLpCaptureSource } from "@/lib/google-lp-capture-source";
import { logApiError } from "@/lib/api-errors";

export type GoogleLpGoEntryPath = "/go" | "/wci";

/**
 * Handler compartilhado WCI / Google LP: gera GLP, persiste gclid e redireciona ao WhatsApp.
 * `/wci` = extensões de mensagem do Google Ads (click direto, sem landing).
 */
export async function handleGoogleLpGoRedirect(
  request: NextRequest,
  entryPath: GoogleLpGoEntryPath
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateKey = entryPath === "/wci" ? `public-wci:${ip}` : `public-go:${ip}`;
  const { limited } = isRateLimited(rateKey, 120, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = request.nextUrl;
  const partnerId = url.searchParams.get("partner_id")?.trim() ?? "";
  const nextRaw = url.searchParams.get("next")?.trim() ?? url.searchParams.get("u")?.trim() ?? "";

  if (!isUuidLike(partnerId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", GOOGLE_LP_TRACKING_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const config = parseStoredGoogleLpTracking(data?.value ?? null);
  const nextParsed = parseNextRedirectUrl(nextRaw || (config.whatsappPhone ? `https://wa.me/${config.whatsappPhone}` : ""));
  if (!nextParsed.ok) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isWhatsAppRedirectTargetUrl(nextParsed.url, DEFAULT_GOOGLE_LP_TRACKING.whatsappLinkHosts)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emrResolved = await resolveEmrCampaignForGo(
    supabase,
    partnerId,
    readEmrCampaignIdFromSearchParams(url.searchParams),
    config.protocolMessageTemplate
  );
  if (!emrResolved.ok) {
    return NextResponse.json({ error: emrResolved.error }, { status: emrResolved.status });
  }

  const allowedRefererHosts = buildAttributionRefererAllowlist({
    redirectAllowedHosts: config.redirectAllowedHosts,
    siteUrl: resolvePublicSiteOrigin(request) || process.env.NEXT_PUBLIC_SITE_URL || null,
  });
  const refererHeader = request.headers.get("referer");
  const attribution = readAttributionForGoRequest(url, refererHeader, allowedRefererHosts);
  const captureSource: GoogleLpCaptureSource = resolveGoogleLpCaptureSource({
    entryPath,
    refererHeader,
    allowedLandingHosts: config.redirectAllowedHosts,
  });

  const protocol = generateGoogleLpProtocol();
  const message = renderProtocolMessage(config.protocolMessageTemplate, {
    protocol,
    emrCampaignId: emrResolved.emrCampaignId,
  });
  const destination = appendMessageToWhatsAppUrl(nextParsed.url, message);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error: insertError } = await supabase.from("google_lp_protocols").insert({
    partner_id: partnerId,
    protocol,
    message,
    emr_campaign_id: emrResolved.emrCampaignId,
    capture_source: captureSource,
    attribution,
    gclid: attribution.gclid ?? null,
    wbraid: attribution.wbraid ?? null,
    gbraid: attribution.gbraid ?? null,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
    utm_content: attribution.utm_content ?? null,
    utm_term: attribution.utm_term ?? null,
    landing_url: refererHeader?.slice(0, 2048) ?? null,
    referrer: refererHeader?.slice(0, 2048) ?? null,
    user_agent: userAgent,
    ip_hash: hashClientIp(ip),
  });

  if (insertError) {
    logApiError(`${entryPath}:google-lp-protocol:insert`, insertError);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const res = NextResponse.redirect(destination.toString(), 302);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
