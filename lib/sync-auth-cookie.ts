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
