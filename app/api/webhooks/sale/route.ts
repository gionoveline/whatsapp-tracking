import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireWebhookSecret } from "@/lib/webhook-auth";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";

/**
 * POST /api/webhooks/sale — Venda fechada.
 * Body: { conversation_id } ou { phone }.
 */
export async function POST(request: NextRequest) {
  if (!requireWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update = { status: "venda" as const, won_at: now, updated_at: now };

  if (body.conversation_id && typeof body.conversation_id === "string") {
    const { data, error } = await supabase
      .from("leads")
      .update(update)
      .eq("conversation_id", body.conversation_id)
      .select("id, conversation_id, status, won_at, ctwa_clid")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: "No lead found for this conversation_id" },
        { status: 404 }
      );
    }
    await maybeSendMetaConversion("venda", data.ctwa_clid ?? null);
    return NextResponse.json({ ok: true, lead: data });
  }

  if (body.phone && typeof body.phone === "string") {
    const { data: latest } = await supabase
      .from("leads")
      .select("id")
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await maybeSendMetaConversion("venda", data?.ctwa_clid ?? null);
    return NextResponse.json({ ok: true, lead: data });
  }

  return NextResponse.json(
    { error: "conversation_id or phone is required" },
    { status: 400 }
  );
}
