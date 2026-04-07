"use client";

import { useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { clearAuthCookie, syncAuthCookie } from "@/lib/sync-auth-cookie";

export function SessionCookieSync() {
  useEffect(() => {
    let mounted = true;

    const syncCurrentSession = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token?.trim() ?? "";
      if (!mounted) return;
      if (token) {
        await syncAuthCookie(token);
      } else {
        await clearAuthCookie();
      }
    };

    void syncCurrentSession();

    const { data: sub } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        await clearAuthCookie();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
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

