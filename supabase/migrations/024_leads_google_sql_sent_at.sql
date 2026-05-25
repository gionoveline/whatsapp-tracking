alter table public.leads
  add column if not exists google_sql_sent_at timestamptz;

create index if not exists idx_leads_partner_google_sql_pending
  on public.leads (partner_id, status)
  where status = 'sql' and google_sql_sent_at is null and gclid is not null;
