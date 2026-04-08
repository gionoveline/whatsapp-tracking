/**
 * URL de retorno do OAuth (Google → Supabase → app).
 *
 * Usamos sempre o `window.location.origin` para garantir que o callback volte
 * para o mesmo host em que o usuário iniciou login.
 *
 * Isso evita sessões em domínio diferente (ex.: alias x domínio vercel original),
 * que podem causar cookie httpOnly não disponível nas próximas navegações.
 */
export function getOAuthCallbackUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/callback`;
}
