import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, serviceKey);

export type LeadRow = {
  id: string;
  partner_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  source_id: string | null;
  ctwa_clid: string | null;
  headline: string | null;
  ad_body: string | null;
  image_url: string | null;
  source_url: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_name: string | null;
  google_lp_protocol: string | null;
  emr_campaign_id: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  status: "lead" | "sql" | "venda";
  google_sql_sent_at: string | null;
  google_sql_match_method: "click_id" | "enhanced_lead" | null;
  opp_id: string | null;
  won_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaAdCacheRow = {
  id: string;
  partner_id: string;
  ad_id: string;
  ad_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  fetched_at: string;
};
