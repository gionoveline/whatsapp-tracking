import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { GLOBAL_ADMIN_EMAIL } from "@/lib/auth-constants";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:users:patch:${user.id}:${ip}`, 40, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { userId } = await params;
  const targetId = userId?.trim();
  if (!targetId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  let body: { full_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullNameRaw = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (fullNameRaw.length > 200) {
    return NextResponse.json({ error: "Nome muito longo (máx. 200 caracteres)." }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", targetId)
    .maybeSingle();
  if (fetchErr) {
    logApiError("admin:users:patch:fetch", fetchErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
  if (!existing?.id) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const { data: updated, error: upErr } = await supabase
    .from("users")
    .update({
      full_name: fullNameRaw.length > 0 ? fullNameRaw : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId)
    .select("id, email, full_name, is_global_admin")
    .single();

  if (upErr) {
    logApiError("admin:users:patch:update", upErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:users:delete:${user.id}:${ip}`, 20, 60 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { userId } = await params;
  const targetId = userId?.trim();
  if (!targetId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  if (targetId === user.id) {
    return NextResponse.json({ error: "Não é possível excluir o próprio usuário." }, { status: 400 });
  }

  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", targetId)
    .maybeSingle();
  if (fetchErr) {
    logApiError("admin:users:delete:fetch", fetchErr);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
  if (!target?.id) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const targetEmail = String(target.email ?? "").trim().toLowerCase();
  if (targetEmail === GLOBAL_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Não é permitido excluir a conta de super administrador principal." }, { status: 400 });
  }

  const { error: authErr } = await supabase.auth.admin.deleteUser(targetId);
  if (authErr) {
    logApiError("admin:users:delete:auth", authErr);
    return NextResponse.json({ error: authErr.message || GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
