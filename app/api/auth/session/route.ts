import { NextRequest, NextResponse } from "next/server";
import { authDebug, maskEmail } from "@/lib/auth-debug";
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
  const requestId = request.headers.get("x-vercel-id") ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const user = await getAuthenticatedUser(request);
  if (!user) {
    authDebug("session.get_unauthorized", {
      requestId,
      hasAuthorizationHeader: !!request.headers.get("authorization"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userSupabase = createSupabaseForUserAccessToken(user.accessToken);
  const partners = await getAccessiblePartners(user, userSupabase);
  const needsOnboarding = shouldRequireOnboarding(user.isGlobalAdmin, partners);
  authDebug("session.get_ok", {
    requestId,
    userId: user.id,
    email: maskEmail(user.email),
    isGlobalAdmin: user.isGlobalAdmin,
    partnersCount: partners.length,
    needsOnboarding,
  });

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
