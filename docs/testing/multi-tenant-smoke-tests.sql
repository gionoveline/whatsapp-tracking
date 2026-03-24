-- Multi-tenant smoke tests (database-level assertions)
-- How to use:
-- 1) Ensure there are at least 2 companies in public.partners.
-- 2) Replace P1_NAME/P2_NAME below if needed.
-- 3) Run this script in Supabase SQL Editor.
--
-- This script FAILS with exceptions when isolation guarantees are broken.

do $$
declare
  p1_name text := 'Parceiro padrão';
  p2_name text := 'Empresa teste';
  p1 uuid;
  p2 uuid;
  forced_count int;
  domain_conflicts int;
begin
  select id into p1 from public.partners where name = p1_name limit 1;
  select id into p2 from public.partners where name = p2_name limit 1;

  if p1 is null or p2 is null then
    raise exception
      'Required partners not found. Expected names: "%" and "%".',
      p1_name, p2_name;
  end if;

  if p1 = p2 then
    raise exception 'Partner ids must be different.';
  end if;

  -- 1) FORCE RLS must be enabled on critical multi-tenant tables.
  select count(*) into forced_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('leads','meta_ad_cache','app_settings','partners','users','partner_members')
    and c.relforcerowsecurity = true;

  if forced_count <> 6 then
    raise exception 'FORCE RLS is not enabled on all critical tables (expected 6, got %).', forced_count;
  end if;

  -- 2) Domain auto-link uniqueness invariant.
  select count(*) into domain_conflicts
  from (
    select lower(allowed_email_domain) as d
    from public.partners
    where auto_link_by_domain = true
      and allowed_email_domain is not null
    group by lower(allowed_email_domain)
    having count(*) > 1
  ) x;

  if domain_conflicts > 0 then
    raise exception 'Found duplicate allowed_email_domain among auto-link partners.';
  end if;

  -- 3) Data model invariants for tenant-bound tables.
  if exists (
    select 1 from public.leads where partner_id is null
  ) then
    raise exception 'Found leads rows without partner_id.';
  end if;

  if exists (
    select 1 from public.meta_ad_cache where partner_id is null
  ) then
    raise exception 'Found meta_ad_cache rows without partner_id.';
  end if;

  if exists (
    select 1 from public.app_settings where partner_id is null
  ) then
    raise exception 'Found app_settings rows without partner_id.';
  end if;

  -- 4) Per-tenant uniqueness still active.
  if exists (
    select partner_id, conversation_id
    from public.leads
    group by partner_id, conversation_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate (partner_id, conversation_id) found in leads.';
  end if;

  if exists (
    select partner_id, ad_id
    from public.meta_ad_cache
    group by partner_id, ad_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate (partner_id, ad_id) found in meta_ad_cache.';
  end if;

  if exists (
    select partner_id, key
    from public.app_settings
    group by partner_id, key
    having count(*) > 1
  ) then
    raise exception 'Duplicate (partner_id, key) found in app_settings.';
  end if;

  -- 5) Optional visibility: useful summary in logs.
  raise notice 'Smoke tests passed. p1=% p2=%', p1, p2;
end $$;
