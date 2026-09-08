begin;

-- Fix-forward para objetos cujo historico remoto estava marcado como aplicado,
-- mas cuja definicao fisica ainda divergia do fresh reset local.
alter table public.whatsapp_interaction_tokens
  drop constraint if exists whatsapp_interaction_tokens_action_check;
alter table public.whatsapp_interaction_tokens
  add constraint whatsapp_interaction_tokens_action_check
  check (action in ('confirm', 'reschedule', 'cancel', 'payment'));

create or replace function public.crm_ensure_default_pipeline(p_clinica_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_pipeline uuid;
begin
  perform app_private.crm_require_access(p_clinica_id);

  select id into v_pipeline
  from public.crm_pipelines
  where clinica_id = p_clinica_id and padrao and ativo
  order by created_at
  limit 1;

  if v_pipeline is null then
    insert into public.crm_pipelines(clinica_id, nome, padrao, ordem, created_by)
    values (p_clinica_id, 'Pipeline comercial', true, 0, auth.uid())
    returning id into v_pipeline;
  end if;

  insert into public.crm_pipeline_stages(
    clinica_id, pipeline_id, nome, slug, ordem, cor, probabilidade, tipo, semantic_key
  ) values
    (p_clinica_id, v_pipeline, 'Novo lead', 'novo-lead', 10, '#38bdf8', 10, 'open', 'new'),
    (p_clinica_id, v_pipeline, 'Contato iniciado', 'contato-iniciado', 20, '#818cf8', 20, 'open', 'contacted'),
    (p_clinica_id, v_pipeline, 'Qualificado', 'qualificado', 30, '#a78bfa', 40, 'open', 'qualified'),
    (p_clinica_id, v_pipeline, 'Avaliação agendada', 'avaliacao-agendada', 40, '#f59e0b', 60, 'open', 'evaluation_scheduled'),
    (p_clinica_id, v_pipeline, 'Em negociação', 'em-negociacao', 50, '#fb7185', 75, 'open', 'negotiation'),
    (p_clinica_id, v_pipeline, 'Ganho', 'ganho', 60, '#10b981', 100, 'won', 'won'),
    (p_clinica_id, v_pipeline, 'Perdido', 'perdido', 70, '#ef4444', 0, 'lost', 'lost')
  on conflict do nothing;

  insert into public.crm_lost_reasons(clinica_id, nome, ordem) values
    (p_clinica_id, 'Preço', 10),
    (p_clinica_id, 'Sem retorno', 20),
    (p_clinica_id, 'Escolheu concorrente', 30),
    (p_clinica_id, 'Sem interesse agora', 40),
    (p_clinica_id, 'Contraindicação', 50),
    (p_clinica_id, 'Outro', 60)
  on conflict (clinica_id, nome) do nothing;

  return v_pipeline;
end;
$$;

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

revoke all on function public.crm_ensure_default_pipeline(uuid) from public, anon;
grant execute on function public.crm_ensure_default_pipeline(uuid) to authenticated, service_role;
revoke all on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text) from public, anon;
grant execute on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
