-- Atribuição Google Ads (gclid / UTMs) no lead, preenchida ao casar protocolo GLP.

alter table public.leads add column if not exists google_lp_protocol text;
alter table public.leads add column if not exists gclid text;
alter table public.leads add column if not exists wbraid text;
alter table public.leads add column if not exists gbraid text;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists utm_content text;
alter table public.leads add column if not exists utm_term text;

create index if not exists idx_leads_partner_gclid
  on public.leads(partner_id, gclid)
  where gclid is not null;

create index if not exists idx_leads_partner_google_lp_protocol
  on public.leads(partner_id, google_lp_protocol)
  where google_lp_protocol is not null;

-- Backfill: leads já vinculados antes desta migration
update public.leads l
set
  google_lp_protocol = p.protocol,
  gclid = coalesce(l.gclid, p.gclid),
  wbraid = coalesce(l.wbraid, p.wbraid),
  gbraid = coalesce(l.gbraid, p.gbraid),
  utm_source = coalesce(l.utm_source, p.utm_source),
  utm_medium = coalesce(l.utm_medium, p.utm_medium),
  utm_campaign = coalesce(l.utm_campaign, p.utm_campaign),
  utm_content = coalesce(l.utm_content, p.utm_content),
  utm_term = coalesce(l.utm_term, p.utm_term),
  campaign_name = coalesce(l.campaign_name, p.utm_campaign, l.campaign_name),
  adset_name = coalesce(l.adset_name, p.utm_medium, l.adset_name),
  ad_name = coalesce(l.ad_name, p.utm_content, p.utm_term, l.ad_name)
from public.google_lp_protocols p
where p.matched_lead_id = l.id
  and p.partner_id = l.partner_id;
