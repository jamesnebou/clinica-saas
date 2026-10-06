begin;

-- Historical conflicts must be reviewed, never silently merged or deleted.
do $$
declare
  v_conflicts text;
begin
  select string_agg(format('clinic=%s liquidation=%s rows=%s', clinica_id, liquidacao_id, ids), '; ')
    into v_conflicts
  from (
    select clinica_id, liquidacao_id, array_agg(id order by id) as ids
    from public.finance_conciliacoes
    where status = 'conciliado' and liquidacao_id is not null
    group by clinica_id, liquidacao_id
    having count(*) > 1
    limit 20
  ) conflicts;
  if v_conflicts is not null then
    raise exception 'Duplicate reconciled liquidations require manual review: %', v_conflicts using errcode = '23505';
  end if;

  select string_agg(format('clinic=%s movement=%s rows=%s', clinica_id, movimento_id, ids), '; ')
    into v_conflicts
  from (
    select clinica_id, movimento_id, array_agg(id order by id) as ids
    from public.finance_conciliacoes
    where status = 'conciliado' and movimento_id is not null
    group by clinica_id, movimento_id
    having count(*) > 1
    limit 20
  ) conflicts;
  if v_conflicts is not null then
    raise exception 'Duplicate reconciled movements require manual review: %', v_conflicts using errcode = '23505';
  end if;
end $$;

create unique index finance_conciliacoes_liquidacao_confirmada_uidx
  on public.finance_conciliacoes(clinica_id, liquidacao_id)
  where status = 'conciliado' and liquidacao_id is not null;

create unique index finance_conciliacoes_movimento_confirmado_uidx
  on public.finance_conciliacoes(clinica_id, movimento_id)
  where status = 'conciliado' and movimento_id is not null;

-- Existing SECURITY DEFINER finance RPCs remain able to create atomic gateway
-- receipts. Direct authenticated writes cannot confirm or forge their evidence.
create function app_private.finance_proteger_conciliacao_direta()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'finance_conciliacoes' then
    if tg_op = 'INSERT' then
      if new.status = 'conciliado' or new.conciliado_em is not null or new.conciliado_por is not null then
        raise exception 'Confirmação de conciliação exige a operação financeira segura.' using errcode = '42501';
      end if;
    elsif (old.status, old.conciliado_em, old.conciliado_por, old.clinica_id,
           old.conta_financeira_id, old.liquidacao_id, old.movimento_id,
           old.provider, old.provider_reference, old.valor_provider, old.data_provider)
      is distinct from
          (new.status, new.conciliado_em, new.conciliado_por, new.clinica_id,
           new.conta_financeira_id, new.liquidacao_id, new.movimento_id,
           new.provider, new.provider_reference, new.valor_provider, new.data_provider) then
      raise exception 'Campos de conciliação não podem ser alterados diretamente.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'finance_liquidacoes' then
    if tg_op = 'INSERT' then
      if new.conciliado then
        raise exception 'Confirmação de liquidação exige a operação financeira segura.' using errcode = '42501';
      end if;
    elsif (old.conciliado, old.clinica_id, old.recebivel_id, old.pagavel_id,
           old.conta_financeira_id, old.tipo, old.valor_bruto, old.taxa,
           old.desconto, old.valor_liquido, old.provider, old.provider_reference,
           old.reversao_de_id)
      is distinct from
          (new.conciliado, new.clinica_id, new.recebivel_id, new.pagavel_id,
           new.conta_financeira_id, new.tipo, new.valor_bruto, new.taxa,
           new.desconto, new.valor_liquido, new.provider, new.provider_reference,
           new.reversao_de_id) then
      raise exception 'Evidência de liquidação não pode ser alterada diretamente.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'finance_movimentos' then
    if tg_op = 'INSERT' then
      if new.conciliado then
        raise exception 'Confirmação de movimento exige a operação financeira segura.' using errcode = '42501';
      end if;
    elsif (old.conciliado, old.clinica_id, old.conta_financeira_id,
           old.liquidacao_id, old.tipo, old.origem_tipo, old.origem_id,
           old.valor_bruto, old.taxa, old.desconto, old.valor_liquido,
           old.provider, old.provider_reference)
      is distinct from
          (new.conciliado, new.clinica_id, new.conta_financeira_id,
           new.liquidacao_id, new.tipo, new.origem_tipo, new.origem_id,
           new.valor_bruto, new.taxa, new.desconto, new.valor_liquido,
           new.provider, new.provider_reference) then
      raise exception 'Evidência de movimento não pode ser alterada diretamente.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function app_private.finance_proteger_conciliacao_direta() from public, anon, authenticated;

create trigger finance_conciliacoes_proteger_direto
  before insert or update on public.finance_conciliacoes
  for each row execute function app_private.finance_proteger_conciliacao_direta();

create trigger finance_liquidacoes_proteger_direto
  before insert or update on public.finance_liquidacoes
  for each row execute function app_private.finance_proteger_conciliacao_direta();

create trigger finance_movimentos_proteger_direto
  before insert or update on public.finance_movimentos
  for each row execute function app_private.finance_proteger_conciliacao_direta();

-- Canonical settlements and movements are created by the existing finance RPCs.
-- Keep UPDATE grants for unrelated fields; protect matching evidence in the trigger.
revoke insert on public.finance_liquidacoes, public.finance_movimentos from authenticated;

create function public.finance_conciliar_liquidacao(p_conciliacao_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_c public.finance_conciliacoes%rowtype;
  v_l public.finance_liquidacoes%rowtype;
  v_m public.finance_movimentos%rowtype;
  v_r public.finance_recebiveis%rowtype;
  v_parcela record;
  v_rateios integer := 0;
  v_rateado numeric(14,2) := 0;
begin
  if v_actor is null or auth.jwt() ->> 'role' is distinct from 'authenticated' then
    raise exception 'Acesso financeiro negado.' using errcode = '42501';
  end if;
  if p_conciliacao_id is null then
    raise exception 'Conciliação inválida.' using errcode = '22023';
  end if;

  select * into v_c from public.finance_conciliacoes
    where id = p_conciliacao_id for update;
  if not found then
    raise exception 'Conciliação indisponível.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.usuarios_clinica uc
    where uc.clinica_id = v_c.clinica_id and uc.ativo
      and (uc.user_id = v_actor or
           (uc.user_id is null and lower(uc.email) = lower(coalesce(v_email, ''))))
      and (uc.papel in ('owner', 'admin', 'financeiro') or
           coalesce(uc.permissoes -> 'secoes', '[]'::jsonb) ? 'financeiro')
  ) then
    raise exception 'Acesso financeiro negado.' using errcode = '42501';
  end if;
  if v_c.status = 'conciliado' then
    raise exception 'Esta liquidação já foi conciliada.' using errcode = '23505';
  end if;
  if v_c.status <> 'pendente' then
    raise exception 'Estado de conciliação incompatível.' using errcode = '22023';
  end if;
  if v_c.liquidacao_id is null or v_c.movimento_id is null or
     v_c.conta_financeira_id is null or v_c.valor_provider is null or
     nullif(btrim(v_c.provider), '') is null or
     nullif(btrim(v_c.provider_reference), '') is null then
    raise exception 'Conciliação sem evidência financeira completa.' using errcode = '22023';
  end if;

  select * into v_l from public.finance_liquidacoes
    where id = v_c.liquidacao_id and clinica_id = v_c.clinica_id for update;
  if not found then
    raise exception 'Liquidação não encontrada para a clínica.' using errcode = 'P0002';
  end if;
  if v_l.tipo <> 'recebimento' or v_l.recebivel_id is null or
     v_l.reversao_de_id is not null or v_l.conciliado then
    raise exception 'Liquidação indisponível para conciliação.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.finance_liquidacoes e
    where e.clinica_id = v_c.clinica_id and e.reversao_de_id = v_l.id
  ) then
    raise exception 'Liquidação estornada não pode ser conciliada.' using errcode = '22023';
  end if;
  if v_c.conta_financeira_id is distinct from v_l.conta_financeira_id or
     v_c.provider is distinct from v_l.provider or
     v_c.provider_reference is distinct from v_l.provider_reference or
     v_c.valor_provider is distinct from v_l.valor_bruto then
    raise exception 'Conta, provedor, referência ou valor bruto divergente.' using errcode = '22023';
  end if;

  select * into v_m from public.finance_movimentos
    where id = v_c.movimento_id and clinica_id = v_c.clinica_id for update;
  if not found then
    raise exception 'Movimento não encontrado para a clínica.' using errcode = 'P0002';
  end if;
  if v_m.liquidacao_id is distinct from v_l.id or
     v_m.conta_financeira_id is distinct from v_l.conta_financeira_id or
     v_m.tipo <> 'entrada' or v_m.origem_tipo <> 'liquidacao' or
     v_m.origem_id is distinct from v_l.id::text or v_m.conciliado or
     v_m.provider is distinct from v_l.provider or
     v_m.provider_reference is distinct from v_l.provider_reference or
     v_m.valor_bruto is distinct from v_l.valor_bruto or
     v_m.valor_liquido is distinct from v_l.valor_liquido or
     v_m.taxa is distinct from v_l.taxa then
    raise exception 'Movimento financeiro divergente da liquidação.' using errcode = '22023';
  end if;

  select * into v_r from public.finance_recebiveis
    where id = v_l.recebivel_id and clinica_id = v_c.clinica_id for update;
  if not found then
    raise exception 'Recebível não encontrado para a clínica.' using errcode = 'P0002';
  end if;
  if v_r.status not in ('parcial', 'pago') or
     v_r.valor_recebido < v_l.valor_bruto then
    raise exception 'Recebível cancelado, estornado ou sem pagamento válido.' using errcode = '22023';
  end if;

  for v_parcela in
    select lp.valor, p.recebivel_id, p.status, p.valor_liquidado
    from public.finance_liquidacao_parcelas lp
    join public.finance_recebivel_parcelas p
      on p.clinica_id = lp.clinica_id and p.id = lp.recebivel_parcela_id
    where lp.clinica_id = v_c.clinica_id and lp.liquidacao_id = v_l.id
    for update of lp, p
  loop
    if v_parcela.recebivel_id is distinct from v_r.id or
       v_parcela.status not in ('parcial', 'pago') or
       v_parcela.valor_liquidado < v_parcela.valor then
      raise exception 'Parcela incompatível com a liquidação.' using errcode = '22023';
    end if;
    v_rateios := v_rateios + 1;
    v_rateado := v_rateado + v_parcela.valor;
  end loop;
  if (v_rateios > 0 and v_rateado <> v_l.valor_bruto) or
     (v_rateios = 0 and exists (
       select 1 from public.finance_recebivel_parcelas p
       where p.clinica_id = v_c.clinica_id and p.recebivel_id = v_r.id
     )) then
    raise exception 'Rateio de parcelas não corresponde ao valor bruto liquidado.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.finance_conciliacoes other
    where other.clinica_id = v_c.clinica_id and other.id <> v_c.id
      and other.status = 'conciliado'
      and (other.liquidacao_id = v_l.id or other.movimento_id = v_m.id)
  ) then
    raise exception 'Liquidação ou movimento já utilizados em outra conciliação.' using errcode = '23505';
  end if;

  update public.finance_conciliacoes
    set status = 'conciliado', conciliado_em = now(), conciliado_por = v_actor
    where id = v_c.id and clinica_id = v_c.clinica_id;
  update public.finance_liquidacoes set conciliado = true
    where id = v_l.id and clinica_id = v_c.clinica_id;
  update public.finance_movimentos set conciliado = true
    where id = v_m.id and clinica_id = v_c.clinica_id;

  insert into public.auditoria_clinica
    (clinica_id, actor_id, acao, entidade_tipo, entidade_id, metadata)
  values
    (v_c.clinica_id, v_actor, 'financeiro.liquidacao_conciliada',
     'finance_conciliacao', v_c.id::text,
     jsonb_build_object('liquidacao_id', v_l.id, 'movimento_id', v_m.id,
       'estado_anterior', v_c.status, 'estado_novo', 'conciliado',
       'valor_bruto', v_l.valor_bruto, 'conciliado_em', now()));

  return jsonb_build_object('conciliacao_id', v_c.id, 'liquidacao_id', v_l.id,
    'movimento_id', v_m.id, 'status', 'conciliado');
end $$;

revoke all on function public.finance_conciliar_liquidacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.finance_conciliar_liquidacao(uuid) to authenticated;

commit;
