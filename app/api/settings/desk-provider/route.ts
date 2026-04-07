import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  DESK_PROVIDER_ACTIVE_KEY,
  DESK_PROVIDER_OPTIONS,
  isDeskProviderId,
} from "@/lib/integrations/providers";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-provider:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data } = await supabaseUser
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_PROVIDER_ACTIVE_KEY)
    .maybeSingle();

  const activeProvider = typeof data?.value === "string" && isDeskProviderId(data.value) ? data.value : null;

  return NextResponse.json({
    activeProvider,
    providers: DESK_PROVIDER_OPTIONS,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-provider:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { providerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
  if (!providerId || !isDeskProviderId(providerId)) {
    return NextResponse.json({ error: "providerId is invalid" }, { status: 400 });
  }

  const { error } = await supabaseUser.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: DESK_PROVIDER_ACTIVE_KEY,
      value: providerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );

  if (error) {
    logApiError("desk-provider", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activeProvider: providerId });
}
