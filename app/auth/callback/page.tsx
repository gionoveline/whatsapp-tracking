"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { isAllowedEmail } from "@/lib/auth-constants";
import { syncAuthCookie, waitForServerAuthCookie } from "@/lib/sync-auth-cookie";
import { isPlaceholderPartner } from "@/lib/partner-onboarding";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Concluindo login…");

  useEffect(() => {
    const run = async () => {
      const hardNavigate = (to: string) => {
        window.location.assign(to);
      };

      const log = (event: string, meta: Record<string, unknown> = {}) => {
        console.info("[auth-debug-client]", event, meta);
      };

      const code = searchParams.get("code");
      log("callback.start", { hasCode: !!code });
      if (code) {
        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          log("callback.exchange_error", { message: error.message });
          setMessage(error.message);
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        log("callback.exchange_ok");
      }
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      const email = session?.user?.email?.toLowerCase() ?? "";
      log("callback.session_loaded", {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        emailDomain: email.includes("@") ? email.split("@")[1] : null,
      });
      if (!session?.access_token || !isAllowedEmail(email)) {
        log("callback.session_rejected", { reason: !session?.access_token ? "missing_access_token" : "email_not_allowed" });
        await supabaseClient.auth.signOut();
        router.replace("/login?error=Acesso+nao+autorizado");
        return;
      }

      const cookieOk = await syncAuthCookie(session.access_token);
      log("callback.sync_cookie_result", { cookieOk });
      if (!cookieOk) {
        setMessage("Nao foi possivel definir a sessao no navegador. Tente novamente.");
        return;
      }
      const cookieVisibleToServer = await waitForServerAuthCookie();
      log("callback.cookie_visible_to_server", { cookieVisibleToServer });
      if (!cookieVisibleToServer) {
        setMessage("A sessão ainda não está estável no navegador. Tente novamente em instantes.");
        return;
      }

      const sessionRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      log("callback.session_api_result", { ok: sessionRes.ok, status: sessionRes.status });
      if (!sessionRes.ok) {
        hardNavigate("/");
        return;
      }
      const sessionJson = await sessionRes.json().catch(() => ({}));
      const isGlobalAdmin = sessionJson?.user?.is_global_admin === true;
      const partners: Array<{ id: string; name: string; slug?: string | null }> = Array.isArray(sessionJson.partners)
        ? sessionJson.partners
        : [];
      const needsOnboarding = sessionJson?.needs_onboarding === true;
      log("callback.session_payload", {
        isGlobalAdmin,
        partnersCount: partners.length,
        needsOnboarding,
      });

      if (isGlobalAdmin) {
        hardNavigate("/");
        return;
      }

      if (needsOnboarding) {
        hardNavigate("/primeiro-acesso");
        return;
      }

      const activePartnerId = localStorage.getItem("active_partner_id") ?? "";
      const hasActivePartner = activePartnerId && partners.some((p) => p.id === activePartnerId);
      if (!hasActivePartner) {
        const preferred = partners.find((p) => !isPlaceholderPartner(p)) ?? partners[0];
        localStorage.setItem("active_partner_id", preferred.id);
      }

      hardNavigate("/");
      log("callback.redirect_home");
    };
    void run();
  }, [router, searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
