begin;

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  trigger_type text not null,
  draft_definition jsonb not null default '{}'::jsonb,
  current_version_id uuid,
  owner_id uuid,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id)
);

create table if not exists public.automation_versions (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  automation_id uuid not null,
  version integer not null check (version > 0),
  trigger_type text not null,
  definition jsonb not null,
  definition_hash text not null,
  status text not null default 'active' check (status in ('active','superseded')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (clinica_id,id),
  unique (automation_id,version),
  foreign key (clinica_id,automation_id) references public.automations(clinica_id,id) on delete cascade
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='automations_current_version_fk') then
    alter table public.automations add constraint automations_current_version_fk
      foreign key (clinica_id,current_version_id) references public.automation_versions(clinica_id,id) on delete set null;
  end if;
end $$;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  automation_id uuid not null,
  automation_version_id uuid not null,
  source_event_id uuid references public.domain_outbox_events(id) on delete set null,
  source_event_type text not null,
  entity_type text,
  entity_id uuid,
  status text not null default 'queued' check (status in ('queued','running','waiting','completed','failed','cancelled','skipped')),
  current_step_index integer not null default 0 check (current_step_index >= 0),
  execution_plan jsonb not null default '[]'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  correlation_id text,
  causation_id text,
  automation_depth integer not null default 0 check (automation_depth between 0 and 12),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  failure_code text,
  failure_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  foreign key (clinica_id,automation_id) references public.automations(clinica_id,id) on delete cascade,
  foreign key (clinica_id,automation_version_id) references public.automation_versions(clinica_id,id) on delete restrict
);
create unique index if not exists automation_runs_once_per_event_idx
  on public.automation_runs(clinica_id,automation_version_id,source_event_id) where source_event_id is not null;

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  run_id uuid not null,
  step_id text not null,
  step_index integer not null,
  step_type text not null check (step_type in ('trigger','condition','branch','wait','action')),
  action_type text,
  status text not null check (status in ('queued','running','waiting','completed','failed','cancelled','skipped','blocked','unavailable')),
  attempt integer not null default 1 check (attempt > 0),
  idempotency_key text,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (clinica_id,id),
  unique (run_id,step_id,attempt),
  foreign key (clinica_id,run_id) references public.automation_runs(clinica_id,id) on delete cascade
);

create table if not exists public.automation_waits (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  run_id uuid not null,
  step_id text not null,
  resume_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','cancelled','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (clinica_id,id),
  unique (run_id,step_id),
  foreign key (clinica_id,run_id) references public.automation_runs(clinica_id,id) on delete cascade
);

create table if not exists public.automation_event_consumptions (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  source_event_id uuid not null references public.domain_outbox_events(id) on delete cascade,
  automation_id uuid not null,
  automation_version_id uuid not null,
  run_id uuid,
  status text not null check (status in ('matched','skipped','created','failed','loop_blocked')),
  reason text,
  created_at timestamptz not null default now(),
  unique (clinica_id,source_event_id,automation_version_id),
  foreign key (clinica_id,automation_id) references public.automations(clinica_id,id) on delete cascade,
  foreign key (clinica_id,automation_version_id) references public.automation_versions(clinica_id,id) on delete restrict
);

create table if not exists public.automation_action_receipts (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  run_id uuid not null,
  step_id text not null,
  action_type text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('processing','completed','failed','blocked','unavailable')),
  entity_type text,
  entity_id text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (clinica_id,run_id) references public.automation_runs(clinica_id,id) on delete cascade
);

create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  run_id uuid,
  entity_type text,
  entity_id uuid,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  assigned_to uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (clinica_id,id)
);

-- Keep the migration safe when a previous local attempt created the tables only
-- partially. The composite foreign keys prevent a run from another clinic from
-- being attached to a consumption or task.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='automation_event_consumptions_clinic_run_fk') then
    alter table public.automation_event_consumptions
      add constraint automation_event_consumptions_clinic_run_fk
      foreign key (clinica_id,run_id) references public.automation_runs(clinica_id,id) on delete set null;
  end if;
end $$;

alter table public.automation_tasks drop constraint if exists automation_tasks_run_id_fkey;
create unique index if not exists automation_tasks_clinic_id_id_uidx on public.automation_tasks(clinica_id,id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='automation_tasks_clinic_run_fk') then
    alter table public.automation_tasks
      add constraint automation_tasks_clinic_run_fk
      foreign key (clinica_id,run_id) references public.automation_runs(clinica_id,id) on delete set null;
  end if;
end $$;

create index if not exists automations_trigger_idx on public.automations(clinica_id,trigger_type,status);
create index if not exists automation_versions_lookup_idx on public.automation_versions(clinica_id,automation_id,version desc);
create index if not exists automation_runs_claim_idx on public.automation_runs(status,next_attempt_at,created_at);
create index if not exists automation_runs_clinic_idx on public.automation_runs(clinica_id,created_at desc);
create index if not exists automation_steps_run_idx on public.automation_run_steps(clinica_id,run_id,step_index);
create index if not exists automation_waits_claim_idx on public.automation_waits(status,resume_at);
create index if not exists automation_tasks_clinic_idx on public.automation_tasks(clinica_id,status,due_at);
create unique index if not exists automation_tasks_idempotency_uidx on public.automation_tasks(idempotency_key) where idempotency_key is not null;

alter table public.domain_outbox_events
  add column if not exists schema_version integer not null default 1,
  add column if not exists actor jsonb not null default '{}'::jsonb,
  add column if not exists correlation_id text,
  add column if not exists causation_id text,
  add column if not exists automation_run_id uuid,
  add column if not exists automation_depth integer not null default 0;

create or replace function app_private.automation_has_access(p_clinica_id uuid, p_admin_only boolean default false)
returns boolean language sql stable security definer set search_path=public,app_private as $$
  select exists (
    select 1 from public.usuarios_clinica uc
    where uc.clinica_id=p_clinica_id and uc.user_id=auth.uid() and uc.ativo
      and (not p_admin_only or uc.papel in ('owner','admin'))
  );
$$;

create or replace function public.publish_automation_v2(
  p_clinica_id uuid,p_automation_id uuid,p_definition jsonb,p_trigger_type text,p_definition_hash text,p_actor_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,app_private as $$
declare v_version integer; v_version_id uuid;
begin
  if not app_private.automation_has_access(p_clinica_id,true) then raise exception 'Sem permissão para publicar automações.' using errcode='42501'; end if;
  perform 1 from public.automations where id=p_automation_id and clinica_id=p_clinica_id for update;
  if not found then raise exception 'Automação não encontrada.' using errcode='P0002'; end if;
  select coalesce(max(version),0)+1 into v_version from public.automation_versions where automation_id=p_automation_id;
  update public.automation_versions set status='superseded' where automation_id=p_automation_id and status='active';
  insert into public.automation_versions(clinica_id,automation_id,version,trigger_type,definition,definition_hash,created_by)
    values(p_clinica_id,p_automation_id,v_version,p_trigger_type,p_definition,p_definition_hash,coalesce(p_actor_id,auth.uid())) returning id into v_version_id;
  update public.automations set status='active',trigger_type=p_trigger_type,draft_definition=p_definition,current_version_id=v_version_id,published_at=now(),updated_at=now() where id=p_automation_id and clinica_id=p_clinica_id;
  insert into public.auditoria_clinica(clinica_id,actor_id,acao,entidade_tipo,entidade_id,metadata)
    values(p_clinica_id,coalesce(p_actor_id,auth.uid()),'automation.published','automation',p_automation_id::text,jsonb_build_object('version',v_version,'definition_hash',p_definition_hash));
  return v_version_id;
end $$;

create or replace function public.claim_automation_waits(p_worker text,p_limit integer default 25)
returns setof public.automation_waits language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select id from public.automation_waits where status='pending' and resume_at<=now()
      and (locked_at is null or locked_at<now()-interval '10 minutes')
    order by resume_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ) update public.automation_waits w set status='processing',locked_at=now(),locked_by=left(p_worker,120),attempts=w.attempts+1
    from candidates c where w.id=c.id returning w.*;
end $$;

create or replace function public.claim_automation_runs(p_worker text,p_limit integer default 25)
returns setof public.automation_runs language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select id from public.automation_runs where status='queued' and next_attempt_at<=now()
      and (locked_at is null or locked_at<now()-interval '10 minutes')
    order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ) update public.automation_runs r set status='running',locked_at=now(),locked_by=left(p_worker,120),attempts=r.attempts+1,started_at=coalesce(r.started_at,now()),updated_at=now()
    from candidates c where r.id=c.id returning r.*;
end $$;

create or replace function public.cancel_automation_run(p_clinica_id uuid,p_run_id uuid)
returns void language plpgsql security definer set search_path=public,app_private as $$
begin
  if not app_private.automation_has_access(p_clinica_id,true) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  update public.automation_runs set status='cancelled',completed_at=now(),locked_at=null,locked_by=null,updated_at=now() where id=p_run_id and clinica_id=p_clinica_id and status not in ('completed','cancelled');
  update public.automation_waits set status='cancelled',completed_at=now(),locked_at=null,locked_by=null where run_id=p_run_id and clinica_id=p_clinica_id and status in ('pending','processing');
end $$;

create or replace function app_private.emit_automation_event(
  p_clinica_id uuid,p_event_name text,p_aggregate_type text,p_aggregate_id uuid,p_payload jsonb,p_key text,p_occurred_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.domain_outbox_events(clinica_id,event_name,aggregate_type,aggregate_id,payload,idempotency_key,consumer,occurred_at)
  values(p_clinica_id,p_event_name,p_aggregate_type,p_aggregate_id,coalesce(p_payload,'{}'::jsonb),p_key,'automation',coalesce(p_occurred_at,now()))
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  return v_id;
end $$;

create or replace function app_private.automation_booking_event_trigger()
returns trigger language plpgsql security definer set search_path=public,app_private as $$
declare v_event text; v_payload jsonb;
begin
  if tg_op='INSERT' then v_event:='booking.created';
  elsif new.status is distinct from old.status then
    v_event:=case new.status when 'cancelado' then 'booking.cancelled' when 'concluido' then 'booking.completed' when 'faltou' then 'booking.no_show' else null end;
  elsif new.inicio is distinct from old.inicio or new.fim is distinct from old.fim then v_event:='booking.rescheduled';
  end if;
  if v_event is not null then
    v_payload:=jsonb_build_object('booking_id',new.id,'cliente_id',new.cliente_id,'profissional_id',new.profissional_id,'procedimento_id',new.procedimento_id,'status',new.status,'inicio',new.inicio,'fim',new.fim,'previous_status',case when tg_op='UPDATE' then old.status else null end);
    perform app_private.emit_automation_event(new.clinica_id,v_event,'booking',new.id,v_payload,'automation:'||v_event||':'||new.id||':'||case when tg_op='INSERT' then 'created' else txid_current()::text end,now());
  end if;
  return new;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'automation_booking_event_trigger'
      and tgrelid = 'public.agendamentos'::regclass
      and not tgisinternal
  ) then
    execute 'create trigger automation_booking_event_trigger after insert or update of status,inicio,fim on public.agendamentos for each row execute function app_private.automation_booking_event_trigger()';
  end if;
end $$;

create or replace function app_private.automation_receivable_event_trigger()
returns trigger language plpgsql security definer set search_path=public,app_private as $$
declare v_event text;
begin
  if tg_op='INSERT' then v_event:='finance.receivable.created';
  elsif new.status is distinct from old.status or new.valor_recebido is distinct from old.valor_recebido then
    v_event:=case when new.status='pago' then 'payment.received' when coalesce(new.valor_recebido,0)>coalesce(old.valor_recebido,0) then 'payment.partial' else null end;
  end if;
  if v_event is not null then perform app_private.emit_automation_event(new.clinica_id,v_event,'finance_receivable',new.id,jsonb_build_object('receivable_id',new.id,'cliente_id',new.cliente_id,'status',new.status,'valor_total',new.valor_original,'valor_recebido',new.valor_recebido,'vencimento',new.vencimento),'automation:'||v_event||':'||new.id||':'||case when tg_op='INSERT' then 'created' else txid_current()::text end,now()); end if;
  return new;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'automation_receivable_event_trigger'
      and tgrelid = 'public.finance_recebiveis'::regclass
      and not tgisinternal
  ) then
    execute 'create trigger automation_receivable_event_trigger after insert or update of status,valor_recebido on public.finance_recebiveis for each row execute function app_private.automation_receivable_event_trigger()';
  end if;
end $$;

create or replace function public.enqueue_due_finance_automation_events(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,app_private as $$
declare v_count integer:=0; r record; v_event text;
begin
  for r in select id,clinica_id,cliente_id,status,valor_original,valor_recebido,vencimento from public.finance_recebiveis
    where status in ('aberto','parcial') and vencimento between current_date-30 and current_date+1
    order by vencimento limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_event:=case when r.vencimento<current_date then 'finance.receivable.overdue' else 'finance.receivable.due_soon' end;
    perform app_private.emit_automation_event(r.clinica_id,v_event,'finance_receivable',r.id,jsonb_build_object('receivable_id',r.id,'cliente_id',r.cliente_id,'status',r.status,'valor_total',r.valor_original,'valor_recebido',r.valor_recebido,'vencimento',r.vencimento),'automation:'||v_event||':'||r.id||':'||current_date,now());
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

do $$ declare t text; begin
  foreach t in array array['automations','automation_versions','automation_runs','automation_run_steps','automation_waits','automation_event_consumptions','automation_action_receipts','automation_tasks'] loop
    execute format('alter table public.%I enable row level security',t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t||'_members_select'
    ) then
      execute format('create policy %I on public.%I for select to authenticated using (app_private.automation_has_access(clinica_id,false))',t||'_members_select',t);
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t||'_admins_manage'
    ) then
      execute format('create policy %I on public.%I for all to authenticated using (app_private.automation_has_access(clinica_id,true)) with check (app_private.automation_has_access(clinica_id,true))',t||'_admins_manage',t);
    end if;
  end loop;
end $$;

grant select,insert,update,delete on public.automations,public.automation_versions,public.automation_tasks to authenticated;
grant select on public.automation_runs,public.automation_run_steps,public.automation_waits,public.automation_event_consumptions,public.automation_action_receipts to authenticated;
grant all on public.automations,public.automation_versions,public.automation_runs,public.automation_run_steps,public.automation_waits,public.automation_event_consumptions,public.automation_action_receipts,public.automation_tasks to service_role;
grant execute on function public.publish_automation_v2(uuid,uuid,jsonb,text,text,uuid) to authenticated,service_role;
grant execute on function public.cancel_automation_run(uuid,uuid) to authenticated,service_role;
grant execute on function public.claim_automation_waits(text,integer),public.claim_automation_runs(text,integer),public.enqueue_due_finance_automation_events(integer) to service_role;

do $$
declare
  v_delete_base integer;
  v_insert_base integer;
begin
  -- Serializa a reserva das ordens e nunca recria entradas que ja existem.
  lock table app_private.demo_reset_registry in exclusive mode;

  select
    coalesce(max(delete_order), 0) + 100,
    coalesce(max(insert_order), 0) + 100
  into v_delete_base, v_insert_base
  from app_private.demo_reset_registry;

  insert into app_private.demo_reset_registry(
    table_name,
    delete_order,
    insert_order,
    required,
    description
  )
  select
    registry.table_name,
    v_delete_base + registry.position,
    v_insert_base + (9 - registry.position),
    false,
    registry.description
  from (values
    ('automation_action_receipts', 1, 'Recibos idempotentes das acoes do motor'),
    ('automation_waits', 2, 'Esperas agendadas das automacoes'),
    ('automation_run_steps', 3, 'Etapas executadas das automacoes'),
    ('automation_event_consumptions', 4, 'Consumo idempotente dos eventos do dominio'),
    ('automation_tasks', 5, 'Tarefas geradas pelas automacoes'),
    ('automation_runs', 6, 'Execucoes das automacoes'),
    ('automation_versions', 7, 'Versoes publicadas das automacoes'),
    ('automations', 8, 'Definicoes das automacoes')
  ) as registry(table_name, position, description)
  where not exists (
    select 1
    from app_private.demo_reset_registry existing
    where existing.table_name = registry.table_name
  )
  on conflict do nothing;
end
$$;

notify pgrst, 'reload schema';

commit;
