import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedEmail } from "@/lib/auth-constants";
import { authDebug } from "@/lib/auth-debug";

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

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get("purpose") === "prefetch" ||
    request.headers.has("next-router-prefetch")
  );
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isBypassedPath(pathname)) return NextResponse.next();

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? "";
  const authStatus = user && isAllowedEmail(email) ? "present" : "missing";

  const isPublic = PUBLIC_PATHS.has(pathname);
  const isPrefetch = isPrefetchRequest(request);
  const hasAuthCookie = hasSupabaseAuthCookie(request);
  const requestId = request.headers.get("x-vercel-id") ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  authDebug("middleware.check", {
    requestId,
    host: request.nextUrl.host,
    pathname,
    isPublic,
    isPrefetch,
    hasAuthCookie,
    authStatus,
  });

  if (authStatus === "missing" && !isPublic) {
    if (hasAuthCookie) {
      authDebug("middleware.skip_redirect_cookie_present", {
        requestId,
        from: pathname,
      });
      return response;
    }

    if (isPrefetch) {
      authDebug("middleware.skip_redirect_prefetch", {
        requestId,
        from: pathname,
      });
      return NextResponse.next();
    }

    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    authDebug("middleware.redirect_login", {
      requestId,
      from: pathname,
      to: url.pathname,
      reason: "missing_cookie",
    });
    return NextResponse.redirect(url);
  }

  if (authStatus === "present" && pathname === "/login") {
    authDebug("middleware.redirect_dashboard", {
      requestId,
      from: pathname,
      to: "/dashboard",
      reason: "cookie_present",
    });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

