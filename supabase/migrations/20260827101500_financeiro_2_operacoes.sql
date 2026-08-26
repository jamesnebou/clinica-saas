begin;

create or replace function public.finance_liquidar_pagavel(p_clinica_id uuid,p_pagavel_id uuid,p_valor numeric,p_conta_id uuid,
  p_forma_pagamento text,p_data_liquidacao timestamptz,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare v_p public.finance_pagaveis; v_l public.finance_liquidacoes; v_conta uuid; v_mov uuid; v_novo numeric;
  v_parcela public.finance_pagavel_parcelas; v_restante numeric; v_aplicar numeric;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if coalesce(p_valor,0)<=0 or nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Pagamento inválido.' using errcode='22023'; end if;
  select * into v_l from public.finance_liquidacoes where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key; if found then return jsonb_build_object('liquidacao_id',v_l.id,'idempotente',true); end if;
  select * into v_p from public.finance_pagaveis where clinica_id=p_clinica_id and id=p_pagavel_id for update; if not found then raise exception 'Conta a pagar não encontrada.' using errcode='P0002'; end if;
  if v_p.status in ('cancelado','estornado') or p_valor>v_p.valor_total-v_p.valor_pago then raise exception 'Valor excede o saldo aberto ou conta indisponível.' using errcode='22023'; end if;
  v_conta:=p_conta_id; if v_conta is null then select id into v_conta from public.finance_contas where clinica_id=p_clinica_id and padrao and ativa limit 1; end if;
  insert into public.finance_liquidacoes(clinica_id,pagavel_id,conta_financeira_id,tipo,valor_bruto,valor_liquido,forma_pagamento,data_liquidacao,idempotency_key,metadata,created_by)
    values(p_clinica_id,v_p.id,v_conta,'pagamento',p_valor,p_valor,p_forma_pagamento,coalesce(p_data_liquidacao,now()),p_idempotency_key,p_metadata,auth.uid()) returning * into v_l;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,centro_custo_id,liquidacao_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,metadata,created_by)
    values(p_clinica_id,v_conta,v_p.categoria_id,v_p.centro_custo_id,v_l.id,'saida','liquidacao',v_l.id::text,v_p.descricao,p_valor,p_valor,v_l.data_liquidacao,date_trunc('month',v_l.data_liquidacao)::date,p_metadata,auth.uid()) returning id into v_mov;
  v_novo:=v_p.valor_pago+p_valor; update public.finance_pagaveis set valor_pago=v_novo,status=case when v_novo>=valor_total then 'pago' else 'parcial' end where id=v_p.id;
  v_restante:=p_valor;
  for v_parcela in select * from public.finance_pagavel_parcelas where clinica_id=p_clinica_id and pagavel_id=v_p.id and status in ('aberto','parcial') order by numero for update loop
    exit when v_restante<=0;
    v_aplicar:=least(v_restante,v_parcela.valor-v_parcela.valor_liquidado);
    if v_aplicar>0 then
      insert into public.finance_liquidacao_parcelas(clinica_id,liquidacao_id,pagavel_parcela_id,valor) values(p_clinica_id,v_l.id,v_parcela.id,v_aplicar);
      update public.finance_pagavel_parcelas set valor_liquidado=valor_liquidado+v_aplicar,status=case when valor_liquidado+v_aplicar>=valor then 'pago' else 'parcial' end,updated_at=now() where id=v_parcela.id;
      v_restante:=v_restante-v_aplicar;
    end if;
  end loop;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata) values(p_clinica_id,auth.uid(),'financeiro.pagamento_liquidado','finance_liquidacao',v_l.id::text,jsonb_build_object('valor',p_valor,'pagavel_id',v_p.id));
  return jsonb_build_object('liquidacao_id',v_l.id,'movimento_id',v_mov,'idempotente',false);
end $$;

create or replace function public.finance_estornar_liquidacao(p_clinica_id uuid,p_liquidacao_id uuid,p_motivo text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_o public.finance_liquidacoes; v_n uuid; v_mov uuid; v_rateio public.finance_liquidacao_parcelas; v_restante numeric;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  select * into v_o from public.finance_liquidacoes where clinica_id=p_clinica_id and id=p_liquidacao_id for update; if not found then raise exception 'Liquidação não encontrada.' using errcode='P0002'; end if;
  select id into v_n from public.finance_liquidacoes where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key; if found then return v_n; end if;
  if v_o.tipo like 'estorno_%' then raise exception 'Um estorno não pode ser estornado por esta operação.' using errcode='22023'; end if;
  insert into public.finance_liquidacoes(clinica_id,recebivel_id,pagavel_id,conta_financeira_id,tipo,valor_bruto,taxa,valor_liquido,forma_pagamento,data_liquidacao,idempotency_key,reversao_de_id,metadata,created_by)
    values(p_clinica_id,v_o.recebivel_id,v_o.pagavel_id,v_o.conta_financeira_id,case when v_o.tipo='recebimento' then 'estorno_recebimento' else 'estorno_pagamento' end,v_o.valor_bruto,0,v_o.valor_liquido,v_o.forma_pagamento,now(),p_idempotency_key,v_o.id,jsonb_build_object('motivo',p_motivo),auth.uid()) returning id into v_n;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,liquidacao_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,metadata,created_by)
    values(p_clinica_id,v_o.conta_financeira_id,v_n,'estorno','estorno_liquidacao',v_n::text,'Estorno: '||coalesce(p_motivo,'sem motivo'),v_o.valor_bruto,v_o.valor_liquido,now(),date_trunc('month',now())::date,jsonb_build_object('liquidacao_original',v_o.id),auth.uid()) returning id into v_mov;
  if v_o.recebivel_id is not null then update public.finance_recebiveis set valor_recebido=greatest(0,valor_recebido-v_o.valor_bruto),status=case when valor_recebido-v_o.valor_bruto<=0 then 'aberto' else 'parcial' end where id=v_o.recebivel_id; end if;
  if v_o.pagavel_id is not null then update public.finance_pagaveis set valor_pago=greatest(0,valor_pago-v_o.valor_bruto),status=case when valor_pago-v_o.valor_bruto<=0 then 'aberto' else 'parcial' end where id=v_o.pagavel_id; end if;
  for v_rateio in select * from public.finance_liquidacao_parcelas where clinica_id=p_clinica_id and liquidacao_id=v_o.id for update loop
    if v_rateio.recebivel_parcela_id is not null then
      update public.finance_recebivel_parcelas set valor_liquidado=greatest(0,valor_liquidado-v_rateio.valor),status=case when valor_liquidado-v_rateio.valor<=0 then 'aberto' else 'parcial' end,updated_at=now() where id=v_rateio.recebivel_parcela_id;
    else
      update public.finance_pagavel_parcelas set valor_liquidado=greatest(0,valor_liquidado-v_rateio.valor),status=case when valor_liquidado-v_rateio.valor<=0 then 'aberto' else 'parcial' end,updated_at=now() where id=v_rateio.pagavel_parcela_id;
    end if;
  end loop;
  update public.finance_comissoes set status='estornada',updated_at=now() where clinica_id=p_clinica_id and liquidacao_id=v_o.id and status<>'paga';
  return v_n;
end $$;

create or replace function public.finance_gerar_recorrencias(p_ate date default current_date)
returns integer language plpgsql security definer set search_path=public,app_private as $$
declare r public.finance_recorrencias; v_count integer:=0; v_months integer;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Operação exclusiva do serviço.' using errcode='42501'; end if;
  for r in select * from public.finance_recorrencias where ativa and proximo_vencimento<=p_ate and (termina_em is null or proximo_vencimento<=termina_em) for update loop
    if r.tipo='receber' then insert into public.finance_recebiveis(clinica_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,metadata)
      values(r.clinica_id,r.categoria_id,r.centro_custo_id,r.descricao,'recorrencia',r.id::text||':'||r.proximo_vencimento::text,r.valor,r.proxima_competencia,r.proximo_vencimento,jsonb_build_object('recorrencia_id',r.id)) on conflict do nothing;
    else insert into public.finance_pagaveis(clinica_id,fornecedor_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,metadata)
      values(r.clinica_id,r.fornecedor_id,r.categoria_id,r.centro_custo_id,r.descricao,'recorrencia',r.id::text||':'||r.proximo_vencimento::text,r.valor,r.proxima_competencia,r.proximo_vencimento,jsonb_build_object('recorrencia_id',r.id)) on conflict do nothing; end if;
    v_months:=case r.periodicidade when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 else 1 end;
    update public.finance_recorrencias set ultima_geracao_em=now(),proximo_vencimento=case when r.periodicidade='semanal' then r.proximo_vencimento+7 when r.periodicidade='quinzenal' then r.proximo_vencimento+15 else (r.proximo_vencimento+(v_months||' months')::interval)::date end,proxima_competencia=(r.proxima_competencia+(v_months||' months')::interval)::date where id=r.id;
    v_count:=v_count+1;
  end loop; return v_count;
end $$;

create or replace function public.finance_criar_recebivel_parcelado(
  p_clinica_id uuid,p_descricao text,p_origem_tipo text,p_origem_id text,p_valor numeric,
  p_primeiro_vencimento date,p_parcelas integer default 1,p_categoria_codigo text default 'REC_SERVICOS',
  p_cliente_id uuid default null,p_metadata jsonb default '{}'::jsonb
)
returns public.finance_recebiveis language plpgsql security definer set search_path=public,app_private as $$
declare v_recebivel public.finance_recebiveis; v_total_centavos bigint; v_base bigint; v_resto integer; i integer; v_centavos bigint;
begin
  if p_parcelas<1 or p_parcelas>120 or p_primeiro_vencimento is null then raise exception 'Parcelamento inválido.' using errcode='22023'; end if;
  v_total_centavos:=round(p_valor*100)::bigint; v_base:=v_total_centavos/p_parcelas; v_resto:=(v_total_centavos%p_parcelas)::integer;
  if v_base<=0 then raise exception 'O valor deve permitir ao menos um centavo por parcela.' using errcode='22023'; end if;
  select * into v_recebivel from public.finance_criar_recebivel(
    p_clinica_id=>p_clinica_id,p_descricao=>p_descricao,p_origem_tipo=>p_origem_tipo,p_origem_id=>p_origem_id,
    p_valor=>p_valor,p_vencimento=>p_primeiro_vencimento,p_cliente_id=>p_cliente_id,p_categoria_codigo=>p_categoria_codigo,
    p_metadata=>coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('parcelas',p_parcelas)
  );
  if not exists(select 1 from public.finance_recebivel_parcelas where clinica_id=p_clinica_id and recebivel_id=v_recebivel.id) then
    for i in 1..p_parcelas loop
      v_centavos:=v_base+case when i<=v_resto then 1 else 0 end;
      insert into public.finance_recebivel_parcelas(clinica_id,recebivel_id,numero,vencimento,valor)
      values(p_clinica_id,v_recebivel.id,i,(p_primeiro_vencimento+((i-1)||' months')::interval)::date,v_centavos::numeric/100);
    end loop;
  end if;
  return v_recebivel;
end $$;

create or replace function public.finance_criar_pagavel(
  p_clinica_id uuid,p_descricao text,p_origem_tipo text,p_origem_id text,p_valor numeric,p_primeiro_vencimento date,
  p_categoria_id uuid,p_centro_custo_id uuid default null,p_fornecedor_id uuid default null,p_competencia date default null,
  p_parcelas integer default 1,p_metadata jsonb default '{}'::jsonb
)
returns public.finance_pagaveis language plpgsql security definer set search_path=public,app_private as $$
declare v_pagavel public.finance_pagaveis; v_total_centavos bigint; v_base bigint; v_resto integer; i integer; v_centavos bigint;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if p_parcelas<1 or p_parcelas>120 or p_primeiro_vencimento is null or coalesce(p_valor,0)<=0 then raise exception 'Conta a pagar ou parcelamento inválido.' using errcode='22023'; end if;
  perform 1 from public.finance_categorias where clinica_id=p_clinica_id and id=p_categoria_id and ativa; if not found then raise exception 'Categoria financeira inválida.' using errcode='23503'; end if;
  if p_centro_custo_id is not null then perform 1 from public.finance_centros_custo where clinica_id=p_clinica_id and id=p_centro_custo_id and ativo; if not found then raise exception 'Centro de custo inválido.' using errcode='23503'; end if; end if;
  if p_fornecedor_id is not null then perform 1 from public.finance_fornecedores where clinica_id=p_clinica_id and id=p_fornecedor_id and ativo; if not found then raise exception 'Fornecedor inválido.' using errcode='23503'; end if; end if;
  insert into public.finance_pagaveis(clinica_id,fornecedor_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,metadata,created_by)
  values(p_clinica_id,p_fornecedor_id,p_categoria_id,p_centro_custo_id,p_descricao,p_origem_tipo,p_origem_id,p_valor,coalesce(p_competencia,date_trunc('month',p_primeiro_vencimento)::date),p_primeiro_vencimento,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('parcelas',p_parcelas),auth.uid())
  on conflict(clinica_id,origem_tipo,origem_id) do update set descricao=excluded.descricao,updated_at=now()
  where finance_pagaveis.valor_pago=0 and finance_pagaveis.status='aberto' returning * into v_pagavel;
  if v_pagavel.id is null then select * into v_pagavel from public.finance_pagaveis where clinica_id=p_clinica_id and origem_tipo=p_origem_tipo and origem_id=p_origem_id; end if;
  v_total_centavos:=round(p_valor*100)::bigint; v_base:=v_total_centavos/p_parcelas; v_resto:=(v_total_centavos%p_parcelas)::integer;
  if v_base<=0 then raise exception 'O valor deve permitir ao menos um centavo por parcela.' using errcode='22023'; end if;
  if not exists(select 1 from public.finance_pagavel_parcelas where clinica_id=p_clinica_id and pagavel_id=v_pagavel.id) then
    for i in 1..p_parcelas loop
      v_centavos:=v_base+case when i<=v_resto then 1 else 0 end;
      insert into public.finance_pagavel_parcelas(clinica_id,pagavel_id,numero,vencimento,valor)
      values(p_clinica_id,v_pagavel.id,i,(p_primeiro_vencimento+((i-1)||' months')::interval)::date,v_centavos::numeric/100);
    end loop;
  end if;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
  values(p_clinica_id,auth.uid(),'financeiro.pagavel_criado','finance_pagavel',v_pagavel.id::text,jsonb_build_object('valor',p_valor,'parcelas',p_parcelas));
  return v_pagavel;
end $$;

create or replace function public.finance_cancelar_recebivel_origem(
  p_clinica_id uuid,
  p_origem_tipo text,
  p_origem_id text,
  p_motivo text default 'Cancelamento da origem'
)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare
  v_recebivel public.finance_recebiveis;
  v_liquidacao public.finance_liquidacoes;
  v_estornos integer:=0;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then
    raise exception 'Acesso financeiro negado.' using errcode='42501';
  end if;

  select * into v_recebivel
    from public.finance_recebiveis
   where clinica_id=p_clinica_id
     and origem_tipo=p_origem_tipo
     and origem_id=p_origem_id
   for update;

  if not found then
    return jsonb_build_object('encontrado',false,'cancelado',false,'estornos',0);
  end if;

  if v_recebivel.status='cancelado' then
    return jsonb_build_object('encontrado',true,'cancelado',true,'estornos',0,'idempotente',true);
  end if;

  for v_liquidacao in
    select l.*
      from public.finance_liquidacoes l
     where l.clinica_id=p_clinica_id
       and l.recebivel_id=v_recebivel.id
       and l.tipo='recebimento'
       and not exists (
         select 1
           from public.finance_liquidacoes e
          where e.clinica_id=l.clinica_id
            and e.reversao_de_id=l.id
       )
     order by l.created_at
     for update
  loop
    perform public.finance_estornar_liquidacao(
      p_clinica_id,
      v_liquidacao.id,
      coalesce(nullif(trim(p_motivo),''),'Cancelamento da origem'),
      'cancelamento:'||v_recebivel.id::text||':'||v_liquidacao.id::text
    );
    v_estornos:=v_estornos+1;
  end loop;

  update public.finance_recebiveis
     set valor_recebido=0,
         status='cancelado',
         metadata=metadata||jsonb_build_object(
           'cancelado_em',now(),
           'cancelamento_motivo',coalesce(nullif(trim(p_motivo),''),'Cancelamento da origem')
         )
   where id=v_recebivel.id;

  update public.finance_recebivel_parcelas
     set valor_liquidado=0,status='cancelado'
   where clinica_id=p_clinica_id
     and recebivel_id=v_recebivel.id;

  update public.finance_comissoes
     set status='estornada',updated_at=now()
   where clinica_id=p_clinica_id
     and recebivel_id=v_recebivel.id
     and status<>'paga';

  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
  values(
    p_clinica_id,
    auth.uid(),
    'financeiro.recebivel_cancelado',
    'finance_recebivel',
    v_recebivel.id::text,
    jsonb_build_object('origem_tipo',p_origem_tipo,'origem_id',p_origem_id,'estornos',v_estornos,'motivo',p_motivo)
  );

  return jsonb_build_object('encontrado',true,'cancelado',true,'estornos',v_estornos,'idempotente',false);
end $$;

create or replace function public.finance_reconhecer_sessao_pacote(
  p_clinica_id uuid,p_cliente_pacote_id uuid,p_sessao integer,p_competencia date default current_date
)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare
  v_pacote public.cliente_pacotes; v_recebivel public.finance_recebiveis;
  v_categoria uuid; v_centro uuid; v_numero integer; v_unitario numeric(14,2);
  v_valor numeric(14,2); v_competencia_id uuid;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  select * into v_pacote from public.cliente_pacotes where clinica_id=p_clinica_id and id=p_cliente_pacote_id for update;
  if not found then raise exception 'Pacote do cliente não encontrado.' using errcode='P0002'; end if;
  select id,valor into v_competencia_id,v_valor
    from public.finance_competencias
   where clinica_id=p_clinica_id
     and origem_tipo='sessao_pacote'
     and origem_id=v_pacote.id::text||':'||p_sessao::text;
  if found then
    return jsonb_build_object('competencia_id',v_competencia_id,'sessao',p_sessao,'valor',v_valor,'finalizado',p_sessao>=v_pacote.sessoes_total,'idempotente',true);
  end if;
  if v_pacote.status<>'ativo' or v_pacote.sessoes_utilizadas>=v_pacote.sessoes_total then raise exception 'Pacote sem sessão disponível.' using errcode='22023'; end if;
  v_numero:=v_pacote.sessoes_utilizadas+1;
  if p_sessao is null or p_sessao<>v_numero then raise exception 'A sessão informada não é a próxima sessão disponível.' using errcode='22023'; end if;
  select * into v_recebivel from public.finance_recebiveis where clinica_id=p_clinica_id and origem_tipo='cliente_pacote' and origem_id=v_pacote.id::text;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo='REC_PACOTES';
  select id into v_centro from public.finance_centros_custo where clinica_id=p_clinica_id and codigo='CLINICA';
  v_unitario:=trunc((v_pacote.valor_total*100)/v_pacote.sessoes_total)/100;
  v_valor:=case when v_numero=v_pacote.sessoes_total then v_pacote.valor_total-(v_unitario*(v_pacote.sessoes_total-1)) else v_unitario end;
  insert into public.finance_competencias(clinica_id,categoria_id,centro_custo_id,recebivel_id,origem_tipo,origem_id,descricao,tipo,competencia,valor,metadata)
  values(p_clinica_id,v_categoria,v_centro,v_recebivel.id,'sessao_pacote',v_pacote.id::text||':'||v_numero::text,v_pacote.nome_pacote||' - sessão '||v_numero::text,'receita',date_trunc('month',p_competencia)::date,v_valor,jsonb_build_object('cliente_pacote_id',v_pacote.id,'sessao',v_numero,'total_sessoes',v_pacote.sessoes_total))
  returning id into v_competencia_id;
  update public.cliente_pacotes set sessoes_utilizadas=v_numero,status=case when v_numero>=sessoes_total then 'finalizado' else status end where id=v_pacote.id;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
  values(p_clinica_id,auth.uid(),'financeiro.pacote_sessao_reconhecida','finance_competencia',v_competencia_id::text,jsonb_build_object('cliente_pacote_id',v_pacote.id,'sessao',v_numero,'valor',v_valor));
  return jsonb_build_object('competencia_id',v_competencia_id,'sessao',v_numero,'valor',v_valor,'finalizado',v_numero>=v_pacote.sessoes_total,'idempotente',false);
end $$;

grant execute on function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_estornar_liquidacao(uuid,uuid,text,text) to authenticated,service_role;
grant execute on function public.finance_gerar_recorrencias(date) to service_role;
grant execute on function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb) to authenticated,service_role;
grant execute on function public.finance_cancelar_recebivel_origem(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date) to authenticated,service_role;
commit;
