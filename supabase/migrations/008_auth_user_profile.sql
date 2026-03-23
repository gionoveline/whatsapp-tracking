-- Sync new Supabase Auth users to public.users and attach domain users to default partner
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_partner_id uuid;
  em text := lower(coalesce(new.email, ''));
begin
  insert into public.users (id, email, full_name, is_global_admin)
  values (
    new.id,
    em,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), '')
    ),
    em = 'gnoveline@gmail.com'
  )
  on conflict (id) do update
    set email = excluded.email,
        is_global_admin = excluded.is_global_admin,
        full_name = coalesce(excluded.full_name, public.users.full_name),
        updated_at = now();

  if em = 'gnoveline@gmail.com' then
    return new;
  end if;

  select id into default_partner_id from public.partners where slug = 'default' limit 1;

  if em like '%@eumedicoresidente.com.br' and default_partner_id is not null then
    insert into public.partner_members (partner_id, user_id, role)
    values (default_partner_id, new.id, 'member')
    on conflict (partner_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
