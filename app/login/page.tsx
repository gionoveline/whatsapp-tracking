"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabaseClient";
import { isAllowedEmail } from "@/lib/auth-constants";
import { getOAuthCallbackUrl } from "@/lib/oauth-redirect";
import { getSafeInternalPath } from "@/lib/safe-internal-path";
import { syncAuthCookie } from "@/lib/sync-auth-cookie";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectTo = getOAuthCallbackUrl();
      const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (oauthError) throw oauthError;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao iniciar login com Google"
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!mounted || !session || !isAllowedEmail(email)) return;

      const cookieOk = await syncAuthCookie(session.access_token);
      if (!mounted) return;
      if (!cookieOk) {
        setError(
          "Nao foi possivel definir a sessao no navegador. Atualize a pagina ou entre novamente."
        );
        return;
      }

      const sessionRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null);
      const sessionJson = sessionRes?.ok
        ? await sessionRes.json().catch(() => ({}))
        : {};
      const isGlobalAdmin = sessionJson?.user?.is_global_admin === true;

      const nextParam = searchParams.get("next");
      const fallback = isGlobalAdmin ? "/" : "/dashboard";
      const target = getSafeInternalPath(nextParam, fallback);

      router.replace(target);
    };
    void check();
    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/12 via-transparent to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-8">
        <section className="grid w-full gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]/70 p-8 backdrop-blur-sm lg:block">
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
              Plataforma de rastreamento para WhatsApp
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-tight">
              Veja quais campanhas realmente viram venda no WhatsApp
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
              Conecte leads, SQL e vendas ao anúncio certo para tomar decisões com
              mais segurança e investir melhor.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-[var(--muted-foreground)]">
              <li className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
                Funil completo com visão por etapa e origem.
              </li>
              <li className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
                Exportação simples para análise externa.
              </li>
              <li className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
                Conversões de Lead, SQL e Venda para otimização na Meta.
              </li>
            </ul>
          </div>

          <div className="w-full rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl shadow-black/5 sm:p-8 flex min-h-[430px] flex-col">
            <h2 className="font-display text-2xl font-semibold">Entrar</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Acesso restrito para contas autorizadas do time.
            </p>

            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="h-12 w-full max-w-[20rem] flex items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm hover:bg-[var(--muted)]/60"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt=""
                  className="h-5 w-5 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="text-base font-medium">
                  {loading ? "Redirecionando..." : "Entrar com Google"}
                </span>
              </Button>
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                {error}
              </p>
            )}

            <p className="mt-5 text-center text-xs leading-relaxed text-[var(--muted-foreground)]">
              Ao continuar, você será redirecionado para autenticação segura via
              Google e concorda com os termos de uso da plataforma.
            </p>

            <div className="mt-auto flex items-center justify-center gap-3 border-t border-[var(--border)] pt-4">
              <img
                src="/security/badge-ssl.svg"
                alt="Certificação SSL segura"
                className="w-[90px] max-w-[28%] object-contain opacity-90"
                loading="lazy"
              />
              <img
                src="/security/badge-google-secure.svg"
                alt="Google Site Seguro"
                className="w-[90px] max-w-[28%] object-contain opacity-90"
                loading="lazy"
              />
              <img
                src="/security/badge-site-secure.svg"
                alt="Site 100% seguro"
                className="w-[90px] max-w-[28%] object-contain opacity-90"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
          <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
