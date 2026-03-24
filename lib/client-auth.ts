"use client";

import { supabaseClient } from "@/lib/supabaseClient";
import { isAllowedEmail } from "@/lib/auth-constants";

export type ClientAuth = {
  userId: string;
  email: string;
  accessToken: string;
};

export async function getClientAuth(): Promise<ClientAuth | null> {
  const { data } = await supabaseClient.auth.getSession();
  const session = data.session;
  const email = session?.user?.email?.toLowerCase() ?? "";

  if (!session?.access_token || !session.user?.id || !isAllowedEmail(email)) {
    return null;
  }

  return {
    userId: session.user.id,
    email,
    accessToken: session.access_token,
  };
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit & { partnerId?: string } = {}
) {
  const auth = await getClientAuth();
  if (!auth) throw new Error("Sessão inválida. Faça login novamente.");

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${auth.accessToken}`);
  if (init.partnerId) headers.set("x-partner-id", init.partnerId);

  return fetch(input, { ...init, headers });
}
