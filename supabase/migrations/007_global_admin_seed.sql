-- Global admin bootstrap + tenant RLS
create or replace function public.is_global_admin()
returns boolean
language sql
stable
as $$
  select
    coalesce(
      (
        select u.is_global_admin
        from public.users u
        where u.id = auth.uid()
      ),
      false
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'gnoveline@gmail.com';
$$;

create or replace function public.user_has_partner_access(p_partner_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_global_admin()
    or exists (
      select 1
      from public.partner_members pm
      where pm.partner_id = p_partner_id
        and pm.user_id = auth.uid()
    );
$$;

drop policy if exists "Allow all for service role" on public.leads;
drop policy if exists "Allow all for service role" on public.meta_ad_cache;
drop policy if exists "Allow all for service role" on public.app_settings;

drop policy if exists "tenant_select_leads" on public.leads;
drop policy if exists "tenant_insert_leads" on public.leads;
drop policy if exists "tenant_update_leads" on public.leads;
drop policy if exists "tenant_delete_leads" on public.leads;
create policy "tenant_select_leads" on public.leads for select using (public.user_has_partner_access(partner_id));
create policy "tenant_insert_leads" on public.leads for insert with check (public.user_has_partner_access(partner_id));
create policy "tenant_update_leads" on public.leads for update using (public.user_has_partner_access(partner_id)) with check (public.user_has_partner_access(partner_id));
create policy "tenant_delete_leads" on public.leads for delete using (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_select_meta_cache" on public.meta_ad_cache;
drop policy if exists "tenant_insert_meta_cache" on public.meta_ad_cache;
drop policy if exists "tenant_update_meta_cache" on public.meta_ad_cache;
drop policy if exists "tenant_delete_meta_cache" on public.meta_ad_cache;
create policy "tenant_select_meta_cache" on public.meta_ad_cache for select using (public.user_has_partner_access(partner_id));
create policy "tenant_insert_meta_cache" on public.meta_ad_cache for insert with check (public.user_has_partner_access(partner_id));
create policy "tenant_update_meta_cache" on public.meta_ad_cache for update using (public.user_has_partner_access(partner_id)) with check (public.user_has_partner_access(partner_id));
create policy "tenant_delete_meta_cache" on public.meta_ad_cache for delete using (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_select_app_settings" on public.app_settings;
drop policy if exists "tenant_insert_app_settings" on public.app_settings;
drop policy if exists "tenant_update_app_settings" on public.app_settings;
drop policy if exists "tenant_delete_app_settings" on public.app_settings;
create policy "tenant_select_app_settings" on public.app_settings for select using (public.user_has_partner_access(partner_id));
create policy "tenant_insert_app_settings" on public.app_settings for insert with check (public.user_has_partner_access(partner_id));
create policy "tenant_update_app_settings" on public.app_settings for update using (public.user_has_partner_access(partner_id)) with check (public.user_has_partner_access(partner_id));
create policy "tenant_delete_app_settings" on public.app_settings for delete using (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_select_partners" on public.partners;
create policy "tenant_select_partners" on public.partners
for select
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.partner_members pm
    where pm.partner_id = public.partners.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "tenant_select_users" on public.users;
create policy "tenant_select_users" on public.users
for select
using (
  id = auth.uid() or public.is_global_admin()
);

drop policy if exists "tenant_select_partner_members" on public.partner_members;
create policy "tenant_select_partner_members" on public.partner_members
for select
using (
  public.is_global_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.partner_members pm
    where pm.partner_id = public.partner_members.partner_id
      and pm.user_id = auth.uid()
  )
);
