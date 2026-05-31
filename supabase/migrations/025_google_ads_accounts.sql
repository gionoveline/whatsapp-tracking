-- Contas Google Ads nomeadas por tenant + roteamento por campanha EMR.

create table if not exists public.google_ads_accounts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  label text not null,
  customer_id text not null,
  login_customer_id text null,
  currency_code text not null default 'BRL',
  conversion_mapping jsonb not null default '{"lead":{"enabled":false,"conversion_action_id":null},"sql":{"enabled":false,"conversion_action_id":null},"venda":{"enabled":false,"conversion_action_id":null}}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_ads_accounts_label_len check (char_length(trim(label)) between 1 and 120),
  constraint google_ads_accounts_customer_id_digits check (customer_id ~ '^[0-9]{8,12}$')
);

create unique index if not exists uq_google_ads_accounts_partner_label
  on public.google_ads_accounts(partner_id, lower(trim(label)));

create unique index if not exists uq_google_ads_accounts_partner_one_default
  on public.google_ads_accounts(partner_id)
  where is_default = true;

create index if not exists idx_google_ads_accounts_partner
  on public.google_ads_accounts(partner_id);

alter table public.google_lp_campaign_links
  add column if not exists google_ads_account_id uuid null
  references public.google_ads_accounts(id) on delete set null;

create index if not exists idx_google_lp_campaign_links_google_account
  on public.google_lp_campaign_links(google_ads_account_id)
  where google_ads_account_id is not null;

alter table public.google_ads_accounts enable row level security;
alter table public.google_ads_accounts force row level security;

drop policy if exists "google_ads_accounts_select_member" on public.google_ads_accounts;
create policy "google_ads_accounts_select_member"
  on public.google_ads_accounts
  for select
  using (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_ads_accounts_insert_member" on public.google_ads_accounts;
create policy "google_ads_accounts_insert_member"
  on public.google_ads_accounts
  for insert
  with check (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_ads_accounts_update_member" on public.google_ads_accounts;
create policy "google_ads_accounts_update_member"
  on public.google_ads_accounts
  for update
  using (public.user_has_partner_access(partner_id) or public.is_global_admin())
  with check (public.user_has_partner_access(partner_id) or public.is_global_admin());

drop policy if exists "google_ads_accounts_delete_member" on public.google_ads_accounts;
create policy "google_ads_accounts_delete_member"
  on public.google_ads_accounts
  for delete
  using (public.user_has_partner_access(partner_id) or public.is_global_admin());
