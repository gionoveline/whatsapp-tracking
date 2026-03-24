/**
 * URL de retorno do OAuth (Google → Supabase → app).
 *
 * - Por padrão usa `window.location.origin` (correto na maioria dos casos).
 * - Opcional: `NEXT_PUBLIC_SITE_URL` na Vercel (ex.: https://seu-app.vercel.app) sem barra final.
 * - Se `NEXT_PUBLIC_SITE_URL` for localhost mas o usuário abriu o site em produção,
 *   ignoramos o env (evita variável errada no ambiente Production da Vercel).
 */
export function getOAuthCallbackUrl(): string {
  if (typeof window === "undefined") return "";
  const win = window.location.origin;
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return `${win}/auth/callback`;

  try {
    const envOrigin = new URL(raw).origin;
    const winIsLocal = /localhost|127\.0\.0\.1/.test(win);
    const envIsLocal = /localhost|127\.0\.0\.1/.test(envOrigin);
    if (envIsLocal && !winIsLocal) {
      return `${win}/auth/callback`;
    }
    return `${envOrigin}/auth/callback`;
  } catch {
    return `${win}/auth/callback`;
  }
}
