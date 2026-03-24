import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

const KEY = "meta_access_token";

/**
 * GET /api/settings/meta-token
 * Retorna se o token Meta está configurado (sem expor o valor).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:meta-token:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data } = await supabaseUser
    .from("app_settings")
    .select("key")
    .eq("key", KEY)
    .eq("partner_id", partnerId)
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
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:meta-token:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

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

  const { error } = await supabaseUser
    .from("app_settings")
    .upsert(
      { partner_id: partnerId, key: KEY, value: token, updated_at: new Date().toISOString() },
      { onConflict: "partner_id,key" }
    );

  if (error) {
    logApiError("meta-token", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, configured: true });
}
