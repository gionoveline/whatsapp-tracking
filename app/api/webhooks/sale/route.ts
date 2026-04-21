import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isUuidLike, requireWebhookSecretForPartner } from "@/lib/webhook-auth";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";
import { resolveWebhookPartner } from "@/lib/server-auth";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited, parseIsoDatetime } from "@/lib/request-security";

/**
 * POST /api/webhooks/sale — Venda fechada.
 * Body: { occurred_at } + ({ conversation_id } ou { phone }).
 */
export async function POST(request: NextRequest) {
  const partnerIdHeader = request.headers.get("x-partner-id")?.trim();
  if (!partnerIdHeader || !isUuidLike(partnerIdHeader)) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`webhook:sale:${partnerIdHeader}:${ip}`, 200, 15 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!(await requireWebhookSecretForPartner(request, partnerIdHeader))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; phone?: string; occurred_at?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const occurredAt = typeof body.occurred_at === "string" ? parseIsoDatetime(body.occurred_at) : null;
  if (!occurredAt) {
    return NextResponse.json(
      { error: "occurred_at is required and must be a valid ISO datetime" },
      { status: 400 }
    );
  }
  const update = { status: "venda" as const, won_at: occurredAt, updated_at: occurredAt };
  const partnerId = await resolveWebhookPartner(request);
  if (!partnerId) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  const metaEventTimeMs = new Date(occurredAt).getTime();
  const metaEventTimeSec = Number.isNaN(metaEventTimeMs)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(metaEventTimeMs / 1000);

  if (body.conversation_id && typeof body.conversation_id === "string") {
    const { data, error } = await supabase
      .from("leads")
      .update(update)
      .eq("partner_id", partnerId)
      .eq("conversation_id", body.conversation_id)
      .select("id, conversation_id, status, won_at, ctwa_clid")
      .single();

    if (error) {
      logApiError("webhook:sale", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "No lead found for this conversation_id" },
        { status: 404 }
      );
    }
    await maybeSendMetaConversion("venda", data.ctwa_clid ?? null, partnerId, { eventTime: metaEventTimeSec });
    return NextResponse.json({ ok: true, lead: data });
  }

  if (body.phone && typeof body.phone === "string") {
    const { data: latest } = await supabase
      .from("leads")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("contact_phone", body.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest?.id) {
      return NextResponse.json(
        { error: "No lead found for this phone" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", latest.id)
      .select("id, conversation_id, status, won_at, ctwa_clid")
      .single();

    if (error) {
      logApiError("webhook:sale", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    await maybeSendMetaConversion("venda", data?.ctwa_clid ?? null, partnerId, { eventTime: metaEventTimeSec });
    return NextResponse.json({ ok: true, lead: data });
  }

  return NextResponse.json(
    { error: "conversation_id or phone is required" },
    { status: 400 }
  );
}
