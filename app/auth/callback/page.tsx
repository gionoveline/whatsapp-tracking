"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { isAllowedEmail } from "@/lib/auth-constants";
import { syncAuthCookie } from "@/lib/sync-auth-cookie";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Concluindo login…");

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(error.message);
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
      }
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!session?.access_token || !isAllowedEmail(email)) {
        await supabaseClient.auth.signOut();
        router.replace("/login?error=Acesso+nao+autorizado");
        return;
      }

      const cookieOk = await syncAuthCookie(session.access_token);
      if (!cookieOk) {
        setMessage("Nao foi possivel definir a sessao no navegador. Tente novamente.");
        return;
      }

      const sessionRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!sessionRes.ok) {
        router.replace("/");
        return;
      }
      const sessionJson = await sessionRes.json().catch(() => ({}));
      const isGlobalAdmin = sessionJson?.user?.is_global_admin === true;
      const partners: Array<{ id: string; name: string }> = Array.isArray(sessionJson.partners)
        ? sessionJson.partners
        : [];

      if (isGlobalAdmin) {
        router.replace("/");
        return;
      }

      if (partners.length === 0) {
        router.replace("/primeiro-acesso");
        return;
      }

      const activePartnerId = localStorage.getItem("active_partner_id") ?? "";
      const hasActivePartner = activePartnerId && partners.some((p) => p.id === activePartnerId);
      if (!hasActivePartner) {
        localStorage.setItem("active_partner_id", partners[0].id);
      }

      router.replace("/");
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
