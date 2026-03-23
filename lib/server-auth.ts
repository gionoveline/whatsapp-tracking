import { NextRequest } from "next/server";
import { isAllowedEmail, GLOBAL_ADMIN_EMAIL } from "@/lib/auth-constants";
import { supabase } from "@/lib/supabase";

type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string | null;
  isGlobalAdmin: boolean;
  accessToken: string;
};

function extractEmailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

async function ensureUserProfileAndAutoMembership(user: {
  id: string;
  email: string;
  fullName: string | null;
  isGlobalAdmin: boolean;
}) {
  await supabase.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      is_global_admin: user.isGlobalAdmin,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (user.isGlobalAdmin) return;

  const domain = extractEmailDomain(user.email);
  if (!domain) return;

  const { data: partnerByDomain, error } = await supabase
    .from("partners")
    .select("id")
    .eq("allowed_email_domain", domain)
    .eq("auto_link_by_domain", true)
    .maybeSingle();
  if (error || !partnerByDomain?.id) return;

  await supabase
    .from("partner_members")
    .upsert(
      {
        partner_id: partnerByDomain.id,
        user_id: user.id,
        role: "member",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,user_id", ignoreDuplicates: true }
    );
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) return null;

  const email = data.user.email.toLowerCase();
  if (!isAllowedEmail(email)) return null;

  const fullName =
    (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
    (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
    null;
  const isGlobalAdmin = email === GLOBAL_ADMIN_EMAIL;
  await ensureUserProfileAndAutoMembership({
    id: data.user.id,
    email,
    fullName,
    isGlobalAdmin,
  });

  return {
    id: data.user.id,
    email,
    fullName,
    isGlobalAdmin,
    accessToken: token,
  };
}

export async function getAccessiblePartners(user: AuthenticatedUser, supabaseClient = supabase) {
  if (user.isGlobalAdmin) {
    // Super admin deve listar todas as empresas, sem depender de RLS do token do usuario.
    const { data, error } = await supabase
      .from("partners")
      .select("id, slug, name, logo_url")
      .order("name", { ascending: true });
    if (error) {
      const fallback = await supabase
        .from("partners")
        .select("id, slug, name")
        .order("name", { ascending: true });
      return fallback.data ?? [];
    }
    return data ?? [];
  }

  const { data, error } = await supabaseClient
    .from("partner_members")
    .select("partner_id, role, partners!inner(id, slug, name, logo_url)")
    .eq("user_id", user.id);
  const resolvedData = data;
  if (error) {
    const fallback = await supabaseClient
      .from("partner_members")
      .select("partner_id, role, partners!inner(id, slug, name)")
      .eq("user_id", user.id);
    if (fallback.error) return [];
    type FallbackMemberRow = {
      partner_id: string;
      role: string;
      partners: { id: string; slug: string; name: string };
    };
    const fallbackRows = (fallback.data ?? []) as unknown as FallbackMemberRow[];
    return fallbackRows.map((row) => ({
      id: row.partners.id,
      slug: row.partners.slug,
      name: row.partners.name,
      logo_url: null,
      role: row.role,
    }));
  }

  type MemberRow = {
    partner_id: string;
    role: string;
    partners: { id: string; slug: string; name: string; logo_url?: string | null };
  };

  const rows = (resolvedData ?? []) as unknown as MemberRow[];

  return rows.map((row) => ({
    id: row.partners.id,
    slug: row.partners.slug,
    name: row.partners.name,
    logo_url: row.partners.logo_url ?? null,
    role: row.role,
  }));
}

export async function resolvePartnerFromRequest(request: NextRequest, user: AuthenticatedUser): Promise<string | null> {
  const partnerId = request.headers.get("x-partner-id")?.trim();
  if (!partnerId) return null;

  if (user.isGlobalAdmin) return partnerId;

  const { data } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("user_id", user.id)
    .eq("partner_id", partnerId)
    .single();

  return data?.partner_id ?? null;
}

export async function resolveWebhookPartner(request: NextRequest): Promise<string | null> {
  const partnerId = request.headers.get("x-partner-id")?.trim();
  if (!partnerId) return null;

  const { data } = await supabase.from("partners").select("id").eq("id", partnerId).single();
  return data?.id ?? null;
}
