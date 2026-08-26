begin;

alter table public.domain_outbox_events add column if not exists consumer text not null default 'whatsapp';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='domain_outbox_events_consumer_check') then
    alter table public.domain_outbox_events add constraint domain_outbox_events_consumer_check check (consumer in ('whatsapp','automation','integration'));
  end if;
end $$;
create index if not exists domain_outbox_consumer_claim_idx on public.domain_outbox_events(consumer,status,available_at,occurred_at);

create or replace function public.claim_domain_outbox_events(p_worker text, p_limit integer default 25)
returns setof public.domain_outbox_events language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select id from public.domain_outbox_events
    where consumer='whatsapp' and status in ('pending','retry') and available_at<=now()
      and (locked_at is null or locked_at<now()-interval '10 minutes')
    order by occurred_at asc for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.domain_outbox_events e
  set status='processing',locked_at=now(),locked_by=left(p_worker,120),attempts=e.attempts+1
  from candidates c where e.id=c.id returning e.*;
end $$;

create or replace function public.claim_domain_outbox_events_for_consumer(p_consumer text,p_worker text,p_limit integer default 25)
returns setof public.domain_outbox_events language plpgsql security definer set search_path=public as $$
begin
  if p_consumer not in ('automation','integration') then raise exception 'Consumidor inválido.' using errcode='22023'; end if;
  return query with candidates as (
    select id from public.domain_outbox_events
    where consumer=p_consumer and status in ('pending','retry') and available_at<=now()
      and (locked_at is null or locked_at<now()-interval '10 minutes')
    order by occurred_at asc for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.domain_outbox_events e
  set status='processing',locked_at=now(),locked_by=left(p_worker,120),attempts=e.attempts+1
  from candidates c where e.id=c.id returning e.*;
end $$;

create or replace function app_private.crm_require_access(p_clinica_id uuid)
returns void language plpgsql security definer stable set search_path=public,app_private as $$
begin
  if auth.uid() is not null and not app_private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso ao CRM negado.' using errcode='42501';
  end if;
end $$;

create or replace function app_private.crm_emit_event(
  p_clinica_id uuid,p_opportunity_id uuid,p_event_type text,p_data jsonb default '{}'::jsonb,p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_id uuid; v_key text;
begin
  insert into public.crm_opportunity_events(clinica_id,opportunity_id,event_type,actor_id,data)
    values(p_clinica_id,p_opportunity_id,p_event_type,auth.uid(),coalesce(p_data,'{}'::jsonb)) returning id into v_id;
  v_key:=coalesce(nullif(p_idempotency_key,''),'crm:'||p_event_type||':'||p_opportunity_id||':'||v_id);
  insert into public.domain_outbox_events(clinica_id,event_name,aggregate_type,aggregate_id,payload,idempotency_key,consumer,occurred_at)
    values(p_clinica_id,'crm.'||replace(p_event_type,'_','.'),'crm_opportunity',p_opportunity_id,coalesce(p_data,'{}'::jsonb),v_key,'automation',now())
    on conflict (idempotency_key) do nothing;
  insert into public.eventos_analiticos(clinica_id,actor_id,event_name,idempotency_key,metadata)
    values(p_clinica_id,auth.uid(),'crm_'||replace(p_event_type,'.','_'),v_key,coalesce(p_data,'{}'::jsonb))
    on conflict (clinica_id,idempotency_key) where idempotency_key is not null do nothing;
  return v_id;
end $$;

create or replace function public.crm_ensure_default_pipeline(p_clinica_id uuid)
returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_pipeline uuid;
begin
  perform app_private.crm_require_access(p_clinica_id);
  select id into v_pipeline from public.crm_pipelines where clinica_id=p_clinica_id and padrao and ativo order by created_at limit 1;
  if v_pipeline is null then
    insert into public.crm_pipelines(clinica_id,nome,padrao,ordem,created_by) values(p_clinica_id,'Pipeline comercial',true,0,auth.uid()) returning id into v_pipeline;
  end if;
  insert into public.crm_pipeline_stages(clinica_id,pipeline_id,nome,slug,ordem,cor,probabilidade,tipo,semantic_key)
  values
    (p_clinica_id,v_pipeline,'Novo lead','novo-lead',10,'#38bdf8',10,'open','new'),
    (p_clinica_id,v_pipeline,'Contato iniciado','contato-iniciado',20,'#818cf8',20,'open','contacted'),
    (p_clinica_id,v_pipeline,'Qualificado','qualificado',30,'#a78bfa',40,'open','qualified'),
    (p_clinica_id,v_pipeline,'Avaliação agendada','avaliacao-agendada',40,'#f59e0b',60,'open','evaluation_scheduled'),
    (p_clinica_id,v_pipeline,'Em negociação','em-negociacao',50,'#fb7185',75,'open','negotiation'),
    (p_clinica_id,v_pipeline,'Ganho','ganho',60,'#10b981',100,'won','won'),
    (p_clinica_id,v_pipeline,'Perdido','perdido',70,'#ef4444',0,'lost','lost')
  on conflict (pipeline_id,slug) do nothing;
  insert into public.crm_lost_reasons(clinica_id,nome,ordem) values
    (p_clinica_id,'Preço',10),(p_clinica_id,'Sem retorno',20),(p_clinica_id,'Escolheu concorrente',30),
    (p_clinica_id,'Sem interesse agora',40),(p_clinica_id,'Contraindicação',50),(p_clinica_id,'Outro',60)
  on conflict (clinica_id,nome) do nothing;
  return v_pipeline;
end $$;

create or replace function public.crm_create_opportunity(
  p_clinica_id uuid,p_cliente_id uuid,p_nome text,p_titulo text,p_telefone text,p_email text,p_origem text,
  p_valor numeric default 0,p_pipeline_id uuid default null,p_stage_id uuid default null,p_procedimento_id uuid default null,
  p_responsavel_id uuid default null,p_temperatura text default 'morno',p_score integer default 50,p_observacoes text default null,
  p_attribution jsonb default '{}'::jsonb,p_identificador_externo text default null
) returns public.crm_oportunidades language plpgsql security definer set search_path=public,app_private as $$
declare v_pipeline uuid; v_stage uuid; v_result public.crm_oportunidades; v_rank numeric;
begin
  perform app_private.crm_require_access(p_clinica_id);
  if nullif(trim(coalesce(p_nome,'')),'') is null then raise exception 'Informe o nome do contato.' using errcode='22023'; end if;
  v_pipeline:=coalesce(p_pipeline_id,public.crm_ensure_default_pipeline(p_clinica_id));
  if p_stage_id is null then select id into v_stage from public.crm_pipeline_stages where clinica_id=p_clinica_id and pipeline_id=v_pipeline and semantic_key='new' and ativo limit 1;
  else v_stage:=p_stage_id; end if;
  perform 1 from public.crm_pipeline_stages where clinica_id=p_clinica_id and pipeline_id=v_pipeline and id=v_stage and ativo;
  if not found then raise exception 'Etapa inválida para este pipeline.' using errcode='23503'; end if;
  select coalesce(max(sort_order),0)+1000 into v_rank from public.crm_oportunidades where clinica_id=p_clinica_id and pipeline_id=v_pipeline and stage_id=v_stage;
  insert into public.crm_oportunidades(clinica_id,cliente_id,nome,titulo,telefone,email,origem,status,valor_estimado,pipeline_id,stage_id,
    procedimento_id,responsavel_id,temperatura,score,sort_order,observacoes,source,medium,campaign,content,term,referrer,landing_page,utm,identificador_externo,created_by)
  values(p_clinica_id,p_cliente_id,trim(p_nome),coalesce(nullif(trim(p_titulo),''),'Nova oportunidade'),p_telefone,p_email,coalesce(nullif(p_origem,''),'outro'),'lead',greatest(coalesce(p_valor,0),0),v_pipeline,v_stage,
    p_procedimento_id,p_responsavel_id,coalesce(p_temperatura,'morno'),greatest(0,least(coalesce(p_score,50),100)),v_rank,p_observacoes,
    p_attribution->>'source',p_attribution->>'medium',p_attribution->>'campaign',p_attribution->>'content',p_attribution->>'term',p_attribution->>'referrer',p_attribution->>'landing_page',coalesce(p_attribution,'{}'::jsonb),p_identificador_externo,auth.uid()) returning * into v_result;
  perform app_private.crm_emit_event(p_clinica_id,v_result.id,'opportunity_created',jsonb_build_object('stage_id',v_stage,'pipeline_id',v_pipeline,'source',v_result.source),'crm:create:'||v_result.id);
  return v_result;
end $$;

create or replace function public.crm_move_opportunity(
  p_clinica_id uuid,p_opportunity_id uuid,p_stage_id uuid,p_before_id uuid default null,p_after_id uuid default null,
  p_lost_reason_id uuid default null,p_closed_value numeric default null
) returns public.crm_oportunidades language plpgsql security definer set search_path=public,app_private as $$
declare v_opp public.crm_oportunidades; v_stage public.crm_pipeline_stages; v_old_stage uuid; v_before numeric; v_after numeric; v_rank numeric; v_status text;
begin
  perform app_private.crm_require_access(p_clinica_id);
  select * into v_opp from public.crm_oportunidades where clinica_id=p_clinica_id and id=p_opportunity_id for update;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode='P0002'; end if;
  select * into v_stage from public.crm_pipeline_stages where clinica_id=p_clinica_id and pipeline_id=v_opp.pipeline_id and id=p_stage_id and ativo;
  if not found then raise exception 'Etapa de destino inválida.' using errcode='23503'; end if;
  if v_stage.tipo='lost' and p_lost_reason_id is null then raise exception 'Informe o motivo da perda.' using errcode='22023'; end if;
  if p_lost_reason_id is not null and not exists(select 1 from public.crm_lost_reasons where clinica_id=p_clinica_id and id=p_lost_reason_id and ativo) then raise exception 'Motivo da perda inválido.' using errcode='23503'; end if;
  if p_before_id is not null then select sort_order into v_before from public.crm_oportunidades where clinica_id=p_clinica_id and stage_id=p_stage_id and id=p_before_id; end if;
  if p_after_id is not null then select sort_order into v_after from public.crm_oportunidades where clinica_id=p_clinica_id and stage_id=p_stage_id and id=p_after_id; end if;
  v_rank:=case when v_before is not null and v_after is not null then (v_before+v_after)/2 when v_before is not null then v_before-1000 when v_after is not null then v_after+1000 else coalesce((select max(sort_order)+1000 from public.crm_oportunidades where clinica_id=p_clinica_id and stage_id=p_stage_id),1000) end;
  v_old_stage:=v_opp.stage_id;
  v_status:=case v_stage.tipo when 'won' then 'convertido' when 'lost' then 'perdido' else case v_stage.semantic_key when 'evaluation_scheduled' then 'avaliacao_marcada' when 'negotiation' then 'em_negociacao' else 'lead' end end;
  update public.crm_oportunidades set stage_id=p_stage_id,sort_order=v_rank,status=v_status,
    perdido_motivo=case when v_stage.tipo='lost' then (select nome from public.crm_lost_reasons where id=p_lost_reason_id) else null end,
    lost_reason_id=case when v_stage.tipo='lost' then p_lost_reason_id else null end,lost_at=case when v_stage.tipo='lost' then now() else null end,
    won_at=case when v_stage.tipo='won' then now() else null end,convertido_em=case when v_stage.tipo='won' then now() else null end,
    valor_fechado=case when v_stage.tipo='won' then coalesce(p_closed_value,valor_estimado) else null end,
    first_response_at=case when v_stage.semantic_key in ('contacted','qualified','evaluation_scheduled','negotiation') then coalesce(first_response_at,now()) else first_response_at end,
    updated_at=now() where id=p_opportunity_id returning * into v_opp;
  perform app_private.crm_emit_event(p_clinica_id,p_opportunity_id,case when v_stage.tipo='won' then 'opportunity_won' when v_stage.tipo='lost' then 'opportunity_lost' else 'stage_changed' end,
    jsonb_build_object('from_stage_id',v_old_stage,'to_stage_id',p_stage_id,'lost_reason_id',p_lost_reason_id,'closed_value',v_opp.valor_fechado));
  return v_opp;
end $$;

create or replace function public.crm_save_opportunity(
  p_clinica_id uuid,p_opportunity_id uuid,p_titulo text,p_valor numeric,p_responsavel_id uuid,p_temperatura text,p_score integer,
  p_observacoes text,p_procedimento_id uuid default null
) returns public.crm_oportunidades language plpgsql security definer set search_path=public,app_private as $$
declare v_before public.crm_oportunidades; v_after public.crm_oportunidades;
begin
  perform app_private.crm_require_access(p_clinica_id);
  select * into v_before from public.crm_oportunidades where clinica_id=p_clinica_id and id=p_opportunity_id for update;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode='P0002'; end if;
  update public.crm_oportunidades set titulo=coalesce(nullif(trim(p_titulo),''),titulo),valor_estimado=greatest(coalesce(p_valor,0),0),
    responsavel_id=p_responsavel_id,temperatura=coalesce(p_temperatura,'morno'),score=greatest(0,least(coalesce(p_score,50),100)),
    observacoes=p_observacoes,procedimento_id=p_procedimento_id,updated_at=now()
    where id=p_opportunity_id returning * into v_after;
  perform app_private.crm_emit_event(p_clinica_id,p_opportunity_id,'opportunity_updated',jsonb_build_object('before',jsonb_build_object('valor',v_before.valor_estimado,'responsavel_id',v_before.responsavel_id,'temperatura',v_before.temperatura),'after',jsonb_build_object('valor',v_after.valor_estimado,'responsavel_id',v_after.responsavel_id,'temperatura',v_after.temperatura)));
  return v_after;
end $$;

create or replace function public.crm_create_activity(
  p_clinica_id uuid,p_opportunity_id uuid,p_tipo text,p_titulo text,p_descricao text default null,p_due_at timestamptz default null,p_owner_id uuid default null
) returns public.crm_activities language plpgsql security definer set search_path=public,app_private as $$
declare v_activity public.crm_activities; v_cliente uuid;
begin
  perform app_private.crm_require_access(p_clinica_id);
  select cliente_id into v_cliente from public.crm_oportunidades where clinica_id=p_clinica_id and id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode='P0002'; end if;
  insert into public.crm_activities(clinica_id,opportunity_id,cliente_id,owner_id,tipo,titulo,descricao,due_at,created_by)
    values(p_clinica_id,p_opportunity_id,v_cliente,p_owner_id,p_tipo,p_titulo,p_descricao,p_due_at,auth.uid()) returning * into v_activity;
  update public.crm_oportunidades set last_activity_at=now(),next_activity_at=(select min(due_at) from public.crm_activities where clinica_id=p_clinica_id and opportunity_id=p_opportunity_id and status='pending' and due_at is not null) where id=p_opportunity_id;
  perform app_private.crm_emit_event(p_clinica_id,p_opportunity_id,'activity_created',jsonb_build_object('activity_id',v_activity.id,'type',p_tipo,'due_at',p_due_at));
  return v_activity;
end $$;

create or replace function public.crm_complete_activity(p_clinica_id uuid,p_activity_id uuid)
returns public.crm_activities language plpgsql security definer set search_path=public,app_private as $$
declare v_activity public.crm_activities;
begin
  perform app_private.crm_require_access(p_clinica_id);
  update public.crm_activities set status='completed',completed_at=now(),updated_at=now()
    where clinica_id=p_clinica_id and id=p_activity_id and status='pending' returning * into v_activity;
  if not found then raise exception 'Atividade pendente não encontrada.' using errcode='P0002'; end if;
  update public.crm_oportunidades set last_activity_at=now(),next_activity_at=(select min(due_at) from public.crm_activities where clinica_id=p_clinica_id and opportunity_id=v_activity.opportunity_id and status='pending' and due_at is not null) where id=v_activity.opportunity_id;
  perform app_private.crm_emit_event(p_clinica_id,v_activity.opportunity_id,'activity_completed',jsonb_build_object('activity_id',v_activity.id,'type',v_activity.tipo));
  return v_activity;
end $$;

create or replace function public.crm_reorder_stages(p_clinica_id uuid,p_pipeline_id uuid,p_stage_ids uuid[])
returns void language plpgsql security definer set search_path=public,app_private as $$
declare v_id uuid; v_order integer:=0;
begin
  perform app_private.crm_require_access(p_clinica_id);
  if (select count(*) from public.crm_pipeline_stages where clinica_id=p_clinica_id and pipeline_id=p_pipeline_id and id=any(p_stage_ids))<>array_length(p_stage_ids,1) then raise exception 'Lista de etapas inválida.' using errcode='23503'; end if;
  foreach v_id in array p_stage_ids loop v_order:=v_order+10; update public.crm_pipeline_stages set ordem=v_order where clinica_id=p_clinica_id and pipeline_id=p_pipeline_id and id=v_id; end loop;
end $$;

create or replace function public.crm_pipeline_metrics(p_clinica_id uuid,p_pipeline_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public,app_private as $$
declare v_result jsonb;
begin
  perform app_private.crm_require_access(p_clinica_id);
  select jsonb_build_object(
    'open_count',count(*) filter(where s.tipo='open'),
    'pipeline_value',coalesce(sum(o.valor_estimado) filter(where s.tipo='open'),0),
    'weighted_value',coalesce(sum(o.valor_estimado*coalesce(o.probabilidade_override,s.probabilidade)/100) filter(where s.tipo='open'),0),
    'won_count',count(*) filter(where s.tipo='won'),
    'lost_count',count(*) filter(where s.tipo='lost'),
    'conversion_rate',case when count(*) filter(where s.tipo in ('won','lost'))>0 then round(100.0*count(*) filter(where s.tipo='won')/count(*) filter(where s.tipo in ('won','lost')),2) else 0 end,
    'average_ticket',coalesce(avg(coalesce(o.valor_fechado,o.valor_estimado)) filter(where s.tipo='won'),0),
    'average_sales_days',coalesce(avg(extract(epoch from (o.won_at-o.created_at))/86400) filter(where s.tipo='won' and o.won_at is not null),0),
    'overdue_activities',(select count(*) from public.crm_activities a where a.clinica_id=p_clinica_id and a.status='pending' and a.due_at<now()),
    'without_next_activity',count(*) filter(where s.tipo='open' and o.next_activity_at is null)
  ) into v_result
  from public.crm_oportunidades o join public.crm_pipeline_stages s on s.id=o.stage_id and s.clinica_id=o.clinica_id
  where o.clinica_id=p_clinica_id and o.pipeline_id=p_pipeline_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;

grant execute on function public.claim_domain_outbox_events_for_consumer(text,text,integer) to service_role;
grant execute on function public.crm_ensure_default_pipeline(uuid) to authenticated,service_role;
grant execute on function public.crm_create_opportunity(uuid,uuid,text,text,text,text,text,numeric,uuid,uuid,uuid,uuid,text,integer,text,jsonb,text) to authenticated,service_role;
grant execute on function public.crm_move_opportunity(uuid,uuid,uuid,uuid,uuid,uuid,numeric) to authenticated,service_role;
grant execute on function public.crm_save_opportunity(uuid,uuid,text,numeric,uuid,text,integer,text,uuid) to authenticated,service_role;
grant execute on function public.crm_create_activity(uuid,uuid,text,text,text,timestamptz,uuid) to authenticated,service_role;
grant execute on function public.crm_complete_activity(uuid,uuid) to authenticated,service_role;
grant execute on function public.crm_reorder_stages(uuid,uuid,uuid[]) to authenticated,service_role;
grant execute on function public.crm_pipeline_metrics(uuid,uuid) to authenticated,service_role;

commit;
