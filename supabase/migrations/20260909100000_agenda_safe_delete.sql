begin;

create or replace function public.agenda_excluir_agendamento_v2(
  p_clinica_id uuid,
  p_agendamento_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_agendamento public.agendamentos;
  v_recebiveis_excluidos integer := 0;
  v_pagamentos_excluidos integer := 0;
begin
  if not (
    coalesce(current_setting('request.jwt.claim.role', true), auth.jwt()->>'role', '') = 'service_role'
    or app_private.usuario_pode_secao_clinica(p_clinica_id, 'agenda')
  ) then
    raise exception 'Acesso à agenda negado.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text || ':' || p_agendamento_id::text, 0));

  select * into v_agendamento
  from public.agendamentos
  where clinica_id = p_clinica_id and id = p_agendamento_id
  for update;

  if not found then
    return jsonb_build_object('excluido', false, 'motivo', 'nao_encontrado');
  end if;

  if exists (
    select 1
    from public.site_agendamentos_publicos
    where clinica_id = p_clinica_id and agendamento_id = p_agendamento_id
  ) then
    raise exception 'Agendamentos feitos pelo site devem ser cancelados para preservar a solicitação da cliente.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.finance_recebiveis r
    where r.clinica_id = p_clinica_id
      and r.origem_tipo = 'agendamento'
      and r.origem_id = p_agendamento_id::text
      and (
        r.valor_recebido > 0
        or r.status in ('parcial', 'pago', 'estornado')
        or exists (
          select 1 from public.finance_liquidacoes l
          where l.clinica_id = r.clinica_id and l.recebivel_id = r.id
        )
      )
  ) or exists (
    select 1
    from public.pagamentos_clinica p
    where p.clinica_id = p_clinica_id
      and p.agendamento_id = p_agendamento_id
      and (coalesce(p.valor_pago, 0) > 0 or p.status in ('parcial', 'pago'))
  ) then
    raise exception 'Agendamentos com movimentação financeira não podem ser excluídos. Cancele o agendamento para preservar o histórico.' using errcode = 'P0001';
  end if;

  delete from public.pagamentos_clinica
  where clinica_id = p_clinica_id and agendamento_id = p_agendamento_id;
  get diagnostics v_pagamentos_excluidos = row_count;

  delete from public.finance_recebiveis
  where clinica_id = p_clinica_id
    and origem_tipo = 'agendamento'
    and origem_id = p_agendamento_id::text;
  get diagnostics v_recebiveis_excluidos = row_count;

  delete from public.agendamentos
  where clinica_id = p_clinica_id and id = p_agendamento_id;

  return jsonb_build_object(
    'excluido', true,
    'agendamento_id', p_agendamento_id,
    'recebiveis_excluidos', v_recebiveis_excluidos,
    'pagamentos_excluidos', v_pagamentos_excluidos
  );
end;
$$;

revoke all on function public.agenda_excluir_agendamento_v2(uuid, uuid) from public, anon;
grant execute on function public.agenda_excluir_agendamento_v2(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
