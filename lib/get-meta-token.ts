import { supabase } from "@/lib/supabase";

const KEY = "meta_access_token";

/**
 * Token da Meta para Marketing API.
 * Prioridade: valor salvo pelo usuário no app (app_settings) → variável de ambiente META_ACCESS_TOKEN.
 */
export async function getMetaAccessToken(partnerId?: string | null): Promise<string | null> {
  if (partnerId) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .eq("partner_id", partnerId)
      .single();

    if (data?.value?.trim()) return data.value.trim();
  }

  const env = process.env.META_ACCESS_TOKEN?.trim();
  return env ?? null;
}
