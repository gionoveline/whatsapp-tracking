-- E-mail do lead (Octadesk) + log de shadow mode EC for Leads.

alter table public.leads
  add column if not exists contact_email text;

create index if not exists idx_leads_partner_contact_email
  on public.leads (partner_id, contact_email)
  where contact_email is not null;

create table if not exists public.google_enhanced_lead_shadow_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id text,
  our_event text not null check (our_event in ('lead', 'sql', 'venda')),
  match_mode text not null check (match_mode in ('click_id', 'enhanced_lead', 'none')),
  shadow_would_send boolean not null default false,
  has_phone_identifier boolean not null default false,
  has_email_identifier boolean not null default false,
  skip_reason text,
  conversion_action_id text,
  customer_id_preview text,
  order_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_google_enhanced_shadow_partner_created
  on public.google_enhanced_lead_shadow_events (partner_id, created_at desc);

alter table public.google_enhanced_lead_shadow_events enable row level security;
alter table public.google_enhanced_lead_shadow_events force row level security;

drop policy if exists "tenant_select_google_enhanced_shadow" on public.google_enhanced_lead_shadow_events;
create policy "tenant_select_google_enhanced_shadow"
  on public.google_enhanced_lead_shadow_events
  for select
  using (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_insert_google_enhanced_shadow" on public.google_enhanced_lead_shadow_events;
create policy "tenant_insert_google_enhanced_shadow"
  on public.google_enhanced_lead_shadow_events
  for insert
  with check (public.user_has_partner_access(partner_id));
