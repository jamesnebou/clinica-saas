begin;

-- Consolida instalações que receberam as quatro migrations do Financeiro 2.0
-- antes da finalização do rateio por parcela. É segura para ambientes existentes.
do $$
declare
  v_relacao text;
  v_ausentes text[] := '{}';
begin
  foreach v_relacao in array array[
    'public.finance_contas',
    'public.finance_categorias',
    'public.finance_centros_custo',
    'public.finance_recebiveis',
    'public.finance_recebivel_parcelas',
    'public.finance_pagaveis',
    'public.finance_pagavel_parcelas',
    'public.finance_liquidacoes',
    'public.finance_movimentos',
    'public.finance_transferencias',
    'public.finance_comissao_regras',
    'public.finance_comissoes',
    'public.finance_competencias',
    'public.finance_recorrencias',
    'public.finance_conciliacoes'
  ] loop
    if to_regclass(v_relacao) is null then
      v_ausentes := array_append(v_ausentes,v_relacao);
    end if;
  end loop;

  if cardinality(v_ausentes)>0 then
    raise exception 'Financeiro 2.0 incompleto. Relações ausentes: %. Verifique o histórico aplicado antes da consolidação.',array_to_string(v_ausentes,', ')
      using errcode='42P01';
  end if;
end $$;

create table if not exists public.finance_liquidacao_parcelas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  liquidacao_id uuid not null,
  recebivel_parcela_id uuid,
  pagavel_parcela_id uuid,
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  unique (clinica_id,id),
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete restrict,
  foreign key (clinica_id,recebivel_parcela_id) references public.finance_recebivel_parcelas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,pagavel_parcela_id) references public.finance_pagavel_parcelas(clinica_id,id) on delete restrict,
  check ((recebivel_parcela_id is not null)::integer + (pagavel_parcela_id is not null)::integer = 1)
);
create index if not exists finance_liquidacao_parcelas_liquidacao_idx on public.finance_liquidacao_parcelas(clinica_id,liquidacao_id);
alter table public.finance_liquidacao_parcelas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_liquidacao_parcelas' and policyname='finance_select_finance_liquidacao_parcelas') then
    create policy finance_select_finance_liquidacao_parcelas on public.finance_liquidacao_parcelas for select to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_liquidacao_parcelas' and policyname='finance_insert_finance_liquidacao_parcelas') then
    create policy finance_insert_finance_liquidacao_parcelas on public.finance_liquidacao_parcelas for insert to authenticated with check (app_private.finance_usuario_pode_gerir(clinica_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_liquidacao_parcelas' and policyname='finance_update_finance_liquidacao_parcelas') then
    create policy finance_update_finance_liquidacao_parcelas on public.finance_liquidacao_parcelas for update to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id)) with check (app_private.finance_usuario_pode_gerir(clinica_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_liquidacao_parcelas' and policyname='finance_delete_finance_liquidacao_parcelas') then
    create policy finance_delete_finance_liquidacao_parcelas on public.finance_liquidacao_parcelas for delete to authenticated using (app_private.finance_usuario_configura(clinica_id));
  end if;
end $$;
grant select,insert,update,delete on public.finance_liquidacao_parcelas to authenticated;
grant all privileges on public.finance_liquidacao_parcelas to service_role;

-- Instalações anteriores podiam possuir o título e a liquidação sem a parcela
-- correspondente. O reparo abaixo é aditivo, preserva centavos e pode ser
-- executado novamente sem duplicar dados.
insert into public.finance_recebivel_parcelas(
  clinica_id,recebivel_id,numero,vencimento,valor,valor_liquidado,status
)
select
  r.clinica_id,r.id,1,coalesce(r.vencimento,r.emissao),r.valor_total,
  least(r.valor_total,r.valor_recebido),
  case
    when r.status in ('cancelado','estornado') then r.status
    when r.valor_recebido>=r.valor_total then 'pago'
    when r.valor_recebido>0 then 'parcial'
    else 'aberto'
  end
from public.finance_recebiveis r
where r.valor_total>0
  and not exists (
    select 1 from public.finance_recebivel_parcelas p
    where p.clinica_id=r.clinica_id and p.recebivel_id=r.id
  );

insert into public.finance_pagavel_parcelas(
  clinica_id,pagavel_id,numero,vencimento,valor,valor_liquidado,status
)
select
  p.clinica_id,p.id,1,coalesce(p.vencimento,p.emissao),p.valor_total,
  least(p.valor_total,p.valor_pago),
  case
    when p.status in ('cancelado','estornado') then p.status
    when p.valor_pago>=p.valor_total then 'pago'
    when p.valor_pago>0 then 'parcial'
    else 'aberto'
  end
from public.finance_pagaveis p
where p.valor_total>0
  and not exists (
    select 1 from public.finance_pagavel_parcelas pp
    where pp.clinica_id=p.clinica_id and pp.pagavel_id=p.id
  );

with liquidacoes as (
  select
    l.*,
    coalesce(sum(l.valor_bruto) over (
      partition by l.clinica_id,l.recebivel_id
      order by l.data_liquidacao,l.created_at,l.id
      rows between unbounded preceding and 1 preceding
    ),0) as inicio_rateio,
    sum(l.valor_bruto) over (
      partition by l.clinica_id,l.recebivel_id
      order by l.data_liquidacao,l.created_at,l.id
    ) as fim_rateio
  from public.finance_liquidacoes l
  where l.tipo='recebimento' and l.recebivel_id is not null
), parcelas as (
  select
    p.*,
    coalesce(sum(p.valor) over (
      partition by p.clinica_id,p.recebivel_id
      order by p.numero,p.id
      rows between unbounded preceding and 1 preceding
    ),0) as inicio_parcela,
    sum(p.valor) over (
      partition by p.clinica_id,p.recebivel_id
      order by p.numero,p.id
    ) as fim_parcela
  from public.finance_recebivel_parcelas p
)
insert into public.finance_liquidacao_parcelas(
  clinica_id,liquidacao_id,recebivel_parcela_id,valor
)
select
  l.clinica_id,l.id,p.id,
  least(l.fim_rateio,p.fim_parcela)-greatest(l.inicio_rateio,p.inicio_parcela)
from liquidacoes l
join parcelas p on p.clinica_id=l.clinica_id and p.recebivel_id=l.recebivel_id
where least(l.fim_rateio,p.fim_parcela)>greatest(l.inicio_rateio,p.inicio_parcela)
  and not exists (
    select 1 from public.finance_liquidacao_parcelas lp
    where lp.clinica_id=l.clinica_id and lp.liquidacao_id=l.id
      and lp.recebivel_parcela_id=p.id
  );

with liquidacoes as (
  select
    l.*,
    coalesce(sum(l.valor_bruto) over (
      partition by l.clinica_id,l.pagavel_id
      order by l.data_liquidacao,l.created_at,l.id
      rows between unbounded preceding and 1 preceding
    ),0) as inicio_rateio,
    sum(l.valor_bruto) over (
      partition by l.clinica_id,l.pagavel_id
      order by l.data_liquidacao,l.created_at,l.id
    ) as fim_rateio
  from public.finance_liquidacoes l
  where l.tipo='pagamento' and l.pagavel_id is not null
), parcelas as (
  select
    p.*,
    coalesce(sum(p.valor) over (
      partition by p.clinica_id,p.pagavel_id
      order by p.numero,p.id
      rows between unbounded preceding and 1 preceding
    ),0) as inicio_parcela,
    sum(p.valor) over (
      partition by p.clinica_id,p.pagavel_id
      order by p.numero,p.id
    ) as fim_parcela
  from public.finance_pagavel_parcelas p
)
insert into public.finance_liquidacao_parcelas(
  clinica_id,liquidacao_id,pagavel_parcela_id,valor
)
select
  l.clinica_id,l.id,p.id,
  least(l.fim_rateio,p.fim_parcela)-greatest(l.inicio_rateio,p.inicio_parcela)
from liquidacoes l
join parcelas p on p.clinica_id=l.clinica_id and p.pagavel_id=l.pagavel_id
where least(l.fim_rateio,p.fim_parcela)>greatest(l.inicio_rateio,p.inicio_parcela)
  and not exists (
    select 1 from public.finance_liquidacao_parcelas lp
    where lp.clinica_id=l.clinica_id and lp.liquidacao_id=l.id
      and lp.pagavel_parcela_id=p.id
  );

update public.finance_recebivel_parcelas p
set valor_liquidado=least(p.valor,coalesce(x.valor,0)),
    status=case
      when p.status in ('cancelado','estornado') then p.status
      when coalesce(x.valor,0)>=p.valor then 'pago'
      when coalesce(x.valor,0)>0 then 'parcial'
      else 'aberto'
    end,
    updated_at=now()
from (
  select recebivel_parcela_id,sum(valor) valor
  from public.finance_liquidacao_parcelas
  where recebivel_parcela_id is not null
  group by recebivel_parcela_id
) x
where p.id=x.recebivel_parcela_id;

update public.finance_pagavel_parcelas p
set valor_liquidado=least(p.valor,coalesce(x.valor,0)),
    status=case
      when p.status in ('cancelado','estornado') then p.status
      when coalesce(x.valor,0)>=p.valor then 'pago'
      when coalesce(x.valor,0)>0 then 'parcial'
      else 'aberto'
    end,
    updated_at=now()
from (
  select pagavel_parcela_id,sum(valor) valor
  from public.finance_liquidacao_parcelas
  where pagavel_parcela_id is not null
  group by pagavel_parcela_id
) x
where p.id=x.pagavel_parcela_id;

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
  if coalesce(p_valor,0)<0 then raise exception 'O valor do recebível não pode ser negativo.' using errcode='22023'; end if;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo=p_categoria_codigo and ativa limit 1;
  select id into v_centro from public.finance_centros_custo where clinica_id=p_clinica_id and codigo=p_centro_custo_codigo and ativo limit 1;
  if v_categoria is null then raise exception 'Categoria financeira não configurada: %',p_categoria_codigo using errcode='23503'; end if;
  insert into public.finance_recebiveis(clinica_id,cliente_id,profissional_id,procedimento_id,agendamento_id,pedido_id,cliente_pacote_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,provider,provider_reference,metadata,created_by)
  values(p_clinica_id,p_cliente_id,p_profissional_id,p_procedimento_id,p_agendamento_id,p_pedido_id,p_cliente_pacote_id,v_categoria,v_centro,p_descricao,p_origem_tipo,p_origem_id,p_valor,coalesce(p_competencia,date_trunc('month',coalesce(p_vencimento,current_date))::date),p_vencimento,p_provider,p_provider_reference,coalesce(p_metadata,'{}'::jsonb),auth.uid())
  on conflict (clinica_id,origem_tipo,origem_id) do update set descricao=excluded.descricao,valor_original=excluded.valor_original,vencimento=excluded.vencimento,provider=coalesce(excluded.provider,finance_recebiveis.provider),provider_reference=coalesce(excluded.provider_reference,finance_recebiveis.provider_reference),metadata=finance_recebiveis.metadata||excluded.metadata,updated_at=now()
  where finance_recebiveis.valor_recebido=0 and finance_recebiveis.status in ('aberto','cancelado') returning * into v_result;
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
  v_mov uuid; v_regra public.finance_comissao_regras; v_regra_id uuid; v_percentual numeric; v_comissao numeric;
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
  insert into public.finance_liquidacoes(clinica_id,recebivel_id,conta_financeira_id,tipo,valor_bruto,taxa,valor_liquido,forma_pagamento,data_liquidacao,provider,provider_reference,idempotency_key,metadata,created_by)
  values(p_clinica_id,v_r.id,v_conta,'recebimento',p_valor,p_taxa,p_valor-p_taxa,p_forma_pagamento,coalesce(p_data_liquidacao,now()),p_provider,p_provider_reference,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb),auth.uid()) returning * into v_l;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,centro_custo_id,liquidacao_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,taxa,valor_liquido,data_movimento,competencia,provider,provider_reference,metadata,created_by)
  values(p_clinica_id,v_conta,v_r.categoria_id,v_r.centro_custo_id,v_l.id,'entrada','liquidacao',v_l.id::text,v_r.descricao,p_valor,p_taxa,p_valor-p_taxa,v_l.data_liquidacao,date_trunc('month',v_l.data_liquidacao)::date,p_provider,p_provider_reference,coalesce(p_metadata,'{}'::jsonb),auth.uid()) returning id into v_mov;
  v_novo:=v_r.valor_recebido+p_valor;
  update public.finance_recebiveis set valor_recebido=v_novo,status=case when v_novo>=valor_total then 'pago' else 'parcial' end,forma_pagamento=coalesce(p_forma_pagamento,forma_pagamento),updated_at=now() where id=v_r.id;
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
    if found then v_regra_id:=v_regra.id; v_percentual:=v_regra.percentual; v_comissao:=case when v_regra.tipo='fixo' then least(p_valor,v_regra.valor_fixo) else round((p_valor-p_taxa)*v_regra.percentual/100,2) end;
    else v_regra_id:=null; select coalesce(comissao_percentual,0) into v_percentual from public.profissionais where clinica_id=p_clinica_id and id=v_r.profissional_id; v_comissao:=round((p_valor-p_taxa)*coalesce(v_percentual,0)/100,2); end if;
    if v_comissao>0 then insert into public.finance_comissoes(clinica_id,profissional_id,procedimento_id,agendamento_id,recebivel_id,liquidacao_id,regra_id,competencia,base_calculo,percentual,valor,status)
      values(p_clinica_id,v_r.profissional_id,v_r.procedimento_id,v_r.agendamento_id,v_r.id,v_l.id,v_regra_id,date_trunc('month',v_l.data_liquidacao)::date,p_valor-p_taxa,coalesce(v_percentual,0),v_comissao,'disponivel') on conflict do nothing; end if;
  end if;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata) values(p_clinica_id,auth.uid(),'financeiro.recebimento_liquidado','finance_liquidacao',v_l.id::text,jsonb_build_object('valor',p_valor,'recebivel_id',v_r.id));
  return jsonb_build_object('liquidacao_id',v_l.id,'movimento_id',v_mov,'status',case when v_novo>=v_r.valor_total then 'pago' else 'parcial' end,'idempotente',false);
end $$;

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
  if v_conta is null then raise exception 'Conta financeira padrão não configurada.' using errcode='23503'; end if;
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
declare v_o public.finance_liquidacoes; v_n uuid; v_mov uuid; v_rateio public.finance_liquidacao_parcelas;
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
  select * into v_recebivel from public.finance_criar_recebivel(p_clinica_id=>p_clinica_id,p_descricao=>p_descricao,p_origem_tipo=>p_origem_tipo,p_origem_id=>p_origem_id,p_valor=>p_valor,p_vencimento=>p_primeiro_vencimento,p_cliente_id=>p_cliente_id,p_categoria_codigo=>p_categoria_codigo,p_metadata=>coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('parcelas',p_parcelas));
  if not exists(select 1 from public.finance_recebivel_parcelas where clinica_id=p_clinica_id and recebivel_id=v_recebivel.id) then
    for i in 1..p_parcelas loop
      v_centavos:=v_base+case when i<=v_resto then 1 else 0 end;
      insert into public.finance_recebivel_parcelas(clinica_id,recebivel_id,numero,vencimento,valor) values(p_clinica_id,v_recebivel.id,i,(p_primeiro_vencimento+((i-1)||' months')::interval)::date,v_centavos::numeric/100);
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
  on conflict(clinica_id,origem_tipo,origem_id) do update set descricao=excluded.descricao,updated_at=now() where finance_pagaveis.valor_pago=0 and finance_pagaveis.status='aberto' returning * into v_pagavel;
  if v_pagavel.id is null then select * into v_pagavel from public.finance_pagaveis where clinica_id=p_clinica_id and origem_tipo=p_origem_tipo and origem_id=p_origem_id; end if;
  v_total_centavos:=round(p_valor*100)::bigint; v_base:=v_total_centavos/p_parcelas; v_resto:=(v_total_centavos%p_parcelas)::integer;
  if v_base<=0 then raise exception 'O valor deve permitir ao menos um centavo por parcela.' using errcode='22023'; end if;
  if not exists(select 1 from public.finance_pagavel_parcelas where clinica_id=p_clinica_id and pagavel_id=v_pagavel.id) then
    for i in 1..p_parcelas loop
      v_centavos:=v_base+case when i<=v_resto then 1 else 0 end;
      insert into public.finance_pagavel_parcelas(clinica_id,pagavel_id,numero,vencimento,valor) values(p_clinica_id,v_pagavel.id,i,(p_primeiro_vencimento+((i-1)||' months')::interval)::date,v_centavos::numeric/100);
    end loop;
  end if;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata) values(p_clinica_id,auth.uid(),'financeiro.pagavel_criado','finance_pagavel',v_pagavel.id::text,jsonb_build_object('valor',p_valor,'parcelas',p_parcelas));
  return v_pagavel;
end $$;

create or replace function public.finance_reconhecer_sessao_pacote(
  p_clinica_id uuid,p_cliente_pacote_id uuid,p_sessao integer,p_competencia date default current_date
)
returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare v_pacote public.cliente_pacotes; v_recebivel public.finance_recebiveis; v_categoria uuid; v_centro uuid; v_numero integer; v_unitario numeric(14,2); v_valor numeric(14,2); v_competencia_id uuid;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  select * into v_pacote from public.cliente_pacotes where clinica_id=p_clinica_id and id=p_cliente_pacote_id for update;
  if not found then raise exception 'Pacote do cliente não encontrado.' using errcode='P0002'; end if;
  select id,valor into v_competencia_id,v_valor from public.finance_competencias where clinica_id=p_clinica_id and origem_tipo='sessao_pacote' and origem_id=v_pacote.id::text||':'||p_sessao::text;
  if found then return jsonb_build_object('competencia_id',v_competencia_id,'sessao',p_sessao,'valor',v_valor,'finalizado',p_sessao>=v_pacote.sessoes_total,'idempotente',true); end if;
  if v_pacote.status<>'ativo' or v_pacote.sessoes_utilizadas>=v_pacote.sessoes_total then raise exception 'Pacote sem sessão disponível.' using errcode='22023'; end if;
  v_numero:=v_pacote.sessoes_utilizadas+1;
  if p_sessao is null or p_sessao<>v_numero then raise exception 'A sessão informada não é a próxima sessão disponível.' using errcode='22023'; end if;
  select * into v_recebivel from public.finance_recebiveis where clinica_id=p_clinica_id and origem_tipo='cliente_pacote' and origem_id=v_pacote.id::text;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo='REC_PACOTES';
  select id into v_centro from public.finance_centros_custo where clinica_id=p_clinica_id and codigo='CLINICA';
  v_unitario:=trunc((v_pacote.valor_total*100)/v_pacote.sessoes_total)/100;
  v_valor:=case when v_numero=v_pacote.sessoes_total then v_pacote.valor_total-(v_unitario*(v_pacote.sessoes_total-1)) else v_unitario end;
  insert into public.finance_competencias(clinica_id,categoria_id,centro_custo_id,recebivel_id,origem_tipo,origem_id,descricao,tipo,competencia,valor,metadata)
  values(p_clinica_id,v_categoria,v_centro,v_recebivel.id,'sessao_pacote',v_pacote.id::text||':'||v_numero::text,v_pacote.nome_pacote||' - sessão '||v_numero::text,'receita',date_trunc('month',p_competencia)::date,v_valor,jsonb_build_object('cliente_pacote_id',v_pacote.id,'sessao',v_numero,'total_sessoes',v_pacote.sessoes_total)) returning id into v_competencia_id;
  update public.cliente_pacotes set sessoes_utilizadas=v_numero,status=case when v_numero>=sessoes_total then 'finalizado' else status end where id=v_pacote.id;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata) values(p_clinica_id,auth.uid(),'financeiro.pacote_sessao_reconhecida','finance_competencia',v_competencia_id::text,jsonb_build_object('cliente_pacote_id',v_pacote.id,'sessao',v_numero,'valor',v_valor));
  return jsonb_build_object('competencia_id',v_competencia_id,'sessao',v_numero,'valor',v_valor,'finalizado',v_numero>=v_pacote.sessoes_total,'idempotente',false);
end $$;

create or replace function public.finance_transferir(
  p_clinica_id uuid,p_conta_origem_id uuid,p_conta_destino_id uuid,p_valor numeric,p_data timestamptz,
  p_descricao text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_id uuid; v_saida uuid; v_entrada uuid; v_categoria uuid;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if p_conta_origem_id=p_conta_destino_id or coalesce(p_valor,0)<=0 then raise exception 'Transferência inválida.' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Chave de idempotência obrigatória.' using errcode='22023'; end if;
  select id into v_id from public.finance_transferencias where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key;
  if found then return v_id; end if;
  if (select count(*) from public.finance_contas where clinica_id=p_clinica_id and id in (p_conta_origem_id,p_conta_destino_id) and ativa)<>2 then raise exception 'Conta financeira inválida.' using errcode='23503'; end if;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo='TRANSFERENCIAS';
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,created_by)
    values(p_clinica_id,p_conta_origem_id,v_categoria,'transferencia_saida','transferencia',p_idempotency_key,p_descricao,p_valor,p_valor,coalesce(p_data,now()),date_trunc('month',coalesce(p_data,now()))::date,auth.uid()) returning id into v_saida;
  insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,tipo,origem_tipo,origem_id,descricao,valor_bruto,valor_liquido,data_movimento,competencia,created_by)
    values(p_clinica_id,p_conta_destino_id,v_categoria,'transferencia_entrada','transferencia',p_idempotency_key,p_descricao,p_valor,p_valor,coalesce(p_data,now()),date_trunc('month',coalesce(p_data,now()))::date,auth.uid()) returning id into v_entrada;
  insert into public.finance_transferencias(clinica_id,conta_origem_id,conta_destino_id,movimento_saida_id,movimento_entrada_id,valor,data_transferencia,descricao,idempotency_key,created_by)
    values(p_clinica_id,p_conta_origem_id,p_conta_destino_id,v_saida,v_entrada,p_valor,coalesce(p_data,now()),p_descricao,p_idempotency_key,auth.uid()) returning id into v_id;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
    values(p_clinica_id,auth.uid(),'financeiro.transferencia_criada','finance_transferencia',v_id::text,jsonb_build_object('valor',p_valor,'conta_origem_id',p_conta_origem_id,'conta_destino_id',p_conta_destino_id));
  return v_id;
end $$;

create or replace function public.finance_resumo_clinica(p_clinica_id uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer stable set search_path=public,app_private as $$
declare v_result jsonb;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Período financeiro inválido.' using errcode='22023'; end if;
  select jsonb_build_object(
    'periodo',jsonb_build_object('inicio',p_inicio,'fim',p_fim),
    'receber',coalesce((select jsonb_build_object('total',coalesce(sum(valor_total),0),'recebido',coalesce(sum(valor_recebido),0),'aberto',coalesce(sum(greatest(0,valor_total-valor_recebido)),0),'vencido',coalesce(sum(case when vencimento<current_date and status in ('aberto','parcial') then greatest(0,valor_total-valor_recebido) else 0 end),0)) from public.finance_recebiveis where clinica_id=p_clinica_id and status not in ('cancelado','estornado') and coalesce(vencimento,emissao) between p_inicio and p_fim),'{}'::jsonb),
    'pagar',coalesce((select jsonb_build_object('total',coalesce(sum(valor_total),0),'pago',coalesce(sum(valor_pago),0),'aberto',coalesce(sum(greatest(0,valor_total-valor_pago)),0),'vencido',coalesce(sum(case when vencimento<current_date and status in ('aberto','parcial') then greatest(0,valor_total-valor_pago) else 0 end),0)) from public.finance_pagaveis where clinica_id=p_clinica_id and status not in ('cancelado','estornado') and coalesce(vencimento,emissao) between p_inicio and p_fim),'{}'::jsonb),
    'caixa',coalesce((select jsonb_build_object('entradas',coalesce(sum(case when tipo in ('entrada','ajuste_entrada') then valor_liquido else 0 end),0),'saidas',coalesce(sum(case when tipo in ('saida','ajuste_saida','estorno') then valor_liquido else 0 end),0),'taxas',coalesce(sum(taxa),0)) from public.finance_movimentos where clinica_id=p_clinica_id and data_movimento::date between p_inicio and p_fim),'{}'::jsonb),
    'comissoes',coalesce((select jsonb_build_object('provisionadas',coalesce(sum(valor) filter(where status in ('provisionada','disponivel')),0),'pagas',coalesce(sum(valor) filter(where status='paga'),0)) from public.finance_comissoes where clinica_id=p_clinica_id and competencia between date_trunc('month',p_inicio)::date and date_trunc('month',p_fim)::date),'{}'::jsonb),
    'conciliacao',coalesce((select jsonb_build_object('pendentes',count(*) filter(where status='pendente'),'divergentes',count(*) filter(where status='divergente')) from public.finance_conciliacoes where clinica_id=p_clinica_id),'{}'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.finance_gerar_recorrencias(p_ate date default current_date)
returns integer language plpgsql security definer set search_path=public,app_private as $$
declare r public.finance_recorrencias; v_count integer:=0; v_months integer;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Operação exclusiva do serviço.' using errcode='42501'; end if;
  for r in select * from public.finance_recorrencias where ativa and proximo_vencimento<=p_ate and (termina_em is null or proximo_vencimento<=termina_em) for update loop
    if r.tipo='receber' then
      insert into public.finance_recebiveis(clinica_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,metadata)
      values(r.clinica_id,r.categoria_id,r.centro_custo_id,r.descricao,'recorrencia',r.id::text||':'||r.proximo_vencimento::text,r.valor,r.proxima_competencia,r.proximo_vencimento,jsonb_build_object('recorrencia_id',r.id)) on conflict do nothing;
    else
      insert into public.finance_pagaveis(clinica_id,fornecedor_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,metadata)
      values(r.clinica_id,r.fornecedor_id,r.categoria_id,r.centro_custo_id,r.descricao,'recorrencia',r.id::text||':'||r.proximo_vencimento::text,r.valor,r.proxima_competencia,r.proximo_vencimento,jsonb_build_object('recorrencia_id',r.id)) on conflict do nothing;
    end if;
    v_months:=case r.periodicidade when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 else 1 end;
    update public.finance_recorrencias set ultima_geracao_em=now(),proximo_vencimento=case when r.periodicidade='semanal' then r.proximo_vencimento+7 when r.periodicidade='quinzenal' then r.proximo_vencimento+15 else (r.proximo_vencimento+(v_months||' months')::interval)::date end,proxima_competencia=case when r.periodicidade='semanal' then r.proxima_competencia+7 when r.periodicidade='quinzenal' then r.proxima_competencia+15 else (r.proxima_competencia+(v_months||' months')::interval)::date end where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.finance_cancelar_recebivel_origem(
  p_clinica_id uuid,p_origem_tipo text,p_origem_id text,p_motivo text default 'Cancelamento da origem'
) returns jsonb language plpgsql security definer set search_path=public,app_private as $$
declare v_recebivel public.finance_recebiveis; v_liquidacao public.finance_liquidacoes; v_estornos integer:=0;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  select * into v_recebivel from public.finance_recebiveis where clinica_id=p_clinica_id and origem_tipo=p_origem_tipo and origem_id=p_origem_id for update;
  if not found then return jsonb_build_object('encontrado',false,'cancelado',false,'estornos',0); end if;
  if v_recebivel.status='cancelado' then return jsonb_build_object('encontrado',true,'cancelado',true,'estornos',0,'idempotente',true); end if;
  for v_liquidacao in
    select l.* from public.finance_liquidacoes l
    where l.clinica_id=p_clinica_id and l.recebivel_id=v_recebivel.id and l.tipo='recebimento'
      and not exists(select 1 from public.finance_liquidacoes e where e.clinica_id=l.clinica_id and e.reversao_de_id=l.id)
    order by l.created_at for update
  loop
    perform public.finance_estornar_liquidacao(p_clinica_id,v_liquidacao.id,coalesce(nullif(trim(p_motivo),''),'Cancelamento da origem'),'cancelamento:'||v_recebivel.id::text||':'||v_liquidacao.id::text);
    v_estornos:=v_estornos+1;
  end loop;
  update public.finance_recebiveis set valor_recebido=0,status='cancelado',metadata=metadata||jsonb_build_object('cancelado_em',now(),'cancelamento_motivo',coalesce(nullif(trim(p_motivo),''),'Cancelamento da origem')),updated_at=now() where id=v_recebivel.id;
  update public.finance_recebivel_parcelas set valor_liquidado=0,status='cancelado',updated_at=now() where clinica_id=p_clinica_id and recebivel_id=v_recebivel.id;
  update public.finance_comissoes set status='estornada',updated_at=now() where clinica_id=p_clinica_id and recebivel_id=v_recebivel.id and status<>'paga';
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
    values(p_clinica_id,auth.uid(),'financeiro.recebivel_cancelado','finance_recebivel',v_recebivel.id::text,jsonb_build_object('origem_tipo',p_origem_tipo,'origem_id',p_origem_id,'estornos',v_estornos,'motivo',p_motivo));
  return jsonb_build_object('encontrado',true,'cancelado',true,'estornos',v_estornos,'idempotente',false);
end $$;

grant execute on function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_liquidar_recebivel(uuid,uuid,numeric,uuid,text,timestamptz,numeric,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb) to authenticated,service_role;
grant execute on function public.finance_estornar_liquidacao(uuid,uuid,text,text) to authenticated,service_role;
grant execute on function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb) to authenticated,service_role;
grant execute on function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date) to authenticated,service_role;
grant execute on function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text) to authenticated,service_role;
grant execute on function public.finance_resumo_clinica(uuid,date,date) to authenticated,service_role;
grant execute on function public.finance_gerar_recorrencias(date) to service_role;
grant execute on function public.finance_cancelar_recebivel_origem(uuid,text,text,text) to authenticated,service_role;

commit;
