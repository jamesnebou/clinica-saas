begin;

create or replace function app_private.finance_sync_agendamento_competencia(
  p_clinica_id uuid, p_agendamento_id uuid, p_create_missing boolean default true
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_agendamento public.agendamentos%rowtype;
  v_recebivel public.finance_recebiveis%rowtype;
  v_categoria_id uuid;
  v_centro_custo_id uuid;
  v_descricao text;
  v_competencia date;
begin
  -- O reset da demo insere recebiveis e competencias com IDs deterministas.
  if exists (select 1 from app_private.demo_environments where clinic_id = p_clinica_id) then
    return;
  end if;

  select * into v_agendamento
    from public.agendamentos
   where clinica_id = p_clinica_id and id = p_agendamento_id;
  select * into v_recebivel
    from public.finance_recebiveis
   where clinica_id = p_clinica_id
     and origem_tipo = 'agendamento'
     and origem_id = p_agendamento_id::text;

  -- O reset demo carrega fatos de competencia com IDs deterministas depois dos recebiveis.
  if v_recebivel.id is not null and v_recebivel.metadata->>'demo' = 'true' then
    return;
  end if;

  if v_agendamento.id is null or v_agendamento.status <> 'concluido' then
    update public.finance_competencias
       set estornada = true
     where clinica_id = p_clinica_id
       and origem_tipo = 'agendamento'
       and origem_id = p_agendamento_id::text
       and tipo = 'receita'
       and not estornada;
    return;
  end if;

  -- A RPC publica exige permissao de Financeiro; a operacao interna preserva
  -- seus campos canonicos sem depender da permissao do operador da Agenda.
  if v_recebivel.id is null and p_create_missing and v_agendamento.valor > 0
     and v_agendamento.pagamento_status <> 'cancelado' then
    select id into v_categoria_id from public.finance_categorias
     where clinica_id = p_clinica_id and codigo = 'REC_SERVICOS' and ativa;
    select id into v_centro_custo_id from public.finance_centros_custo
     where clinica_id = p_clinica_id and codigo = 'CLINICA' and ativo;
    if v_categoria_id is null then
      raise exception 'Categoria financeira REC_SERVICOS ausente para agendamento.' using errcode = '23503';
    end if;
    select nome into v_descricao from public.procedimentos
     where clinica_id = p_clinica_id and id = v_agendamento.procedimento_id;
    v_competencia := date_trunc('month', v_agendamento.inicio)::date;
    insert into public.finance_recebiveis
      (clinica_id, cliente_id, profissional_id, procedimento_id, agendamento_id,
       categoria_id, centro_custo_id, descricao, origem_tipo, origem_id,
       valor_original, valor_recebido, emissao, competencia, vencimento, status,
       forma_pagamento, metadata)
    values
      (p_clinica_id, v_agendamento.cliente_id, v_agendamento.profissional_id,
       v_agendamento.procedimento_id, v_agendamento.id, v_categoria_id,
       v_centro_custo_id, coalesce(v_descricao, 'Atendimento'), 'agendamento',
       v_agendamento.id::text, v_agendamento.valor,
       least(v_agendamento.valor, v_agendamento.valor_pago),
       v_agendamento.created_at::date, v_competencia, v_agendamento.inicio::date,
       case when v_agendamento.valor_pago >= v_agendamento.valor then 'pago'
            when v_agendamento.valor_pago > 0 then 'parcial' else 'aberto' end,
       v_agendamento.forma_pagamento,
       jsonb_build_object('canonical', true, 'created_on_completion', true,
                          'legacy_paid_inferred', v_agendamento.valor_pago > 0))
    on conflict (clinica_id, origem_tipo, origem_id) do nothing;

    select * into v_recebivel from public.finance_recebiveis
     where clinica_id = p_clinica_id
       and origem_tipo = 'agendamento'
       and origem_id = p_agendamento_id::text;
    if v_recebivel.id is null then
      raise exception 'Recebivel canonico de agendamento nao confirmado.' using errcode = '23503';
    end if;
  end if;

  if v_recebivel.id is null or v_recebivel.status in ('cancelado', 'estornado')
     or v_recebivel.valor_total <= 0 then
    update public.finance_competencias
       set estornada = true
     where clinica_id = p_clinica_id
       and origem_tipo = 'agendamento'
       and origem_id = p_agendamento_id::text
       and tipo = 'receita'
       and not estornada;
    return;
  end if;

  if v_recebivel.categoria_id is null then
    raise exception 'Categoria financeira ausente no recebivel de agendamento.' using errcode = '23503';
  end if;
  v_competencia := date_trunc('month', v_agendamento.inicio)::date;
  insert into public.finance_competencias as c
    (clinica_id, categoria_id, centro_custo_id, recebivel_id, origem_tipo, origem_id,
     descricao, tipo, competencia, valor, metadata)
  values
    (p_clinica_id, v_recebivel.categoria_id, v_recebivel.centro_custo_id, v_recebivel.id,
     'agendamento', p_agendamento_id::text, v_recebivel.descricao, 'receita',
     v_competencia, v_recebivel.valor_total,
     jsonb_build_object('fato_gerador', 'atendimento_concluido', 'gerado_por', 'trigger'))
  on conflict (clinica_id, origem_tipo, origem_id, tipo) do update
    set categoria_id = excluded.categoria_id,
        centro_custo_id = excluded.centro_custo_id,
        recebivel_id = excluded.recebivel_id,
        descricao = excluded.descricao,
        competencia = excluded.competencia,
        valor = excluded.valor,
        estornada = false
  where (c.categoria_id, c.centro_custo_id, c.recebivel_id, c.descricao,
         c.competencia, c.valor, c.estornada)
        is distinct from
        (excluded.categoria_id, excluded.centro_custo_id, excluded.recebivel_id,
         excluded.descricao, excluded.competencia, excluded.valor, false);
end;
$$;

create or replace function app_private.finance_sync_agendamento_from_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.finance_sync_agendamento_competencia(new.clinica_id, new.id, true);
  return new;
end;
$$;

create or replace function app_private.finance_sync_agendamento_from_recebivel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.origem_tipo = 'agendamento' and old.agendamento_id is not null
       and old.metadata->>'demo' is distinct from 'true' then
      perform app_private.finance_sync_agendamento_competencia(old.clinica_id, old.agendamento_id, false);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.origem_tipo = 'agendamento'
     and old.agendamento_id is not null
     and old.metadata->>'demo' is distinct from 'true'
     and (old.clinica_id, old.agendamento_id, old.origem_id)
         is distinct from (new.clinica_id, new.agendamento_id, new.origem_id) then
    perform app_private.finance_sync_agendamento_competencia(old.clinica_id, old.agendamento_id, false);
  end if;
  if new.origem_tipo = 'agendamento' and new.agendamento_id is not null
     and new.metadata->>'demo' is distinct from 'true' then
    perform app_private.finance_sync_agendamento_competencia(new.clinica_id, new.agendamento_id, false);
  end if;
  return new;
end;
$$;

create trigger finance_sync_agendamento_competencia_agenda
  after insert or update of status, inicio on public.agendamentos
  for each row execute function app_private.finance_sync_agendamento_from_agenda();

create trigger finance_sync_agendamento_competencia_recebivel
  after insert or update or delete on public.finance_recebiveis
  for each row execute function app_private.finance_sync_agendamento_from_recebivel();

revoke all on function app_private.finance_sync_agendamento_competencia(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.finance_sync_agendamento_from_agenda() from public, anon, authenticated;
revoke all on function app_private.finance_sync_agendamento_from_recebivel() from public, anon, authenticated;

commit;
