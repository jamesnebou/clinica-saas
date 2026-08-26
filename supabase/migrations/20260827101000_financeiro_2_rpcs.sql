begin;

create or replace function public.finance_criar_recebivel(
  p_clinica_id uuid, p_descricao text, p_origem_tipo text, p_origem_id text, p_valor numeric,
  p_vencimento date default null, p_competencia date default null, p_cliente_id uuid default null,
  p_profissional_id uuid default null, p_procedimento_id uuid default null, p_agendamento_id uuid default null,
  p_pedido_id uuid default null, p_cliente_pacote_id uuid default null, p_categoria_codigo text default 'REC_SERVICOS',
  p_centro_custo_codigo text default 'CLINICA', p_provider text default null, p_provider_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.finance_recebiveis
language plpgsql security definer set search_path=public,app_private as $$
declare v_result public.finance_recebiveis; v_categoria uuid; v_centro uuid;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if coalesce(p_valor,0) < 0 then raise exception 'O valor do recebível não pode ser negativo.' using errcode='22023'; end if;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo=p_categoria_codigo and ativa limit 1;
  select id into v_centro from public.finance_centros_custo where clinica_id=p_clinica_id and codigo=p_centro_custo_codigo and ativo limit 1;
  if v_categoria is null then raise exception 'Categoria financeira não configurada: %',p_categoria_codigo using errcode='23503'; end if;
  insert into public.finance_recebiveis(clinica_id,cliente_id,profissional_id,procedimento_id,agendamento_id,pedido_id,cliente_pacote_id,
    categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,provider,provider_reference,metadata,created_by)
  values(p_clinica_id,p_cliente_id,p_profissional_id,p_procedimento_id,p_agendamento_id,p_pedido_id,p_cliente_pacote_id,
    v_categoria,v_centro,p_descricao,p_origem_tipo,p_origem_id,p_valor,coalesce(p_competencia,date_trunc('month',coalesce(p_vencimento,current_date))::date),
    p_vencimento,p_provider,p_provider_reference,coalesce(p_metadata,'{}'::jsonb),auth.uid())
  on conflict (clinica_id,origem_tipo,origem_id) do update set
    descricao=excluded.descricao, valor_original=excluded.valor_original, vencimento=excluded.vencimento,
    provider=coalesce(excluded.provider,finance_recebiveis.provider), provider_reference=coalesce(excluded.provider_reference,finance_recebiveis.provider_reference),
    metadata=finance_recebiveis.metadata||excluded.metadata, updated_at=now()
  where finance_recebiveis.valor_recebido=0 and finance_recebiveis.status in ('aberto','cancelado')
  returning * into v_result;
  if v_result.id is null then select * into v_result from public.finance_recebiveis where clinica_id=p_clinica_id and origem_tipo=p_origem_tipo and origem_id=p_origem_id; end if;
  return v_result;
end $$;

create or replace function public.finance_liquidar_recebivel(
  p_clinica_id uuid, p_recebivel_id uuid, p_valor numeric, p_conta_id uuid default null,
  p_forma_pagamento text default null, p_data_liquidacao timestamptz default now(), p_taxa numeric default 0,
  p_provider text default null, p_provider_reference text default null, p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare v_r public.finance_recebiveis; v_l public.finance_liquidacoes; v_conta uuid; v_aberto numeric; v_novo numeric;
  v_mov uuid; v_regra public.finance_comissao_regras; v_percentual numeric; v_comissao numeric; v_categoria_taxa uuid;
  v_parcela public.finance_recebivel_parcelas; v_restante numeric; v_aplicar numeric;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if coalesce(p_valor,0)<=0 or coalesce(p_taxa,0)<0 or p_taxa>p_valor then raise exception 'Valor ou taxa de liquidação inválido.' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Chave de idempotência obrigatória.' using errcode='22023'; end if;
  select * into v_l from public.finance_liquidacoes where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('liquidacao_id',v_l.id,'idempotente',true); end if;
  select * into v_r from public.finance_recebiveis where clinica_id=p_clinica_id and id=p_recebivel_id for update;
  if not found then raise exception 'Recebível não encontrado.' using errcode='P0002'; end if;
  if v_r.status in ('cancelado','estornado','renegociado') then raise exception 'Recebível não pode ser liquidado no status %.',v_r.status using errcode='22023'; end if;
  v_aberto:=v_r.valor_total-v_r.valor_recebido;
  if p_valor>v_aberto then raise exception 'Recebimento de % excede o saldo aberto de %.',p_valor,v_aberto using errcode='22023'; end if;
  v_conta:=p_conta_id;
  if v_conta is null then select id into v_conta from public.finance_contas where clinica_id=p_clinica_id and padrao and ativa limit 1; end if;
  if v_conta is null then raise exception 'Conta financeira padrão não configurada.' using errcode='23503'; end if;
  insert into public.finance_liquidacoes(clinica_id,recebivel_id,conta_financeira_id,tipo,valor_bruto,taxa,valor_liquido,forma_pagamento,
    data_liquidacao,provider,provider_reference,idempotency_key,metadata,created_by)
  values(p_clinica_id,v_r.id,v_conta,'recebimento',p_valor,p_taxa,p_valor-p_taxa,p_forma_pagamento,coalesce(p_data_liquidacao,now()),
    p_provider,p_provider_reference,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb),auth.uid()) returning * into v_l;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,centro_custo_id,liquidacao_id,tipo,origem_tipo,origem_id,
    descricao,valor_bruto,taxa,valor_liquido,data_movimento,competencia,provider,provider_reference,metadata,created_by)
  values(p_clinica_id,v_conta,v_r.categoria_id,v_r.centro_custo_id,v_l.id,'entrada','liquidacao',v_l.id::text,v_r.descricao,p_valor,p_taxa,
    p_valor-p_taxa,v_l.data_liquidacao,date_trunc('month',v_l.data_liquidacao)::date,p_provider,p_provider_reference,coalesce(p_metadata,'{}'::jsonb),auth.uid()) returning id into v_mov;
  v_novo:=v_r.valor_recebido+p_valor;
  update public.finance_recebiveis set valor_recebido=v_novo,status=case when v_novo>=valor_total then 'pago' else 'parcial' end,
    forma_pagamento=coalesce(p_forma_pagamento,forma_pagamento),updated_at=now() where id=v_r.id;
  v_restante:=p_valor;
  for v_parcela in select * from public.finance_recebivel_parcelas where clinica_id=p_clinica_id and recebivel_id=v_r.id and status in ('aberto','parcial') order by numero for update loop
    exit when v_restante<=0;
    v_aplicar:=least(v_restante,v_parcela.valor-v_parcela.valor_liquidado);
    if v_aplicar>0 then
      insert into public.finance_liquidacao_parcelas(clinica_id,liquidacao_id,recebivel_parcela_id,valor) values(p_clinica_id,v_l.id,v_parcela.id,v_aplicar);
      update public.finance_recebivel_parcelas set valor_liquidado=valor_liquidado+v_aplicar,status=case when valor_liquidado+v_aplicar>=valor then 'pago' else 'parcial' end,updated_at=now() where id=v_parcela.id;
      v_restante:=v_restante-v_aplicar;
    end if;
  end loop;
  if p_provider_reference is not null then
    insert into public.finance_conciliacoes(clinica_id,conta_financeira_id,liquidacao_id,movimento_id,provider,provider_reference,valor_provider,data_provider,status,payload_resumo)
    values(p_clinica_id,v_conta,v_l.id,v_mov,coalesce(p_provider,'manual'),p_provider_reference,p_valor,v_l.data_liquidacao,'conciliado',jsonb_build_object('origem','liquidacao'))
    on conflict (clinica_id,provider,provider_reference) do update set liquidacao_id=excluded.liquidacao_id,movimento_id=excluded.movimento_id,status='conciliado',conciliado_em=now();
    update public.finance_liquidacoes set conciliado=true where id=v_l.id;
    update public.finance_movimentos set conciliado=true where id=v_mov;
  end if;
  if v_r.profissional_id is not null then
    select * into v_regra from public.finance_comissao_regras cr where cr.clinica_id=p_clinica_id and cr.ativa
      and (cr.profissional_id is null or cr.profissional_id=v_r.profissional_id) and (cr.procedimento_id is null or cr.procedimento_id=v_r.procedimento_id)
      and (cr.vigencia_inicio is null or cr.vigencia_inicio<=v_l.data_liquidacao::date) and (cr.vigencia_fim is null or cr.vigencia_fim>=v_l.data_liquidacao::date)
      order by (cr.profissional_id is not null)::int desc,(cr.procedimento_id is not null)::int desc,cr.prioridade desc limit 1;
    if found then v_percentual:=v_regra.percentual; v_comissao:=case when v_regra.tipo='fixo' then least(p_valor,v_regra.valor_fixo) else round((p_valor-p_taxa)*v_regra.percentual/100,2) end;
    else select coalesce(comissao_percentual,0) into v_percentual from public.profissionais where clinica_id=p_clinica_id and id=v_r.profissional_id; v_comissao:=round((p_valor-p_taxa)*coalesce(v_percentual,0)/100,2); end if;
    if v_comissao>0 then insert into public.finance_comissoes(clinica_id,profissional_id,procedimento_id,agendamento_id,recebivel_id,liquidacao_id,regra_id,competencia,base_calculo,percentual,valor,status)
      values(p_clinica_id,v_r.profissional_id,v_r.procedimento_id,v_r.agendamento_id,v_r.id,v_l.id,v_regra.id,date_trunc('month',v_l.data_liquidacao)::date,p_valor-p_taxa,coalesce(v_percentual,0),v_comissao,'disponivel') on conflict do nothing; end if;
  end if;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
    values(p_clinica_id,auth.uid(),'financeiro.recebimento_liquidado','finance_liquidacao',v_l.id::text,jsonb_build_object('valor',p_valor,'recebivel_id',v_r.id));
  return jsonb_build_object('liquidacao_id',v_l.id,'movimento_id',v_mov,'status',case when v_novo>=v_r.valor_total then 'pago' else 'parcial' end,'idempotente',false);
end $$;

create or replace function public.finance_transferir(
  p_clinica_id uuid,p_conta_origem_id uuid,p_conta_destino_id uuid,p_valor numeric,p_data timestamptz,
  p_descricao text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_id uuid; v_saida uuid; v_entrada uuid; v_categoria uuid;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if p_conta_origem_id=p_conta_destino_id or coalesce(p_valor,0)<=0 then raise exception 'Transferência inválida.' using errcode='22023'; end if;
  select id into v_id from public.finance_transferencias where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key; if found then return v_id; end if;
  perform 1 from public.finance_contas where clinica_id=p_clinica_id and id in (p_conta_origem_id,p_conta_destino_id) and ativa; if (select count(*) from public.finance_contas where clinica_id=p_clinica_id and id in (p_conta_origem_id,p_conta_destino_id) and ativa)<>2 then raise exception 'Conta financeira inválida.' using errcode='23503'; end if;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo='TRANSFERENCIAS';
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,created_by)
    values(p_clinica_id,p_conta_origem_id,v_categoria,'transferencia_saida','transferencia',p_idempotency_key,p_descricao,p_valor,p_valor,coalesce(p_data,now()),date_trunc('month',coalesce(p_data,now()))::date,auth.uid()) returning id into v_saida;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,created_by)
    values(p_clinica_id,p_conta_destino_id,v_categoria,'transferencia_entrada','transferencia',p_idempotency_key,p_descricao,p_valor,p_valor,coalesce(p_data,now()),date_trunc('month',coalesce(p_data,now()))::date,auth.uid()) returning id into v_entrada;
  insert into public.finance_transferencias(clinica_id,conta_origem_id,conta_destino_id,movimento_saida_id,movimento_entrada_id,valor,data_transferencia,descricao,idempotency_key,created_by)
    values(p_clinica_id,p_conta_origem_id,p_conta_destino_id,v_saida,v_entrada,p_valor,coalesce(p_data,now()),p_descricao,p_idempotency_key,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.finance_resumo_clinica(p_clinica_id uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer stable set search_path=public,app_private as $$
declare v_result jsonb;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  select jsonb_build_object(
    'periodo',jsonb_build_object('inicio',p_inicio,'fim',p_fim),
    'receber',coalesce((select jsonb_build_object('total',sum(valor_total),'recebido',sum(valor_recebido),'aberto',sum(greatest(0,valor_total-valor_recebido)),'vencido',sum(case when vencimento<current_date and status in ('aberto','parcial') then greatest(0,valor_total-valor_recebido) else 0 end)) from public.finance_recebiveis where clinica_id=p_clinica_id and status not in ('cancelado','estornado') and coalesce(vencimento,emissao) between p_inicio and p_fim),'{}'::jsonb),
    'pagar',coalesce((select jsonb_build_object('total',sum(valor_total),'pago',sum(valor_pago),'aberto',sum(greatest(0,valor_total-valor_pago)),'vencido',sum(case when vencimento<current_date and status in ('aberto','parcial') then greatest(0,valor_total-valor_pago) else 0 end)) from public.finance_pagaveis where clinica_id=p_clinica_id and status not in ('cancelado','estornado') and coalesce(vencimento,emissao) between p_inicio and p_fim),'{}'::jsonb),
    'caixa',coalesce((select jsonb_build_object('entradas',sum(case when tipo in ('entrada','ajuste_entrada') then valor_liquido else 0 end),'saidas',sum(case when tipo in ('saida','ajuste_saida','estorno') then valor_liquido else 0 end),'taxas',sum(taxa)) from public.finance_movimentos where clinica_id=p_clinica_id and data_movimento::date between p_inicio and p_fim),'{}'::jsonb),
    'comissoes',coalesce((select jsonb_build_object('provisionadas',sum(valor) filter(where status in ('provisionada','disponivel')),'pagas',sum(valor) filter(where status='paga')) from public.finance_comissoes where clinica_id=p_clinica_id and competencia between date_trunc('month',p_inicio)::date and date_trunc('month',p_fim)::date),'{}'::jsonb),
    'conciliacao',coalesce((select jsonb_build_object('pendentes',count(*) filter(where status='pendente'),'divergentes',count(*) filter(where status='divergente')) from public.finance_conciliacoes where clinica_id=p_clinica_id),'{}'::jsonb)
  ) into v_result;
  return v_result;
end $$;

grant execute on function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_liquidar_recebivel(uuid,uuid,numeric,uuid,text,timestamptz,numeric,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text) to authenticated,service_role;
grant execute on function public.finance_resumo_clinica(uuid,date,date) to authenticated,service_role;

commit;
