import { supabase } from "@/lib/supabase";
import type { GoogleConversionMatchMode } from "@/lib/google-conversion-match";
import { logApiError } from "@/lib/api-errors";

export type GoogleSqlMatchMethod = Extract<GoogleConversionMatchMode, "click_id" | "enhanced_lead">;

export async function markGoogleSqlConversionSent(
  leadId: string,
  matchMethod: GoogleSqlMatchMethod
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({
      google_sql_sent_at: new Date().toISOString(),
      google_sql_match_method: matchMethod,
    })
    .eq("id", leadId);

  if (error) {
    logApiError("google-sql-sent:mark", error);
  }
}
