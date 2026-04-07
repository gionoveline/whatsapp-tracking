import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { isValidPartnerMemberRole } from "@/lib/partner-membership-roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:users:memberships:post:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { userId } = await params;
  const targetUserId = userId?.trim();
  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  let body: { partner_id?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const partnerId = typeof body.partner_id === "string" ? body.partner_id.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  if (!isValidPartnerMemberRole(role)) {
    return NextResponse.json({ error: "role must be owner, admin or member" }, { status: 400 });
  }

  const { data: targetUser } = await supabase.from("users").select("id").eq("id", targetUserId).maybeSingle();
  if (!targetUser?.id) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const { data: partner } = await supabase.from("partners").select("id").eq("id", partnerId).maybeSingle();
  if (!partner?.id) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { error: upsertErr } = await supabase.from("partner_members").upsert(
    {
      partner_id: partnerId,
      user_id: targetUserId,
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,user_id" }
  );

  if (upsertErr) {
    logApiError("admin:users:memberships:upsert", upsertErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  const { data: row } = await supabase
    .from("partner_members")
    .select("user_id, role, partners(id, name, slug)")
    .eq("partner_id", partnerId)
    .eq("user_id", targetUserId)
    .single();

  return NextResponse.json({ ok: true, membership: row });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:users:memberships:del:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { userId } = await params;
  const targetUserId = userId?.trim();
  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const partnerId = request.nextUrl.searchParams.get("partner_id")?.trim() ?? "";
  if (!partnerId) return NextResponse.json({ error: "partner_id query is required" }, { status: 400 });

  const { error: delErr } = await supabase
    .from("partner_members")
    .delete()
    .eq("partner_id", partnerId)
    .eq("user_id", targetUserId);

  if (delErr) {
    logApiError("admin:users:memberships:delete", delErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
