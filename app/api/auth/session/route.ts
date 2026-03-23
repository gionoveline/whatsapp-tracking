import { NextRequest, NextResponse } from "next/server";
import { getAccessiblePartners, getAuthenticatedUser } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userSupabase = createSupabaseForUserAccessToken(user.accessToken);
  const partners = await getAccessiblePartners(user, userSupabase);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      is_global_admin: user.isGlobalAdmin,
    },
    partners,
  });
}
