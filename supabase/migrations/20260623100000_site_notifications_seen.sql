-- Track viewed public booking notifications in the clinic dashboard.

alter table public.site_agendamentos_publicos
  add column if not exists visualizado_em timestamptz;

create index if not exists idx_site_agendamentos_visualizado
  on public.site_agendamentos_publicos(clinica_id, visualizado_em, created_at desc);
