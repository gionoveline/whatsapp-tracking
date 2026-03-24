import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

const KEY = "webhook_secret";

/**
 * GET /api/settings/webhook-secret
 * Returns whether a webhook secret is configured for the current partner (no secret value exposed).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:webhook-secret:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data } = await supabase
    .from("app_settings")
    .select("key")
    .eq("key", KEY)
    .eq("partner_id", partnerId)
    .single();

  return NextResponse.json({ configured: Boolean(data?.key) });
}

/**
 * POST /api/settings/webhook-secret
 * Body: { secret: string }
 * Stores the webhook shared secret for this tenant (`partner_id`).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:webhook-secret:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { secret?: string; generate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shouldGenerate = body.generate === true;
  const secret = shouldGenerate
    ? randomBytes(32).toString("hex")
    : typeof body.secret === "string"
      ? body.secret.trim()
      : "";

  if (!secret) return NextResponse.json({ error: "secret is required" }, { status: 400 });
  if (secret.length < 32) {
    return NextResponse.json({ error: "secret must have at least 32 characters" }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { partner_id: partnerId, key: KEY, value: secret, updated_at: new Date().toISOString() },
      { onConflict: "partner_id,key" }
    );

  if (error) {
    logApiError("webhook-secret", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    generated: shouldGenerate,
    secret: shouldGenerate ? secret : undefined,
  });
}

