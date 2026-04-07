"use client";

/**
 * Syncs Supabase access token into the httpOnly auth cookie consumed by server routes.
 */
export async function syncAuthCookie(accessToken: string): Promise<boolean> {
  const token = accessToken.trim();
  if (!token) return false;

  try {
    const response = await fetch("/api/auth/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function clearAuthCookie(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/cookie", {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}
