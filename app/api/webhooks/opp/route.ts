import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireWebhookSecret } from "@/lib/webhook-auth";
import { maybeSendMetaConversion } from "@/lib/meta-conversions";

export async function POST(request: NextRequest) {
  if (!requireWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversation_id?: string; opp_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const conversationId = body.conversation_id;
  if (!conversationId || typeof conversationId !== "string") {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("leads")
    .update({
      status: "sql",
      opp_id: body.opp_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId)
    .select("id, conversation_id, status, opp_id, ctwa_clid")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "No lead found for this conversation_id" },
      { status: 404 }
    );
  }

  await maybeSendMetaConversion("sql", data.ctwa_clid ?? null);

  return NextResponse.json({ ok: true, lead: data });
}
