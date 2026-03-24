/**
 * Define o cookie httpOnly que o middleware usa (`wt_access_token`).
 * Deve retornar true antes de redirecionar para rotas protegidas.
 */
export async function syncAuthCookie(accessToken: string): Promise<boolean> {
  const res = await fetch("/api/auth/cookie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ accessToken }),
  });
  return res.ok;
}
