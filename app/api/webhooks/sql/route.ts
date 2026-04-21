import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isUuidLike, requireWebhookSecretForPartner } from "@/lib/webhook-auth";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";
import { resolveWebhookPartner } from "@/lib/server-auth";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited, parseIsoDatetime } from "@/lib/request-security";

/**
 * POST /api/webhooks/sql — Lead qualificado (SQL).
 * Body: { occurred_at } + ({ conversation_id } ou { phone }), { opp_id } (opcional).
 */
export async function POST(request: NextRequest) {
  const partnerIdHeader = request.headers.get("x-partner-id")?.trim();
  if (!partnerIdHeader || !isUuidLike(partnerIdHeader)) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`webhook:sql:${partnerIdHeader}:${ip}`, 200, 15 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!(await requireWebhookSecretForPartner(request, partnerIdHeader))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; phone?: string; opp_id?: string; occurred_at?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const conversationId = body.conversation_id;
  const phone = body.phone;
  const hasConversationId = typeof conversationId === "string" && conversationId.trim().length > 0;
  const hasPhone = typeof phone === "string" && phone.trim().length > 0;
  if (!hasConversationId && !hasPhone) {
    return NextResponse.json({ error: "conversation_id or phone is required" }, { status: 400 });
  }
  const occurredAt = typeof body.occurred_at === "string" ? parseIsoDatetime(body.occurred_at) : null;
  if (!occurredAt) {
    return NextResponse.json(
      { error: "occurred_at is required and must be a valid ISO datetime" },
      { status: 400 }
    );
  }

  const partnerId = await resolveWebhookPartner(request);
  if (!partnerId) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  let data: { id: string; conversation_id: string; status: string; opp_id: string | null; ctwa_clid: string | null } | null = null;

  if (hasConversationId) {
    const result = await supabase
      .from("leads")
      .update({
        status: "sql",
        opp_id: body.opp_id ?? null,
        updated_at: occurredAt,
      })
      .eq("partner_id", partnerId)
      .eq("conversation_id", conversationId!.trim())
      .select("id, conversation_id, status, opp_id, ctwa_clid")
      .single();

    if (result.error) {
      logApiError("webhook:sql", result.error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    data = result.data;
    if (!data) {
      return NextResponse.json(
        { error: "No lead found for this conversation_id" },
        { status: 404 }
      );
    }
  } else {
    const latestResult = await supabase
      .from("leads")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("contact_phone", phone!.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestResult.error) {
      logApiError("webhook:sql", latestResult.error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    if (!latestResult.data?.id) {
      return NextResponse.json({ error: "No lead found for this phone" }, { status: 404 });
    }

    const result = await supabase
      .from("leads")
      .update({
        status: "sql",
        opp_id: body.opp_id ?? null,
        updated_at: occurredAt,
      })
      .eq("id", latestResult.data.id)
      .select("id, conversation_id, status, opp_id, ctwa_clid")
      .single();

    if (result.error) {
      logApiError("webhook:sql", result.error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    data = result.data;
  }

  const eventTimeMs = new Date(occurredAt).getTime();
  const eventTimeSec = Number.isNaN(eventTimeMs)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(eventTimeMs / 1000);
  await maybeSendMetaConversion("sql", data.ctwa_clid ?? null, partnerId, { eventTime: eventTimeSec });

  return NextResponse.json({ ok: true, lead: data });
}
