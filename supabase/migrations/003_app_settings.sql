-- Configurações da aplicação (ex.: token Meta informado pelo usuário)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
create policy "Allow all for service role" on public.app_settings for all using (true);
