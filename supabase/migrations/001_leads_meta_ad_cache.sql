-- Tabela de leads (conversas CTWA) com enriquecimento Meta
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  contact_name text,
  contact_phone text not null,
  source_id text,
  ctwa_clid text,
  headline text,
  ad_body text,
  image_url text,
  source_url text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_name text,
  status text not null default 'lead' check (status in ('lead', 'sql', 'venda')),
  opp_id text,
  won_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conversation_id)
);

create index if not exists idx_leads_conversation_id on public.leads(conversation_id);
create index if not exists idx_leads_contact_phone on public.leads(contact_phone);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_created_at on public.leads(created_at);
create index if not exists idx_leads_campaign_id on public.leads(campaign_id);

-- Cache de dados Meta por ad_id (evita chamar a API a todo momento)
create table if not exists public.meta_ad_cache (
  id uuid primary key default gen_random_uuid(),
  ad_id text not null unique,
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_meta_ad_cache_ad_id on public.meta_ad_cache(ad_id);

-- RLS (opcional: habilitar depois com políticas por tenant/user)
alter table public.leads enable row level security;
alter table public.meta_ad_cache enable row level security;

-- Políticas permissivas para o backend (service_role ignora RLS; anon pode precisar)
create policy "Allow all for service role" on public.leads for all using (true);
create policy "Allow all for service role" on public.meta_ad_cache for all using (true);
