import { NextRequest, NextResponse } from "next/server";
import { parseOctaDeskPayload } from "@/lib/octadesk";
import { fetchAdInfo } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { requireWebhookSecret } from "@/lib/webhook-auth";
import { getMetaAccessToken } from "@/lib/get-meta-token";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";

/**
 * POST /api/webhooks/lead — Conversa iniciada (CTWA).
 * Campos obrigatórios no payload: telefone do lead, id do anúncio (source_id), ctwa_clid, headline, source_url.
 */
export async function POST(request: NextRequest) {
  if (!requireWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseOctaDeskPayload(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Payload must include CTWA referral with source_id and ctwa_clid" },
      { status: 400 }
    );
  }
  if (!parsed.contactPhone?.trim()) {
    return NextResponse.json(
      { error: "contact_phone is required (conversation must be tied to a phone number)" },
      { status: 400 }
    );
  }
  if (!parsed.headline?.trim() || !parsed.sourceUrl?.trim()) {
    return NextResponse.json(
      { error: "Referral must include headline and source_url (ad fields required)" },
      { status: 400 }
    );
  }

  const token = await getMetaAccessToken();
  let campaignId: string | null = null;
  let campaignName: string | null = null;
  let adsetId: string | null = null;
  let adsetName: string | null = null;
  let adName: string | null = null;

  if (parsed.sourceId && token) {
    const { data: cached } = await supabase
      .from("meta_ad_cache")
      .select("ad_name, campaign_id, campaign_name, adset_id, adset_name")
      .eq("ad_id", parsed.sourceId)
      .single();

    if (cached) {
      adName = cached.ad_name;
      campaignId = cached.campaign_id;
      campaignName = cached.campaign_name;
      adsetId = cached.adset_id;
      adsetName = cached.adset_name;
    } else {
      const meta = await fetchAdInfo(parsed.sourceId, token);
      if (meta) {
        adName = meta.adName;
        campaignId = meta.campaignId;
        campaignName = meta.campaignName;
        adsetId = meta.adsetId;
        adsetName = meta.adsetName;
        await supabase.from("meta_ad_cache").upsert({
          ad_id: parsed.sourceId,
          ad_name: meta.adName,
          campaign_id: meta.campaignId,
          campaign_name: meta.campaignName,
          adset_id: meta.adsetId,
          adset_name: meta.adsetName,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "ad_id" });
      }
    }
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(
      {
        conversation_id: parsed.conversationId,
        contact_name: parsed.contactName,
        contact_phone: parsed.contactPhone,
        source_id: parsed.sourceId,
        ctwa_clid: parsed.ctwaClid,
        headline: parsed.headline,
        ad_body: parsed.adBody,
        image_url: parsed.imageUrl,
        source_url: parsed.sourceUrl,
        campaign_id: campaignId,
        campaign_name: campaignName,
        adset_id: adsetId,
        adset_name: adsetName,
        ad_name: adName,
        status: "lead",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" }
    )
    .select("id, conversation_id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await maybeSendMetaConversion("lead", parsed.ctwaClid ?? null);

  return NextResponse.json({ ok: true, lead });
}
