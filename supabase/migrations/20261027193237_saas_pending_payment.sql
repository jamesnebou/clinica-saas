begin;

alter table public.clinicas
  drop constraint if exists clinicas_status_check;

alter table public.clinicas
  add constraint clinicas_status_check
  check (status in ('trial', 'pendente', 'ativa', 'inadimplente', 'cancelada', 'inativa', 'bloqueada'));

alter table public.clinicas
  drop constraint if exists clinicas_assinatura_status_check;

alter table public.clinicas
  add constraint clinicas_assinatura_status_check
  check (assinatura_status in ('trial', 'pendente', 'ativa', 'atrasada', 'pausada', 'cancelada', 'isenta'));

commit;
