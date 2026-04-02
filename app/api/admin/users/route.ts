import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

type UserMembershipRow = {
  user_id: string;
  role: string;
  partners: {
    id: string;
    name: string;
    slug: string;
  } | null;
  users: {
    id: string;
    email: string;
    full_name: string | null;
    is_global_admin: boolean;
  } | null;
};

type UserSummary = {
  id: string;
  email: string;
  full_name: string | null;
  is_global_admin: boolean;
  memberships: Array<{
    partner_id: string;
    partner_name: string;
    partner_slug: string;
    role: string;
  }>;
};

function aggregateUsers(rows: UserMembershipRow[]): UserSummary[] {
  const byUser = new Map<string, UserSummary>();

  for (const row of rows) {
    if (!row.users?.id) continue;
    const existing = byUser.get(row.users.id) ?? {
      id: row.users.id,
      email: row.users.email,
      full_name: row.users.full_name ?? null,
      is_global_admin: row.users.is_global_admin === true,
      memberships: [],
    };
    if (row.partners?.id) {
      existing.memberships.push({
        partner_id: row.partners.id,
        partner_name: row.partners.name,
        partner_slug: row.partners.slug,
        role: row.role,
      });
    }
    byUser.set(existing.id, existing);
  }

  return Array.from(byUser.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:users:list:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  if (user.isGlobalAdmin) {
    const { data, error } = await supabase
      .from("partner_members")
      .select(
        "user_id, role, partners(id, name, slug), users!inner(id, email, full_name, is_global_admin)"
      );
    if (error) {
      logApiError("admin:users:list:global", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
    const rows = (data ?? []) as unknown as UserMembershipRow[];
    return NextResponse.json({ users: aggregateUsers(rows), scope: "global" });
  }

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const { data, error } = await supabaseUser
    .from("partner_members")
    .select("user_id, role, partners!inner(id, name, slug), users!inner(id, email, full_name, is_global_admin)")
    .eq("partner_id", partnerId);
  if (error) {
    logApiError("admin:users:list:tenant", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as UserMembershipRow[];
  return NextResponse.json({ users: aggregateUsers(rows), scope: "tenant", partner_id: partnerId });
}
