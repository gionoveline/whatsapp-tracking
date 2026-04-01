-- Ensure API (service_role) can invoke onboarding RPC from PostgREST.
grant execute on function public.create_company_onboarding(
  uuid,
  text,
  text,
  boolean,
  text,
  text,
  boolean
) to service_role;
