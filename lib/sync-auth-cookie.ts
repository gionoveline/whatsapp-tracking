"use client";

/**
 * Define o cookie httpOnly usado pelo middleware e rotas protegidas.
 */
export async function syncAuthCookie(accessToken: string): Promise<boolean> {
  const token = accessToken.trim();
  if (!token) return false;

  try {
    const res = await fetch("/api/auth/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accessToken: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function hasServerAuthCookie(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/cookie", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({} as { hasAuthCookie?: boolean }));
    return json.hasAuthCookie === true;
  } catch {
    return false;
  }
}

export async function waitForServerAuthCookie(maxAttempts = 5, delayMs = 150): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const hasCookie = await hasServerAuthCookie();
    if (hasCookie) return true;
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
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
