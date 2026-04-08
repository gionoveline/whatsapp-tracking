import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";
import { isAllowedEmail } from "@/lib/auth-constants";

const PUBLIC_PATHS = new Set(["/", "/login", "/auth/callback"]);

function isBypassedPath(pathname: string) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    // Allow static files from /public (e.g. /security/*.svg)
    /\.[a-z0-9]+$/i.test(pathname) ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

async function isAuthenticated(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (!accessToken) {
    return { status: "missing" as const };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(accessToken);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!error && !!data.user && isAllowedEmail(email)) {
    return { status: "valid" as const };
  }

  // A stale access token can happen before the client refresh flow runs.
  // Keep app routes accessible so SessionCookieSync can recover the cookie.
  return { status: "invalid" as const };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isBypassedPath(pathname)) return NextResponse.next();

  const auth = await isAuthenticated(request);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (auth.status === "missing" && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (auth.status === "valid" && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

