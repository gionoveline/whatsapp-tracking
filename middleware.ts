import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";

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
  return accessToken ? { status: "present" as const } : { status: "missing" as const };
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

  if (auth.status === "present" && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

