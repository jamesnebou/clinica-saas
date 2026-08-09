-- Intervalo operacional após procedimento e preço promocional opcional.
-- Migration aditiva: os procedimentos atuais mantêm duração, preço e comportamento.

alter table public.procedimentos
  add column if not exists intervalo_minutos integer not null default 0,
  add column if not exists preco_promocional numeric(12,2);

alter table public.procedimentos
  drop constraint if exists procedimentos_intervalo_minutos_check,
  add constraint procedimentos_intervalo_minutos_check check (intervalo_minutos >= 0),
  drop constraint if exists procedimentos_preco_promocional_check,
  add constraint procedimentos_preco_promocional_check check (preco_promocional is null or preco_promocional >= 0);

comment on column public.procedimentos.intervalo_minutos is 'Tempo adicional de bloqueio da agenda após o atendimento.';
comment on column public.procedimentos.preco_promocional is 'Preço promocional opcional usado no site e no agendamento.';
