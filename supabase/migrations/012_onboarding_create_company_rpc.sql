create or replace function public.create_company_onboarding(
  p_user_id uuid,
  p_user_email text,
  p_user_full_name text,
  p_user_is_global_admin boolean,
  p_company_name text,
  p_logo_url text,
  p_auto_link_by_domain boolean
)
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  auto_link_by_domain boolean,
  allowed_email_domain text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text := trim(coalesce(p_company_name, ''));
  v_email text := lower(trim(coalesce(p_user_email, '')));
  v_domain text := null;
  v_slug_base text;
  v_candidate_slug text;
  v_partner_id uuid;
  v_constraint_name text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if v_company_name = '' or char_length(v_company_name) < 2 then
    raise exception 'companyName is required (min 2 chars)';
  end if;
  if char_length(v_company_name) > 120 then
    raise exception 'companyName is too long (max 120 chars)';
  end if;

  if coalesce(p_auto_link_by_domain, false) then
    v_domain := nullif(split_part(v_email, '@', 2), '');
    if v_domain is null then
      raise exception 'Unable to detect user email domain';
    end if;
  end if;

  insert into public.users (id, email, full_name, is_global_admin, updated_at)
  values (p_user_id, v_email, p_user_full_name, coalesce(p_user_is_global_admin, false), now())
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.users.full_name),
        is_global_admin = excluded.is_global_admin,
        updated_at = now();

  v_slug_base := lower(v_company_name);
  v_slug_base := regexp_replace(v_slug_base, '[^a-z0-9]+', '-', 'g');
  v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
  v_slug_base := regexp_replace(v_slug_base, '-{2,}', '-', 'g');
  if v_slug_base = '' then
    v_slug_base := 'empresa';
  end if;
  v_slug_base := left(v_slug_base, 48);

  for i in 0..99 loop
    v_candidate_slug := case when i = 0 then v_slug_base else left(v_slug_base, 44) || '-' || (i + 1)::text end;

    begin
      insert into public.partners (
        name,
        slug,
        logo_url,
        auto_link_by_domain,
        allowed_email_domain
      )
      values (
        v_company_name,
        v_candidate_slug,
        nullif(trim(coalesce(p_logo_url, '')), ''),
        coalesce(p_auto_link_by_domain, false),
        case when coalesce(p_auto_link_by_domain, false) then v_domain else null end
      )
      returning partners.id into v_partner_id;

      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
        if v_constraint_name = 'uq_partners_auto_domain' then
          raise exception 'DOMAIN_ALREADY_LINKED' using errcode = '23505';
        end if;
        -- slug collision: try next suffix
    end;
  end loop;

  if v_partner_id is null then
    raise exception 'Unable to generate unique company slug';
  end if;

  insert into public.partner_members (partner_id, user_id, role, updated_at)
  values (v_partner_id, p_user_id, 'owner', now())
  on conflict (partner_id, user_id) do update
    set role = 'owner',
        updated_at = now();

  return query
  select
    p.id,
    p.name,
    p.slug,
    p.logo_url,
    p.auto_link_by_domain,
    p.allowed_email_domain
  from public.partners p
  where p.id = v_partner_id;
end;
$$;
