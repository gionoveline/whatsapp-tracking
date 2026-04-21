alter table public.desk_sync_runs
  add column if not exists meta_attempted_count integer not null default 0,
  add column if not exists meta_sent_count integer not null default 0,
  add column if not exists meta_failed_count integer not null default 0,
  add column if not exists meta_failed_summary text;
