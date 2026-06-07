-- Método de match usado no envio SQL Google (click id vs EC for Leads).

alter table public.leads
  add column if not exists google_sql_match_method text
    check (
      google_sql_match_method is null
      or google_sql_match_method in ('click_id', 'enhanced_lead')
    );

comment on column public.leads.google_sql_match_method is
  'click_id = gclid/wbraid/gbraid; enhanced_lead = EC for Leads (telefone/e-mail hasheados).';

create index if not exists idx_leads_google_sql_match_method
  on public.leads (partner_id, google_sql_match_method)
  where google_sql_match_method is not null;
