-- Permite registrar rodadas puladas (intervalo ou cron sem tempo para o tenant).

alter table public.desk_sync_runs
  drop constraint if exists desk_sync_runs_status_check;

alter table public.desk_sync_runs
  add constraint desk_sync_runs_status_check
  check (status in ('success', 'error', 'skipped'));
