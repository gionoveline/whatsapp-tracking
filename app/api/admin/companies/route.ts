import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`admin:companies:list:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  if (user.isGlobalAdmin) {
    const { data, error } = await supabase
      .from("partners")
      .select("id, name, slug, logo_url, auto_link_by_domain, allowed_email_domain, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      logApiError("admin:companies:list:global", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }

    return NextResponse.json({ companies: data ?? [] });
  }

  const userSupabase = createSupabaseForUserAccessToken(user.accessToken);
  const { data, error } = await userSupabase
    .from("partner_members")
    .select("role, partners!inner(id, name, slug, logo_url, auto_link_by_domain, allowed_email_domain, created_at, updated_at)")
    .eq("user_id", user.id);

  if (error) {
    logApiError("admin:companies:list:tenant", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  type MemberWithPartner = {
    partners:
      | {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          auto_link_by_domain: boolean;
          allowed_email_domain: string | null;
          created_at: string;
          updated_at: string;
        }
      | Array<{
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          auto_link_by_domain: boolean;
          allowed_email_domain: string | null;
          created_at: string;
          updated_at: string;
        }>;
  };

  const companies = (data ?? []).flatMap((row) => {
    const partner = (row as unknown as MemberWithPartner).partners;
    if (!partner) return [];
    return Array.isArray(partner) ? partner : [partner];
  });
  return NextResponse.json({ companies });
}
