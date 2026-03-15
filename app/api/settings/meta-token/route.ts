import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const KEY = "meta_access_token";

/**
 * GET /api/settings/meta-token
 * Retorna se o token Meta está configurado (sem expor o valor).
 */
export async function GET() {
  const { data } = await supabase
    .from("app_settings")
    .select("key")
    .eq("key", KEY)
    .single();

  return NextResponse.json({
    configured: Boolean(data?.key),
  });
}

/**
 * POST /api/settings/meta-token
 * Body: { token: string }
 * Salva o token Meta (ex.: informado pelo usuário no front).
 */
export async function POST(request: NextRequest) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: KEY, value: token, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, configured: true });
}
