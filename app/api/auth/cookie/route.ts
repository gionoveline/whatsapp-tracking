import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth-constants";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";
import { supabase } from "@/lib/supabase";
import { getClientIp, isRateLimited } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`auth:cookie:post:${ip}`, 60, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  const email = data.user?.email?.toLowerCase() ?? "";

  if (error || !data.user || !isAllowedEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`auth:cookie:delete:${ip}`, 60, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}

