begin;

create table if not exists public.finance_comissao_pagamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  profissional_id uuid not null,
  pagavel_id uuid,
  liquidacao_id uuid,
  conta_financeira_id uuid,
  competencia_inicio date not null,
  competencia_fim date not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'pago' check (status in ('pago','estornado')),
  idempotency_key text not null,
  pago_em timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (clinica_id,id),
  unique (clinica_id,idempotency_key),
  foreign key (clinica_id,profissional_id) references public.profissionais(clinica_id,id) on delete restrict,
  foreign key (clinica_id,pagavel_id) references public.finance_pagaveis(clinica_id,id) on delete set null,
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete set null,
  foreign key (clinica_id,conta_financeira_id) references public.finance_contas(clinica_id,id) on delete restrict
);

create table if not exists public.finance_comissao_pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  pagamento_id uuid not null,
  comissao_id uuid not null,
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  unique (pagamento_id,comissao_id),
  foreign key (clinica_id,pagamento_id) references public.finance_comissao_pagamentos(clinica_id,id) on delete cascade,
  foreign key (clinica_id,comissao_id) references public.finance_comissoes(clinica_id,id) on delete restrict
);

create index if not exists finance_comissao_pagamentos_periodo_idx
  on public.finance_comissao_pagamentos(clinica_id,profissional_id,competencia_inicio,competencia_fim);

alter table public.finance_comissao_pagamentos enable row level security;
alter table public.finance_comissao_pagamento_itens enable row level security;

drop policy if exists finance_select_finance_comissao_pagamentos on public.finance_comissao_pagamentos;
create policy finance_select_finance_comissao_pagamentos on public.finance_comissao_pagamentos
for select to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id));
drop policy if exists finance_insert_finance_comissao_pagamentos on public.finance_comissao_pagamentos;
create policy finance_insert_finance_comissao_pagamentos on public.finance_comissao_pagamentos
for insert to authenticated with check (app_private.finance_usuario_pode_gerir(clinica_id));
drop policy if exists finance_update_finance_comissao_pagamentos on public.finance_comissao_pagamentos;
create policy finance_update_finance_comissao_pagamentos on public.finance_comissao_pagamentos
for update to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id)) with check (app_private.finance_usuario_pode_gerir(clinica_id));

drop policy if exists finance_select_finance_comissao_pagamento_itens on public.finance_comissao_pagamento_itens;
create policy finance_select_finance_comissao_pagamento_itens on public.finance_comissao_pagamento_itens
for select to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id));
drop policy if exists finance_insert_finance_comissao_pagamento_itens on public.finance_comissao_pagamento_itens;
create policy finance_insert_finance_comissao_pagamento_itens on public.finance_comissao_pagamento_itens
for insert to authenticated with check (app_private.finance_usuario_pode_gerir(clinica_id));

grant select,insert,update on public.finance_comissao_pagamentos to authenticated;
grant select,insert on public.finance_comissao_pagamento_itens to authenticated;
grant all on public.finance_comissao_pagamentos,public.finance_comissao_pagamento_itens to service_role;

create or replace function public.finance_pagar_comissoes(
  p_clinica_id uuid,
  p_comissao_ids uuid[],
  p_conta_id uuid default null,
  p_forma_pagamento text default 'pix',
  p_data_pagamento timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare
  v_pagamento public.finance_comissao_pagamentos;
  v_profissional uuid;
  v_total numeric(14,2);
  v_inicio date;
  v_fim date;
  v_categoria uuid;
  v_centro uuid;
  v_conta uuid;
  v_pagavel public.finance_pagaveis;
  v_result jsonb;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then
    raise exception 'Acesso financeiro negado.' using errcode='42501';
  end if;
  if coalesce(array_length(p_comissao_ids,1),0)=0 then
    raise exception 'Selecione ao menos uma comissão.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Chave de idempotência obrigatória.' using errcode='22023';
  end if;

  select * into v_pagamento from public.finance_comissao_pagamentos
    where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('pagamento_id',v_pagamento.id,'idempotente',true); end if;

  perform 1 from public.finance_comissoes
    where clinica_id=p_clinica_id and id=any(p_comissao_ids) and status in ('provisionada','disponivel')
    for update;
  if (select count(*) from public.finance_comissoes where clinica_id=p_clinica_id and id=any(p_comissao_ids) and status in ('provisionada','disponivel'))
      <> array_length(p_comissao_ids,1) then
    raise exception 'Há comissões inválidas, já pagas ou pertencentes a outra clínica.' using errcode='22023';
  end if;
  if (select count(distinct profissional_id) from public.finance_comissoes where clinica_id=p_clinica_id and id=any(p_comissao_ids))<>1 then
    raise exception 'O lote deve conter comissões de um único profissional.' using errcode='22023';
  end if;

  select profissional_id,sum(valor),min(competencia),max(competencia)
    into v_profissional,v_total,v_inicio,v_fim
    from public.finance_comissoes where clinica_id=p_clinica_id and id=any(p_comissao_ids)
    group by profissional_id;
  select id into v_categoria from public.finance_categorias where clinica_id=p_clinica_id and codigo='CUSTO_COMISSOES' and ativa limit 1;
  select id into v_centro from public.finance_centros_custo where clinica_id=p_clinica_id and codigo='CLINICA' and ativo limit 1;
  v_conta:=p_conta_id;
  if v_conta is null then select id into v_conta from public.finance_contas where clinica_id=p_clinica_id and padrao and ativa limit 1; end if;
  if v_categoria is null or v_conta is null then raise exception 'Configure categoria de comissões e conta financeira padrão.' using errcode='23503'; end if;

  insert into public.finance_pagaveis(clinica_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,competencia,vencimento,created_by,metadata)
  values(p_clinica_id,v_categoria,v_centro,'Repasse de comissões profissionais','comissao_lote',p_idempotency_key,v_total,date_trunc('month',v_fim)::date,p_data_pagamento::date,auth.uid(),jsonb_build_object('profissional_id',v_profissional,'quantidade',array_length(p_comissao_ids,1)))
  returning * into v_pagavel;
  insert into public.finance_pagavel_parcelas(clinica_id,pagavel_id,numero,vencimento,valor)
    values(p_clinica_id,v_pagavel.id,1,p_data_pagamento::date,v_total);

  select public.finance_liquidar_pagavel(p_clinica_id,v_pagavel.id,v_total,v_conta,p_forma_pagamento,p_data_pagamento,p_idempotency_key||':liquidacao',jsonb_build_object('origem','comissoes')) into v_result;

  insert into public.finance_comissao_pagamentos(clinica_id,profissional_id,pagavel_id,liquidacao_id,conta_financeira_id,competencia_inicio,competencia_fim,valor,idempotency_key,pago_em,created_by)
  values(p_clinica_id,v_profissional,v_pagavel.id,(v_result->>'liquidacao_id')::uuid,v_conta,v_inicio,v_fim,v_total,p_idempotency_key,p_data_pagamento,auth.uid())
  returning * into v_pagamento;
  insert into public.finance_comissao_pagamento_itens(clinica_id,pagamento_id,comissao_id,valor)
    select p_clinica_id,v_pagamento.id,id,valor from public.finance_comissoes where clinica_id=p_clinica_id and id=any(p_comissao_ids);
  update public.finance_comissoes set status='paga',pagavel_id=v_pagavel.id,pago_em=p_data_pagamento,updated_at=now()
    where clinica_id=p_clinica_id and id=any(p_comissao_ids);

  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
    values(p_clinica_id,auth.uid(),'financeiro.comissoes_pagas','finance_comissao_pagamento',v_pagamento.id::text,jsonb_build_object('valor',v_total,'quantidade',array_length(p_comissao_ids,1),'profissional_id',v_profissional));
  return jsonb_build_object('pagamento_id',v_pagamento.id,'pagavel_id',v_pagavel.id,'liquidacao_id',v_result->>'liquidacao_id','valor',v_total,'idempotente',false);
end $$;

grant execute on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text) to authenticated,service_role;

create or replace view public.finance_recebiveis_aging with (security_invoker=true) as
select r.*,
  greatest(0,r.valor_total-r.valor_recebido) as saldo_aberto,
  case when r.status not in ('aberto','parcial') then 'encerrado'
       when r.vencimento is null or r.vencimento>=current_date then 'a_vencer'
       when current_date-r.vencimento between 1 and 30 then '1_30'
       when current_date-r.vencimento between 31 and 60 then '31_60'
       when current_date-r.vencimento between 61 and 90 then '61_90'
       else 'mais_90' end as faixa_atraso,
  case when r.vencimento<current_date and r.status in ('aberto','parcial') then current_date-r.vencimento else 0 end as dias_atraso
from public.finance_recebiveis r;

create or replace view public.finance_pagaveis_aging with (security_invoker=true) as
select p.*,
  greatest(0,p.valor_total-p.valor_pago) as saldo_aberto,
  case when p.status not in ('aberto','parcial') then 'encerrado'
       when p.vencimento is null or p.vencimento>=current_date then 'a_vencer'
       when current_date-p.vencimento between 1 and 30 then '1_30'
       when current_date-p.vencimento between 31 and 60 then '31_60'
       when current_date-p.vencimento between 61 and 90 then '61_90'
       else 'mais_90' end as faixa_atraso,
  case when p.vencimento<current_date and p.status in ('aberto','parcial') then current_date-p.vencimento else 0 end as dias_atraso
from public.finance_pagaveis p;

grant select on public.finance_recebiveis_aging,public.finance_pagaveis_aging to authenticated,service_role;

commit;
