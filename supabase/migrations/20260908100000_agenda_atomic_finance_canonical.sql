begin;

create or replace function app_private.finance_usuario_pode_gerir(p_clinica_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')='service_role' or exists (
    select 1 from public.usuarios_clinica uc where uc.clinica_id=p_clinica_id and uc.ativo
      and (uc.user_id=auth.uid() or lower(uc.email)=lower(coalesce(auth.jwt()->>'email','')))
      and (uc.papel in ('owner','admin','financeiro') or coalesce(uc.permissoes->'secoes','[]'::jsonb)?'financeiro')
  );
$$;

create or replace function app_private.finance_usuario_configura(p_clinica_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')='service_role' or exists (
    select 1 from public.usuarios_clinica uc where uc.clinica_id=p_clinica_id and uc.ativo and uc.papel in ('owner','admin')
      and (uc.user_id=auth.uid() or lower(uc.email)=lower(coalesce(auth.jwt()->>'email','')))
  );
$$;

create or replace function app_private.finance_ensure_clinic_defaults(p_clinica_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  insert into public.finance_configuracoes(clinica_id) values(p_clinica_id) on conflict(clinica_id) do nothing;
  if not exists(select 1 from public.finance_contas where clinica_id=p_clinica_id and padrao and ativa) then
    insert into public.finance_contas(clinica_id,nome,tipo,padrao) values(p_clinica_id,'Caixa principal','caixa',true);
  end if;
  insert into public.finance_centros_custo(clinica_id,nome,codigo) values(p_clinica_id,'Clínica','CLINICA') on conflict(clinica_id,codigo) do nothing;
  insert into public.finance_categorias(clinica_id,nome,tipo,grupo_dre,codigo,sistema)
  select p_clinica_id,v.nome,v.tipo,v.grupo,v.codigo,true from (values
    ('Receita de serviços','receita','receita_bruta','REC_SERVICOS'),('Receita de pacotes','receita','receita_bruta','REC_PACOTES'),
    ('Venda de produtos','receita','receita_bruta','REC_PRODUTOS'),('Taxas de meios de pagamento','deducao','deducoes','DED_TAXAS'),
    ('Comissões profissionais','custo_variavel','custos_variaveis','CUSTO_COMISSOES'),('Materiais e insumos','custo_variavel','custos_variaveis','CUSTO_INSUMOS'),
    ('Despesas administrativas','despesa','despesas_operacionais','DESP_ADMIN'),('Marketing','despesa','despesas_operacionais','DESP_MARKETING'),
    ('Aluguel e ocupação','despesa','despesas_operacionais','DESP_OCUPACAO'),('Outras receitas','outra_receita','outras_receitas','OUTRAS_RECEITAS'),
    ('Outras despesas','outra_despesa','outras_despesas','OUTRAS_DESPESAS'),('Transferências','transferencia','nao_dre','TRANSFERENCIAS')
  ) as v(nome,tipo,grupo,codigo) on conflict(clinica_id,codigo) do nothing;
end $$;

create or replace function app_private.finance_ensure_clinic_defaults_trigger()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$ begin perform app_private.finance_ensure_clinic_defaults(new.id); return new; end $$;

drop trigger if exists finance_ensure_clinic_defaults_after_insert on public.clinicas;
create trigger finance_ensure_clinic_defaults_after_insert after insert on public.clinicas
for each row execute function app_private.finance_ensure_clinic_defaults_trigger();

do $$ declare v_id uuid; begin
  for v_id in select id from public.clinicas loop perform app_private.finance_ensure_clinic_defaults(v_id); end loop;
end $$;

alter table public.agendamentos
  add column if not exists procedimento_ids uuid[] not null default '{}'::uuid[];

update public.agendamentos
set procedimento_ids = array[procedimento_id]
where procedimento_id is not null and cardinality(procedimento_ids) = 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.site_agendamentos_publicos'::regclass
      and conname='site_agendamentos_publicos_clinica_id_id_key'
  ) then
    alter table public.site_agendamentos_publicos
      add constraint site_agendamentos_publicos_clinica_id_id_key unique (clinica_id,id);
  end if;
end $$;

create table if not exists public.agenda_booking_operations (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  idempotency_key text not null,
  agendamento_id uuid,
  cliente_id uuid,
  public_booking_id uuid,
  created_at timestamptz not null default now(),
  unique (clinica_id, idempotency_key),
  foreign key (clinica_id, agendamento_id) references public.agendamentos(clinica_id, id) on delete cascade,
  foreign key (clinica_id, cliente_id) references public.clientes(clinica_id, id) on delete restrict,
  foreign key (clinica_id, public_booking_id) references public.site_agendamentos_publicos(clinica_id, id) on delete cascade
);

create table if not exists public.finance_package_sale_operations (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  idempotency_key text not null,
  cliente_pacote_id uuid,
  created_at timestamptz not null default now(),
  unique(clinica_id,idempotency_key),
  foreign key(clinica_id,cliente_pacote_id) references public.cliente_pacotes(clinica_id,id) on delete cascade
);
alter table public.finance_package_sale_operations enable row level security;
revoke all on public.finance_package_sale_operations from public,anon,authenticated;
grant all on public.finance_package_sale_operations to service_role;

alter table public.agenda_booking_operations enable row level security;
revoke all on public.agenda_booking_operations from public, anon, authenticated;
grant all on public.agenda_booking_operations to service_role;

create policy agenda_booking_operations_select on public.agenda_booking_operations
for select to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'agenda'));
grant select on public.agenda_booking_operations to authenticated;

create or replace function public.agenda_criar_agendamento_atomico_v2(
  p_clinica_id uuid,
  p_cliente_id uuid,
  p_profissional_id uuid,
  p_procedimento_ids uuid[],
  p_inicio timestamptz,
  p_fim timestamptz,
  p_valor numeric,
  p_observacoes text,
  p_idempotency_key text,
  p_public_booking jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_operation public.agenda_booking_operations;
  v_agendamento public.agendamentos;
  v_cliente_id uuid := p_cliente_id;
  v_public_id uuid;
  v_primary_procedure uuid;
  v_expected integer;
  v_signal numeric := coalesce((p_public_booking->>'valor_sinal')::numeric, 0);
begin
  if not (
    coalesce(current_setting('request.jwt.claim.role', true), auth.jwt()->>'role', '') = 'service_role'
    or app_private.usuario_pode_secao_clinica(p_clinica_id, 'agenda')
  ) then raise exception 'Acesso à agenda negado.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Chave de idempotência obrigatória.' using errcode='22023'; end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then raise exception 'Intervalo de agendamento inválido.' using errcode='22023'; end if;
  if coalesce(p_valor,0) < 0 then raise exception 'Valor de agendamento inválido.' using errcode='22023'; end if;

  insert into public.agenda_booking_operations(clinica_id,idempotency_key)
  values(p_clinica_id,p_idempotency_key)
  on conflict(clinica_id,idempotency_key) do nothing;
  select * into v_operation from public.agenda_booking_operations
   where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key for update;
  if v_operation.agendamento_id is not null then
    return jsonb_build_object('agendamento_id',v_operation.agendamento_id,'cliente_id',v_operation.cliente_id,'public_booking_id',v_operation.public_booking_id,'idempotente',true);
  end if;

  perform 1 from public.clinicas where id=p_clinica_id and status in ('trial','ativa');
  if not found then raise exception 'Clínica indisponível.' using errcode='23503'; end if;
  perform 1 from public.profissionais where clinica_id=p_clinica_id and id=p_profissional_id and ativo;
  if not found then raise exception 'Profissional inválido para a clínica.' using errcode='23503'; end if;
  v_expected := cardinality(coalesce(p_procedimento_ids,'{}'::uuid[]));
  if v_expected < 1 then raise exception 'Procedimento obrigatório.' using errcode='23503'; end if;
  select (array_agg(id order by id))[1], count(*) into v_primary_procedure, v_expected
    from public.procedimentos where clinica_id=p_clinica_id and id=any(p_procedimento_ids) and ativo;
  if v_expected <> cardinality(p_procedimento_ids) then raise exception 'Procedimento inválido para a clínica.' using errcode='23503'; end if;

  if v_cliente_id is null and p_public_booking is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':cliente:'||lower(coalesce(p_public_booking->>'email','')),0));
    select id into v_cliente_id from public.clientes
     where clinica_id=p_clinica_id and lower(email)=lower(p_public_booking->>'email') limit 1 for update;
    if v_cliente_id is null then
      insert into public.clientes(clinica_id,nome,telefone,email,cpf,origem,status,observacoes,consentimento_lgpd,data_consentimento_lgpd)
      values(p_clinica_id,p_public_booking->>'nome',nullif(p_public_booking->>'telefone',''),nullif(p_public_booking->>'email',''),nullif(p_public_booking->>'cpf',''),'Site','lead','Lead criado pelo site público.',true,now())
      returning id into v_cliente_id;
    end if;
  elsif v_cliente_id is not null then
    perform 1 from public.clientes where clinica_id=p_clinica_id and id=v_cliente_id;
    if not found then raise exception 'Cliente inválido para a clínica.' using errcode='23503'; end if;
  end if;

  insert into public.agendamentos(clinica_id,cliente_id,profissional_id,procedimento_id,procedimento_ids,inicio,fim,status,valor,pagamento_status,valor_pago,observacoes,created_by)
  values(p_clinica_id,v_cliente_id,p_profissional_id,v_primary_procedure,p_procedimento_ids,p_inicio,p_fim,'agendado',p_valor,case when v_signal>0 then 'parcial' else 'pendente' end,0,p_observacoes,auth.uid())
  returning * into v_agendamento;

  if p_public_booking is not null then
    insert into public.site_agendamentos_publicos(clinica_id,cliente_id,agendamento_id,procedimento_id,profissional_id,nome,telefone,email,data_hora,valor_total,valor_sinal,pagamento_status,pagamento_gateway,payload)
    values(p_clinica_id,v_cliente_id,v_agendamento.id,v_primary_procedure,p_profissional_id,p_public_booking->>'nome',p_public_booking->>'telefone',p_public_booking->>'email',p_inicio,p_valor,v_signal,case when v_signal>0 then 'pendente' else 'sem_sinal' end,nullif(p_public_booking->>'pagamento_gateway',''),coalesce(p_public_booking->'payload','{}'::jsonb))
    returning id into v_public_id;
  end if;

  if v_signal > 0 then
    perform public.finance_criar_recebivel_parcelado(p_clinica_id,'Atendimento agendado','agendamento',v_agendamento.id::text,p_valor,p_inicio::date,1,'REC_SERVICOS',v_cliente_id,jsonb_build_object('booking_atomic',true,'valor_sinal',v_signal));
    update public.finance_recebiveis
       set agendamento_id=v_agendamento.id,profissional_id=p_profissional_id,procedimento_id=v_primary_procedure,updated_at=now()
     where clinica_id=p_clinica_id and origem_tipo='agendamento' and origem_id=v_agendamento.id::text;
  end if;

  insert into public.domain_outbox_events(clinica_id,event_name,aggregate_type,aggregate_id,payload,idempotency_key)
  values(p_clinica_id,'booking.created','agendamento',v_agendamento.id,jsonb_build_object('source',case when p_public_booking is null then 'dashboard' else 'public_site' end,'public_booking_id',v_public_id),'booking.created:'||v_agendamento.id::text||':v1')
  on conflict(idempotency_key) do nothing;

  update public.agenda_booking_operations set agendamento_id=v_agendamento.id,cliente_id=v_cliente_id,public_booking_id=v_public_id where id=v_operation.id;
  return jsonb_build_object('agendamento_id',v_agendamento.id,'cliente_id',v_cliente_id,'public_booking_id',v_public_id,'idempotente',false);
end $$;

create or replace function public.finance_registrar_pagamento_pedido_v2(
  p_clinica_id uuid,p_pedido_id uuid,p_valor numeric,p_provider text,p_provider_reference text,
  p_pago_em timestamptz,p_forma text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_p public.pedidos_clinica; v_r public.finance_recebiveis; v_result jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')<>'service_role' then raise exception 'Operação exclusiva do serviço.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_provider_reference,'')),'') is null then raise exception 'Referência idempotente obrigatória.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':pedido:'||p_pedido_id::text,0));
  select * into v_p from public.pedidos_clinica where clinica_id=p_clinica_id and id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado na clínica.' using errcode='P0002'; end if;
  perform public.confirmar_pagamento_pedido_loja(v_p.id,case when p_provider='asaas' then p_provider_reference else null end,p_payload,coalesce(p_pago_em,now()));
  select * into v_r from public.finance_criar_recebivel(p_clinica_id,'Pedido '||v_p.id::text,'ecommerce',v_p.id::text,p_valor,coalesce(p_pago_em,now())::date,null,v_p.cliente_id,null,null,null,v_p.id,null,'REC_PRODUTOS','CLINICA',p_provider,p_provider_reference,p_payload||jsonb_build_object('canonical',true));
  if not exists(select 1 from public.finance_recebivel_parcelas where recebivel_id=v_r.id) and v_r.valor_total>0 then
    insert into public.finance_recebivel_parcelas(clinica_id,recebivel_id,numero,vencimento,valor) values(p_clinica_id,v_r.id,1,coalesce(p_pago_em,now())::date,v_r.valor_total);
  end if;
  if v_r.valor_recebido<v_r.valor_total then
    select public.finance_liquidar_recebivel(p_clinica_id,v_r.id,v_r.valor_total-v_r.valor_recebido,null,p_forma,coalesce(p_pago_em,now()),0,p_provider,p_provider_reference,'gateway:'||p_provider||':'||p_provider_reference,p_payload) into v_result;
  end if;
  insert into public.pagamentos_loja_clinica(clinica_id,cliente_id,pedido_id,valor,forma,status,provedor,provedor_pagamento_id,pago_em,payload,observacoes)
  values(p_clinica_id,v_p.cliente_id,v_p.id,p_valor,coalesce(nullif(p_forma,''),'link'),'pago',p_provider,p_provider_reference,coalesce(p_pago_em,now()),p_payload,'Espelho do Financeiro 2.0')
  on conflict(clinica_id,provedor,provedor_pagamento_id) do update set valor=excluded.valor,forma=excluded.forma,status='pago',pago_em=excluded.pago_em,payload=excluded.payload,observacoes=excluded.observacoes;
  return jsonb_build_object('recebivel_id',v_r.id,'liquidacao_id',v_result->>'liquidacao_id','pedido_id',v_p.id);
end $$;

create or replace function public.finance_cancelar_pagamento_pedido_v2(p_clinica_id uuid,p_pedido_id uuid,p_motivo text,p_estorno boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_p public.pedidos_clinica; v_result jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')<>'service_role' then raise exception 'Operação exclusiva do serviço.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':pedido:'||p_pedido_id::text,0));
  select * into v_p from public.pedidos_clinica where clinica_id=p_clinica_id and id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado na clínica.' using errcode='P0002'; end if;
  if p_estorno and v_p.pagamento_status='pago' then perform public.estornar_pedido_loja(v_p.id,p_motivo);
  elsif v_p.pagamento_status<>'pago' then perform public.cancelar_pedido_loja(v_p.id,p_motivo); end if;
  select public.finance_cancelar_recebivel_origem(p_clinica_id,'ecommerce',v_p.id::text,p_motivo) into v_result;
  update public.pagamentos_loja_clinica set status=case when p_estorno then 'estornado' else 'cancelado' end,observacoes='Espelho do Financeiro 2.0: '||coalesce(p_motivo,'Cancelamento') where clinica_id=p_clinica_id and pedido_id=v_p.id;
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('pedido_id',v_p.id);
end $$;

create or replace function public.finance_vender_pacote_v2(
  p_clinica_id uuid,p_cliente_id uuid,p_pacote_id uuid,p_data_compra date,p_validade_em date,
  p_valor_pago numeric,p_forma text,p_observacoes text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_op public.finance_package_sale_operations; v_p public.pacotes_clinica; v_cp uuid; v_r public.finance_recebiveis; v_status text;
begin
  if not app_private.finance_usuario_pode_gerir(p_clinica_id) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Chave de idempotência obrigatória.' using errcode='22023'; end if;
  insert into public.finance_package_sale_operations(clinica_id,idempotency_key) values(p_clinica_id,p_idempotency_key) on conflict do nothing;
  select * into v_op from public.finance_package_sale_operations where clinica_id=p_clinica_id and idempotency_key=p_idempotency_key for update;
  if v_op.cliente_pacote_id is not null then return v_op.cliente_pacote_id; end if;
  perform 1 from public.clientes where clinica_id=p_clinica_id and id=p_cliente_id;
  if not found then raise exception 'Cliente inválido para a clínica.' using errcode='23503'; end if;
  select * into v_p from public.pacotes_clinica where clinica_id=p_clinica_id and id=p_pacote_id and ativo for update;
  if not found then raise exception 'Pacote inválido para a clínica.' using errcode='23503'; end if;
  if coalesce(p_valor_pago,0)<0 or p_valor_pago>v_p.valor then raise exception 'Valor pago inválido.' using errcode='22023'; end if;
  insert into public.cliente_pacotes(clinica_id,cliente_id,pacote_id,nome_pacote,sessoes_total,valor_total,data_compra,validade_em,observacoes)
  values(p_clinica_id,p_cliente_id,v_p.id,v_p.nome,v_p.quantidade_sessoes,v_p.valor,coalesce(p_data_compra,current_date),coalesce(p_validade_em,coalesce(p_data_compra,current_date)+v_p.validade_dias),p_observacoes) returning id into v_cp;
  select * into v_r from public.finance_criar_recebivel(p_clinica_id,'Venda de pacote: '||v_p.nome,'cliente_pacote',v_cp::text,v_p.valor,coalesce(p_data_compra,current_date),null,p_cliente_id,null,null,null,null,v_cp,'REC_PACOTES','CLINICA','manual','pacote:'||v_cp::text,jsonb_build_object('observacoes',p_observacoes,'canonical',true));
  insert into public.finance_recebivel_parcelas(clinica_id,recebivel_id,numero,vencimento,valor) values(p_clinica_id,v_r.id,1,coalesce(p_data_compra,current_date),v_r.valor_total);
  if p_valor_pago>0 then perform public.finance_liquidar_recebivel(p_clinica_id,v_r.id,p_valor_pago,null,p_forma,now(),0,'manual','pacote:'||v_cp::text,'pacote:'||v_cp::text,jsonb_build_object('source','dashboard')); end if;
  v_status:=case when p_valor_pago>=v_p.valor then 'pago' when p_valor_pago>0 then 'parcial' else 'pendente' end;
  insert into public.pagamentos_clinica(clinica_id,cliente_id,descricao,valor,valor_pago,status,forma_pagamento,data_pagamento,observacoes)
  values(p_clinica_id,p_cliente_id,'Venda de pacote: '||v_p.nome,v_p.valor,p_valor_pago,v_status,p_forma,case when p_valor_pago>0 then now() end,'Espelho do Financeiro 2.0; cliente_pacote_id:'||v_cp::text);
  update public.finance_package_sale_operations set cliente_pacote_id=v_cp where id=v_op.id;
  return v_cp;
end $$;

create or replace function public.finance_registrar_pagamento_agendamento_v2(
  p_clinica_id uuid,p_agendamento_id uuid,p_valor_total numeric,p_valor_pago numeric,
  p_descricao text,p_provider text,p_provider_reference text,p_pago_em timestamptz,
  p_forma_pagamento text,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_a public.agendamentos; v_r public.finance_recebiveis; v_result jsonb; v_legacy uuid; v_status text;
begin
  if not (coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')='service_role' or app_private.finance_usuario_pode_gerir(p_clinica_id)) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_provider_reference,'')),'') is null then raise exception 'Referência idempotente obrigatória.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':'||p_agendamento_id::text,0));
  select * into v_a from public.agendamentos where clinica_id=p_clinica_id and id=p_agendamento_id for update;
  if not found then raise exception 'Agendamento não encontrado na clínica.' using errcode='P0002'; end if;
  select * into v_r from public.finance_criar_recebivel(p_clinica_id,coalesce(nullif(p_descricao,''),'Atendimento'),'agendamento',p_agendamento_id::text,p_valor_total,coalesce(p_pago_em,now())::date,null,v_a.cliente_id,v_a.profissional_id,v_a.procedimento_id,v_a.id,null,null,'REC_SERVICOS','CLINICA',p_provider,p_provider_reference,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('canonical',true));
  update public.finance_recebiveis
     set cliente_id=v_a.cliente_id,profissional_id=v_a.profissional_id,procedimento_id=v_a.procedimento_id,agendamento_id=v_a.id,updated_at=now()
   where id=v_r.id;
  select * into v_r from public.finance_recebiveis where id=v_r.id;
  if not exists(select 1 from public.finance_recebivel_parcelas where clinica_id=p_clinica_id and recebivel_id=v_r.id) and v_r.valor_total>0 then
    insert into public.finance_recebivel_parcelas(clinica_id,recebivel_id,numero,vencimento,valor) values(p_clinica_id,v_r.id,1,coalesce(p_pago_em,now())::date,v_r.valor_total);
  end if;
  if coalesce(p_valor_pago,0)>0 and greatest(0,v_r.valor_total-v_r.valor_recebido)>0 then
    select public.finance_liquidar_recebivel(p_clinica_id,v_r.id,least(p_valor_pago,greatest(0,v_r.valor_total-v_r.valor_recebido)),null,p_forma_pagamento,coalesce(p_pago_em,now()),0,p_provider,p_provider_reference,'gateway:'||p_provider||':'||p_provider_reference,p_metadata) into v_result
    where not exists(select 1 from public.finance_liquidacoes where clinica_id=p_clinica_id and idempotency_key='gateway:'||p_provider||':'||p_provider_reference);
  end if;
  select * into v_r from public.finance_recebiveis where id=v_r.id;
  v_status:=case when v_r.status='pago' then 'pago' when v_r.valor_recebido>0 then 'parcial' else 'pendente' end;
  select id into v_legacy from public.pagamentos_clinica where clinica_id=p_clinica_id and agendamento_id=p_agendamento_id order by created_at limit 1 for update;
  if v_legacy is null then
    insert into public.pagamentos_clinica(clinica_id,cliente_id,agendamento_id,profissional_id,descricao,valor,valor_pago,status,forma_pagamento,data_pagamento,observacoes)
    values(p_clinica_id,v_a.cliente_id,v_a.id,v_a.profissional_id,p_descricao,v_r.valor_total,v_r.valor_recebido,v_status,p_forma_pagamento,p_pago_em,'Espelho do Financeiro 2.0') returning id into v_legacy;
  else
    update public.pagamentos_clinica set valor=v_r.valor_total,valor_pago=v_r.valor_recebido,status=v_status,forma_pagamento=p_forma_pagamento,data_pagamento=p_pago_em,observacoes='Espelho do Financeiro 2.0' where id=v_legacy;
  end if;
  update public.agendamentos set valor=v_r.valor_total,valor_pago=v_r.valor_recebido,pagamento_status=v_status,forma_pagamento=p_forma_pagamento,data_pagamento=p_pago_em,status=case when v_r.valor_recebido>0 and status='agendado' then 'confirmado' else status end where id=v_a.id;
  update public.site_agendamentos_publicos set pagamento_status=case when v_r.valor_recebido>=valor_sinal and valor_sinal>0 then 'pago' else pagamento_status end where clinica_id=p_clinica_id and agendamento_id=v_a.id;
  return jsonb_build_object('recebivel_id',v_r.id,'liquidacao_id',v_result->>'liquidacao_id','status',v_status,'valor_recebido',v_r.valor_recebido,'idempotente',coalesce((v_result->>'idempotente')::boolean,true));
end $$;

create or replace function public.finance_definir_pagamento_agendamento_v2(
  p_clinica_id uuid,p_agendamento_id uuid,p_valor_total numeric,p_valor_pago_acumulado numeric,
  p_descricao text,p_pago_em timestamptz,p_forma_pagamento text,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_atual numeric:=0; v_delta numeric; v_result jsonb;
begin
  if not (coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')='service_role' or app_private.finance_usuario_pode_gerir(p_clinica_id)) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  if coalesce(p_valor_pago_acumulado,0)<0 or coalesce(p_valor_pago_acumulado,0)>coalesce(p_valor_total,0) then raise exception 'Valor pago acumulado inválido.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':'||p_agendamento_id::text,0));
  select coalesce(valor_recebido,0) into v_atual from public.finance_recebiveis
   where clinica_id=p_clinica_id and origem_tipo='agendamento' and origem_id=p_agendamento_id::text for update;
  if not found then v_atual:=0; end if;
  if p_valor_pago_acumulado<v_atual then raise exception 'Redução do valor recebido exige estorno explícito.' using errcode='22023'; end if;
  v_delta:=p_valor_pago_acumulado-v_atual;
  select public.finance_registrar_pagamento_agendamento_v2(
    p_clinica_id,p_agendamento_id,p_valor_total,v_delta,p_descricao,'manual',
    'dashboard:'||p_agendamento_id::text||':'||p_valor_pago_acumulado::text,
    p_pago_em,p_forma_pagamento,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('cumulative_target',p_valor_pago_acumulado)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.finance_cancelar_pagamento_agendamento_v2(
  p_clinica_id uuid,p_agendamento_id uuid,p_motivo text default 'Cancelamento do pagamento'
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_a public.agendamentos; v_result jsonb;
begin
  if not (coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','')='service_role' or app_private.finance_usuario_pode_gerir(p_clinica_id)) then raise exception 'Acesso financeiro negado.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text||':'||p_agendamento_id::text,0));
  select * into v_a from public.agendamentos where clinica_id=p_clinica_id and id=p_agendamento_id for update;
  if not found then raise exception 'Agendamento não encontrado na clínica.' using errcode='P0002'; end if;
  select public.finance_cancelar_recebivel_origem(p_clinica_id,'agendamento',p_agendamento_id::text,p_motivo) into v_result;
  update public.pagamentos_clinica set valor_pago=0,status='cancelado',data_pagamento=null,observacoes='Espelho do Financeiro 2.0: '||coalesce(p_motivo,'Cancelamento')
   where clinica_id=p_clinica_id and agendamento_id=p_agendamento_id;
  update public.agendamentos set valor_pago=0,pagamento_status='cancelado',data_pagamento=null where id=p_agendamento_id;
  update public.site_agendamentos_publicos set pagamento_status='cancelado' where clinica_id=p_clinica_id and agendamento_id=p_agendamento_id;
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('agendamento_id',p_agendamento_id);
end $$;

create or replace view public.finance_reconciliacao_legado_v2
with (security_invoker=true) as
with canonico as (
  select clinica_id,id recebivel_id,agendamento_id,valor_total,valor_recebido,status
  from public.finance_recebiveis where origem_tipo='agendamento'
), legado as (
  select clinica_id,agendamento_id,min(id::text)::uuid pagamento_legado_id,count(*) legado_quantidade,
         max(valor) valor,max(valor_pago) valor_pago,max(status) status
  from public.pagamentos_clinica where agendamento_id is not null group by clinica_id,agendamento_id
)
select coalesce(c.clinica_id,l.clinica_id) clinica_id,c.recebivel_id,coalesce(c.agendamento_id,l.agendamento_id) agendamento_id,
       c.valor_total valor_canonico,c.valor_recebido recebido_canonico,c.status status_canonico,
       l.pagamento_legado_id,l.legado_quantidade,l.valor valor_legado,l.valor_pago recebido_legado,l.status status_legado,
       case when c.recebivel_id is null then 'canonico_ausente'
            when l.pagamento_legado_id is null then 'legado_ausente'
            when l.legado_quantidade>1 then 'legado_duplicado'
            when c.valor_total<>l.valor or c.valor_recebido<>l.valor_pago
              or (case c.status when 'aberto' then 'pendente' else c.status end)<>l.status then 'divergente'
            else 'ok' end diagnostico
from canonico c full join legado l on l.clinica_id=c.clinica_id and l.agendamento_id=c.agendamento_id;

revoke all on function public.agenda_criar_agendamento_atomico_v2(uuid,uuid,uuid,uuid[],timestamptz,timestamptz,numeric,text,text,jsonb) from public,anon;
grant execute on function public.agenda_criar_agendamento_atomico_v2(uuid,uuid,uuid,uuid[],timestamptz,timestamptz,numeric,text,text,jsonb) to authenticated,service_role;
revoke all on function public.finance_registrar_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,text,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.finance_registrar_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,text,text,timestamptz,text,jsonb) to authenticated,service_role;
revoke all on function public.finance_definir_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.finance_definir_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,timestamptz,text,jsonb) to authenticated,service_role;
revoke all on function public.finance_cancelar_pagamento_agendamento_v2(uuid,uuid,text) from public,anon;
grant execute on function public.finance_cancelar_pagamento_agendamento_v2(uuid,uuid,text) to authenticated,service_role;
revoke all on function public.finance_registrar_pagamento_pedido_v2(uuid,uuid,numeric,text,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_registrar_pagamento_pedido_v2(uuid,uuid,numeric,text,text,timestamptz,text,jsonb) to service_role;
revoke all on function public.finance_cancelar_pagamento_pedido_v2(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_cancelar_pagamento_pedido_v2(uuid,uuid,text,boolean) to service_role;
revoke all on function public.finance_vender_pacote_v2(uuid,uuid,uuid,date,date,numeric,text,text,text) from public,anon;
grant execute on function public.finance_vender_pacote_v2(uuid,uuid,uuid,date,date,numeric,text,text,text) to authenticated,service_role;
revoke all on public.finance_reconciliacao_legado_v2 from public,anon;
grant select on public.finance_reconciliacao_legado_v2 to authenticated,service_role;

notify pgrst,'reload schema';
commit;
