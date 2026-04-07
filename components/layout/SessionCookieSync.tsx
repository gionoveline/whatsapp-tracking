"use client";

import { useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { clearAuthCookie, syncAuthCookie } from "@/lib/sync-auth-cookie";

export function SessionCookieSync() {
  useEffect(() => {
    let mounted = true;

    // Do not clear the cookie when getSession() is briefly empty before client
    // hydration (common after navigation in private mode). Cookie clearing runs on
    // SIGNED_OUT and when INITIAL_SESSION / auth events deliver a real session.
    const syncCurrentSession = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token?.trim() ?? "";
      if (!mounted || !token) return;
      await syncAuthCookie(token);
    };

    void syncCurrentSession();

    const { data: sub } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        await clearAuthCookie();
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        const token = session?.access_token?.trim() ?? "";
        if (token) await syncAuthCookie(token);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
