-- Origem do clique /go ou /wci (landing Google LP vs extensão de mensagem WhatsApp / WCI).

alter table public.google_lp_protocols
  add column if not exists capture_source text not null default 'direct_go';

alter table public.google_lp_protocols
  drop constraint if exists google_lp_protocols_capture_source_check;

alter table public.google_lp_protocols
  add constraint google_lp_protocols_capture_source_check
  check (capture_source in ('landing', 'wci_extension', 'direct_go'));

create index if not exists idx_google_lp_protocols_partner_capture_source
  on public.google_lp_protocols(partner_id, capture_source, created_at desc);
