alter table public.partners
  add column if not exists auto_link_by_domain boolean not null default false,
  add column if not exists allowed_email_domain text;

alter table public.partners
  drop constraint if exists partners_allowed_email_domain_format_chk;

alter table public.partners
  add constraint partners_allowed_email_domain_format_chk
  check (
    allowed_email_domain is null
    or (
      allowed_email_domain = lower(allowed_email_domain)
      and allowed_email_domain not like '%@%'
      and allowed_email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
    )
  );

create unique index if not exists uq_partners_auto_domain
  on public.partners(allowed_email_domain)
  where auto_link_by_domain = true and allowed_email_domain is not null;
