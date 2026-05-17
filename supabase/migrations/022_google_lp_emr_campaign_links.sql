-- Campanhas EMR (ID#…) com links /go dedicados; atribuição dupla EMR + protocolo GLP.

create table if not exists public.google_lp_campaign_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  emr_campaign_id text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_google_lp_campaign_links_partner_emr_id
  on public.google_lp_campaign_links(partner_id, emr_campaign_id);

create index if not exists idx_google_lp_campaign_links_partner_active
  on public.google_lp_campaign_links(partner_id, is_active)
  where is_active = true;

alter table public.google_lp_protocols
  add column if not exists emr_campaign_id text;

create index if not exists idx_google_lp_protocols_partner_emr
  on public.google_lp_protocols(partner_id, emr_campaign_id)
  where emr_campaign_id is not null;

alter table public.leads add column if not exists emr_campaign_id text;

create index if not exists idx_leads_partner_emr_campaign
  on public.leads(partner_id, emr_campaign_id)
  where emr_campaign_id is not null;

alter table public.google_lp_campaign_links enable row level security;
alter table public.google_lp_campaign_links force row level security;

drop policy if exists "google_lp_campaign_links_select_member" on public.google_lp_campaign_links;
create policy "google_lp_campaign_links_select_member"
  on public.google_lp_campaign_links
  for select
  using (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_lp_campaign_links_insert_member" on public.google_lp_campaign_links;
create policy "google_lp_campaign_links_insert_member"
  on public.google_lp_campaign_links
  for insert
  with check (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_lp_campaign_links_update_member" on public.google_lp_campaign_links;
create policy "google_lp_campaign_links_update_member"
  on public.google_lp_campaign_links
  for update
  using (public.user_has_partner_access(partner_id) or public.is_global_admin())
  with check (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_lp_campaign_links_delete_member" on public.google_lp_campaign_links;
create policy "google_lp_campaign_links_delete_member"
  on public.google_lp_campaign_links
  for delete
  using (public.user_has_partner_access(partner_id) or public.is_global_admin());
