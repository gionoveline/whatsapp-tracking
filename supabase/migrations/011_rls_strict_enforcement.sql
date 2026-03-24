-- Strict RLS enforcement for multi-tenant tables.
-- This keeps tenant isolation protected at DB level even if an API query forgets partner_id filters.
-- Current onboarding/admin routes run server-side validations before writes.

alter table public.leads force row level security;
alter table public.meta_ad_cache force row level security;
alter table public.app_settings force row level security;
alter table public.partners force row level security;
alter table public.users force row level security;
alter table public.partner_members force row level security;
