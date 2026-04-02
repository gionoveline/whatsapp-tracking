import { NextRequest, NextResponse } from "next/server";
import { getAccessiblePartners, getAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { shouldRequireOnboarding } from "@/lib/partner-onboarding";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`auth:session:get:${ip}`, 120, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userSupabase = createSupabaseForUserAccessToken(user.accessToken);
  const partners = await getAccessiblePartners(user, userSupabase);
  const needsOnboarding = shouldRequireOnboarding(user.isGlobalAdmin, partners);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      is_global_admin: user.isGlobalAdmin,
    },
    partners,
    needs_onboarding: needsOnboarding,
  });
}
