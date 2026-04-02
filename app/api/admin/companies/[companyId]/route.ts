import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

function slugifyCompanyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return base || "empresa";
}

async function getUniqueSlug(companyId: string, companyName: string): Promise<string> {
  const base = slugifyCompanyName(companyName);
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base.slice(0, 44)}-${i + 1}`;
    const { data, error } = await supabase
      .from("partners")
      .select("id")
      .eq("slug", candidate)
      .neq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return candidate;
  }
  throw new Error("Unable to generate unique company slug");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:companies:update:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { companyId } = await params;
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  let body: {
    name?: string;
    logo_url?: string | null;
    auto_link_by_domain?: boolean;
    allowed_email_domain?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string") {
    const companyName = body.name.trim();
    if (companyName.length < 2) {
      return NextResponse.json({ error: "companyName is required (min 2 chars)" }, { status: 400 });
    }
    if (companyName.length > 120) {
      return NextResponse.json({ error: "companyName is too long (max 120 chars)" }, { status: 400 });
    }
    payload.name = companyName;
    payload.slug = await getUniqueSlug(companyId, companyName);
  }

  if (body.logo_url !== undefined) {
    const logoUrl = typeof body.logo_url === "string" ? body.logo_url.trim() : "";
    payload.logo_url = logoUrl || null;
  }

  if (body.auto_link_by_domain !== undefined) {
    payload.auto_link_by_domain = body.auto_link_by_domain === true;
  }

  if (body.allowed_email_domain !== undefined) {
    const normalizedDomain =
      typeof body.allowed_email_domain === "string" ? body.allowed_email_domain.trim().toLowerCase() : "";
    payload.allowed_email_domain = normalizedDomain || null;
  }

  if (Object.keys(payload).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (payload.auto_link_by_domain === false) {
    payload.allowed_email_domain = null;
  }
  if (payload.auto_link_by_domain === true && !payload.allowed_email_domain) {
    return NextResponse.json({ error: "allowed_email_domain is required when auto_link_by_domain is true" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("partners")
    .update(payload)
    .eq("id", companyId)
    .select("id, name, slug, logo_url, auto_link_by_domain, allowed_email_domain, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Nome/slug ou dominio ja em uso por outra empresa." }, { status: 409 });
    }
    logApiError("admin:companies:update", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isGlobalAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:companies:delete:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { companyId } = await params;
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const { data: company, error: companyError } = await supabase
    .from("partners")
    .select("id, slug, name")
    .eq("id", companyId)
    .single();
  if (companyError || !company?.id) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 404 });
  }

  // Super Admin can delete any company; remove dependent rows first.
  const cleanupOrder: Array<{ table: "leads" | "meta_ad_cache" | "app_settings" | "partner_members"; key: string }> = [
    { table: "leads", key: "partner_id" },
    { table: "meta_ad_cache", key: "partner_id" },
    { table: "app_settings", key: "partner_id" },
    { table: "partner_members", key: "partner_id" },
  ];
  for (const target of cleanupOrder) {
    const { error: cleanupError } = await supabase.from(target.table).delete().eq(target.key, companyId);
    if (cleanupError) {
      logApiError(`admin:companies:delete:cleanup:${target.table}`, cleanupError);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("partners").delete().eq("id", companyId);
  if (deleteError) {
    logApiError("admin:companies:delete", deleteError);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
