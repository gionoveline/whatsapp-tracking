alter table public.desk_sync_runs
  add column if not exists google_attempted_count integer not null default 0,
  add column if not exists google_sent_count integer not null default 0,
  add column if not exists google_failed_count integer not null default 0,
  add column if not exists google_failed_summary text;
