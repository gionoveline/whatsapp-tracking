-- Enforce tenant key on business tables and tenant-aware uniqueness
do $$
declare
  default_partner_id uuid;
begin
  insert into public.partners (slug, name)
  values ('default', 'Parceiro padrão')
  on conflict (slug) do update set updated_at = now()
  returning id into default_partner_id;

  if default_partner_id is null then
    select id into default_partner_id from public.partners where slug = 'default';
  end if;

  alter table public.leads add column if not exists partner_id uuid references public.partners(id);
  alter table public.meta_ad_cache add column if not exists partner_id uuid references public.partners(id);
  alter table public.app_settings add column if not exists partner_id uuid references public.partners(id);

  update public.leads set partner_id = default_partner_id where partner_id is null;
  update public.meta_ad_cache set partner_id = default_partner_id where partner_id is null;
  update public.app_settings set partner_id = default_partner_id where partner_id is null;

  alter table public.leads alter column partner_id set not null;
  alter table public.meta_ad_cache alter column partner_id set not null;
  alter table public.app_settings alter column partner_id set not null;
end
$$;

alter table public.leads drop constraint if exists leads_conversation_id_key;
alter table public.meta_ad_cache drop constraint if exists meta_ad_cache_ad_id_key;
alter table public.app_settings drop constraint if exists app_settings_pkey;

create unique index if not exists uq_leads_partner_conversation on public.leads(partner_id, conversation_id);
create unique index if not exists uq_meta_cache_partner_ad_id on public.meta_ad_cache(partner_id, ad_id);
create unique index if not exists uq_app_settings_partner_key on public.app_settings(partner_id, key);

create index if not exists idx_leads_partner_created_at on public.leads(partner_id, created_at);
create index if not exists idx_leads_partner_status on public.leads(partner_id, status);
create index if not exists idx_leads_partner_contact_phone on public.leads(partner_id, contact_phone);
create index if not exists idx_meta_cache_partner_fetched_at on public.meta_ad_cache(partner_id, fetched_at);
