-- Fix RLS recursion by making helper functions SECURITY DEFINER.
-- This prevents policy-evaluation loops over users/partner_members.

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
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

grant execute on function public.is_global_admin() to anon, authenticated, service_role;
grant execute on function public.user_has_partner_access(uuid) to anon, authenticated, service_role;
