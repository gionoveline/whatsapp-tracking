-- Cache de atribuição Google Ads por gclid (enriquecimento via click_view).

create table if not exists public.google_gclid_cache (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  gclid text not null,
  campaign_id text,
  campaign_name text,
  ad_group_id text,
  ad_group_name text,
  fetched_at timestamptz not null default now(),
  unique (partner_id, gclid)
);

create index if not exists idx_google_gclid_cache_partner_gclid
  on public.google_gclid_cache(partner_id, gclid);

alter table public.google_gclid_cache enable row level security;

create policy "google_gclid_cache service role"
  on public.google_gclid_cache for all using (true);
