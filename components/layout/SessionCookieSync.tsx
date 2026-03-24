"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { isAllowedEmail } from "@/lib/auth-constants";
import { syncAuthCookie } from "@/lib/sync-auth-cookie";

/**
 * Mantém o cookie de sessão alinhado ao JWT do Supabase (localStorage) ao
 * navegar — o middleware só vê o cookie, não o storage.
 */
export function SessionCookieSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!session?.access_token || !isAllowedEmail(email)) return;
      await syncAuthCookie(session.access_token);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
