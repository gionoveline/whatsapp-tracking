create table if not exists public.desk_sync_runs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  provider text not null default 'octadesk',
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('success', 'error')),
  target_date date,
  imported_count integer not null default 0,
  failed_count integer not null default 0,
  listed_count integer not null default 0,
  lead_sweep_scanned integer not null default 0,
  lead_sweep_imported integer not null default 0,
  lead_sweep_failed integer not null default 0,
  error_summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_sync_runs_partner_started_at
  on public.desk_sync_runs(partner_id, started_at desc);

alter table public.desk_sync_runs enable row level security;
alter table public.desk_sync_runs force row level security;

drop policy if exists "tenant_select_desk_sync_runs" on public.desk_sync_runs;
create policy "tenant_select_desk_sync_runs"
  on public.desk_sync_runs
  for select
  using (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_insert_desk_sync_runs" on public.desk_sync_runs;
create policy "tenant_insert_desk_sync_runs"
  on public.desk_sync_runs
  for insert
  with check (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_update_desk_sync_runs" on public.desk_sync_runs;
create policy "tenant_update_desk_sync_runs"
  on public.desk_sync_runs
  for update
  using (public.user_has_partner_access(partner_id))
  with check (public.user_has_partner_access(partner_id));

drop policy if exists "tenant_delete_desk_sync_runs" on public.desk_sync_runs;
create policy "tenant_delete_desk_sync_runs"
  on public.desk_sync_runs
  for delete
  using (public.user_has_partner_access(partner_id));
