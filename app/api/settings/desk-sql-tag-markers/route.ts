import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import {
  DEFAULT_DESK_SQL_TAG_MARKERS,
  DESK_SQL_TAG_MARKERS_KEY,
  getDeskSqlTagMarkersForPartner,
  parseStoredSqlTagMarkers,
  sanitizeSqlTagMarkersInput,
} from "@/lib/desk-sql-tag-markers";

/**
 * GET — lista efetiva de marcadores SQL (custom ou padrao).
 * POST — body { markers: string[] }; vazio remove customizacao e volta ao padrao.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sql-tags:${user.id}:${ip}`, 40, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data } = await supabaseUser
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_SQL_TAG_MARKERS_KEY)
    .maybeSingle();

  const parsedStored = parseStoredSqlTagMarkers(data?.value ?? null);
  const customized = parsedStored != null && parsedStored.length > 0;
  const markers = await getDeskSqlTagMarkersForPartner(partnerId, supabaseUser);

  return NextResponse.json({
    markers,
    defaults: [...DEFAULT_DESK_SQL_TAG_MARKERS],
    customized,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-sql-tags-post:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { markers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const markers = sanitizeSqlTagMarkersInput(body.markers);

  if (markers.length === 0) {
    const { error } = await supabaseUser
      .from("app_settings")
      .delete()
      .eq("partner_id", partnerId)
      .eq("key", DESK_SQL_TAG_MARKERS_KEY);

    if (error) {
      logApiError("desk-sql-tag-markers:delete", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      markers: [...DEFAULT_DESK_SQL_TAG_MARKERS],
      customized: false,
    });
  }

  const { error } = await supabaseUser.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: DESK_SQL_TAG_MARKERS_KEY,
      value: JSON.stringify(markers),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );

  if (error) {
    logApiError("desk-sql-tag-markers:upsert", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, markers, customized: true });
}
