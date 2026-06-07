import { supabase } from "@/lib/supabase";

export const GOOGLE_ADS_ENHANCED_LEADS_SETTINGS_KEY = "google_ads_enhanced_leads";

export type GoogleEnhancedLeadsSettings = {
  /** Master switch: avalia Path B (EC for Leads). */
  enabled: boolean;
  /** Se true, não chama Google — só registra shadow events. */
  shadowMode: boolean;
  usePhone: boolean;
  useEmail: boolean;
};

export const DEFAULT_GOOGLE_ENHANCED_LEADS_SETTINGS: GoogleEnhancedLeadsSettings = {
  enabled: false,
  shadowMode: true,
  usePhone: true,
  useEmail: true,
};

function parseSettings(raw: string | null | undefined): GoogleEnhancedLeadsSettings {
  if (!raw?.trim()) return { ...DEFAULT_GOOGLE_ENHANCED_LEADS_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleEnhancedLeadsSettings>;
    return {
      enabled: parsed.enabled === true,
      shadowMode: parsed.shadowMode !== false,
      usePhone: parsed.usePhone !== false,
      useEmail: parsed.useEmail !== false,
    };
  } catch {
    return { ...DEFAULT_GOOGLE_ENHANCED_LEADS_SETTINGS };
  }
}

export async function getGoogleEnhancedLeadsSettings(
  partnerId: string
): Promise<GoogleEnhancedLeadsSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", GOOGLE_ADS_ENHANCED_LEADS_SETTINGS_KEY)
    .maybeSingle();
  return parseSettings(data?.value ?? null);
}

export async function saveGoogleEnhancedLeadsSettings(
  partnerId: string,
  settings: GoogleEnhancedLeadsSettings
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: GoogleEnhancedLeadsSettings = {
    enabled: settings.enabled === true,
    shadowMode: settings.shadowMode !== false,
    usePhone: settings.usePhone !== false,
    useEmail: settings.useEmail !== false,
  };
  const { error } = await supabase.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: GOOGLE_ADS_ENHANCED_LEADS_SETTINGS_KEY,
      value: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Shadow ativo via env global (override para rollout). */
export function isGoogleEnhancedLeadsShadowForcedByEnv(): boolean {
  return (
    process.env.GOOGLE_ENHANCED_LEADS_SHADOW_MODE === "1" ||
    process.env.GOOGLE_ENHANCED_LEADS_SHADOW_MODE === "true"
  );
}

export function isGoogleEnhancedLeadsLiveSendBlocked(settings: GoogleEnhancedLeadsSettings): boolean {
  return settings.shadowMode || isGoogleEnhancedLeadsShadowForcedByEnv();
}
