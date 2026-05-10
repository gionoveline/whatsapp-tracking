create table if not exists public.google_lp_protocols (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  protocol text not null,
  message text not null,
  attribution jsonb not null default '{}'::jsonb,
  gclid text,
  wbraid text,
  gbraid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  referrer text,
  user_agent text,
  ip_hash text,
  matched_lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  matched_at timestamptz
);

create unique index if not exists uq_google_lp_protocols_partner_protocol
  on public.google_lp_protocols(partner_id, protocol);

create index if not exists idx_google_lp_protocols_partner_created_at
  on public.google_lp_protocols(partner_id, created_at desc);

create index if not exists idx_google_lp_protocols_partner_gclid
  on public.google_lp_protocols(partner_id, gclid)
  where gclid is not null;

create index if not exists idx_google_lp_protocols_matched_lead_id
  on public.google_lp_protocols(matched_lead_id)
  where matched_lead_id is not null;

alter table public.google_lp_protocols enable row level security;
alter table public.google_lp_protocols force row level security;

drop policy if exists "google_lp_protocols_select_member" on public.google_lp_protocols;
create policy "google_lp_protocols_select_member"
  on public.google_lp_protocols
  for select
  using (public.user_has_partner_access(partner_id) or public.is_global_admin());
