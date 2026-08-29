begin;

create table if not exists public.automation_worker_executions (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  batch_size integer not null default 25 check (batch_size between 1 and 100),
  finance_events_enqueued integer not null default 0,
  events_found integer not null default 0,
  events_processed integer not null default 0,
  runs_started integer not null default 0,
  waits_found integer not null default 0,
  waits_resumed integer not null default 0,
  runs_found integer not null default 0,
  runs_continued integer not null default 0,
  retries_executed integer not null default 0,
  failures integer not null default 0,
  duration_ms integer,
  fatal_error_code text,
  fatal_error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists automation_worker_executions_started_idx
  on public.automation_worker_executions(started_at desc);
create index if not exists automation_worker_executions_status_idx
  on public.automation_worker_executions(status,started_at desc);

alter table public.automation_worker_executions enable row level security;
revoke all on public.automation_worker_executions from anon,authenticated;
grant all on public.automation_worker_executions to service_role;

create or replace function public.get_automation_worker_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_health jsonb;
begin
  if coalesce(auth.role(),'') not in ('authenticated','service_role') then
    raise exception 'Não autorizado.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'status',status,
    'started_at',started_at,
    'completed_at',completed_at,
    'duration_ms',duration_ms,
    'batch_size',batch_size,
    'finance_events_enqueued',finance_events_enqueued,
    'events_found',events_found,
    'events_processed',events_processed,
    'runs_started',runs_started,
    'waits_found',waits_found,
    'waits_resumed',waits_resumed,
    'runs_found',runs_found,
    'runs_continued',runs_continued,
    'retries_executed',retries_executed,
    'failures',failures
  ) into v_health
  from public.automation_worker_executions
  order by started_at desc
  limit 1;
  return coalesce(v_health,jsonb_build_object('status','never_run'));
end $$;

grant execute on function public.get_automation_worker_health() to authenticated,service_role;

create or replace function public.claim_domain_outbox_events_for_consumer(
  p_consumer text,
  p_worker text,
  p_limit integer default 25
) returns setof public.domain_outbox_events
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_consumer not in ('automation','integration') then
    raise exception 'Consumidor inválido.' using errcode='22023';
  end if;
  return query
  with candidates as (
    select id
    from public.domain_outbox_events
    where consumer=p_consumer
      and available_at<=now()
      and (
        status in ('pending','retry')
        or (status='processing' and locked_at<now()-interval '10 minutes')
      )
    order by occurred_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.domain_outbox_events e
     set status='processing',locked_at=now(),locked_by=left(p_worker,120),attempts=e.attempts+1
    from candidates c
   where e.id=c.id
  returning e.*;
end $$;

create or replace function public.claim_automation_waits(p_worker text,p_limit integer default 25)
returns setof public.automation_waits
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with candidates as (
    select id
    from public.automation_waits
    where resume_at<=now()
      and (
        status='pending'
        or (status='processing' and locked_at<now()-interval '10 minutes')
      )
    order by resume_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.automation_waits w
     set status='processing',locked_at=now(),locked_by=left(p_worker,120),attempts=w.attempts+1
    from candidates c
   where w.id=c.id
  returning w.*;
end $$;

create or replace function public.claim_automation_runs(p_worker text,p_limit integer default 25)
returns setof public.automation_runs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with candidates as (
    select id
    from public.automation_runs
    where next_attempt_at<=now()
      and (
        status='queued'
        or (status='running' and locked_at<now()-interval '10 minutes')
      )
    order by created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.automation_runs r
     set status='running',locked_at=now(),locked_by=left(p_worker,120),attempts=r.attempts+1,
         started_at=coalesce(r.started_at,now()),updated_at=now()
    from candidates c
   where r.id=c.id
  returning r.*;
end $$;

create index if not exists domain_outbox_automation_recovery_idx
  on public.domain_outbox_events(consumer,status,available_at,occurred_at,locked_at);
create index if not exists automation_waits_recovery_idx
  on public.automation_waits(status,resume_at,locked_at);
create index if not exists automation_runs_recovery_idx
  on public.automation_runs(status,next_attempt_at,locked_at,created_at);

grant execute on function public.claim_domain_outbox_events_for_consumer(text,text,integer) to service_role;
grant execute on function public.claim_automation_waits(text,integer),public.claim_automation_runs(text,integer) to service_role;

notify pgrst, 'reload schema';

commit;
