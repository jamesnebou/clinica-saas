begin;

-- Fix-forward para ambientes que receberam uma versão anterior do Motor 2.0.
-- Pode ser reaplicada depois de uma tentativa que falhou: as operações são
-- aditivas ou recriadas de forma idempotente.
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

alter table if exists public.automation_action_receipts
  add column if not exists updated_at timestamptz not null default now();

alter table public.automation_tasks
  add column if not exists idempotency_key text;

create index if not exists automation_tasks_clinic_idx
  on public.automation_tasks(clinica_id,status,due_at);

create unique index if not exists automation_tasks_clinic_id_id_uidx
  on public.automation_tasks(clinica_id,id);

create unique index if not exists automation_tasks_idempotency_uidx
  on public.automation_tasks(idempotency_key)
  where idempotency_key is not null;

-- As referências compostas impedem vínculos entre clínicas. Apenas run_id é
-- limpo ao excluir o run; clinica_id continua íntegro.
do $$
begin
  if to_regclass('public.automation_runs') is not null then
    alter table public.automation_tasks
      drop constraint if exists automation_tasks_run_id_fkey;
    alter table public.automation_tasks
      drop constraint if exists automation_tasks_clinic_run_fk;
    alter table public.automation_tasks
      add constraint automation_tasks_clinic_run_fk
      foreign key (clinica_id,run_id)
      references public.automation_runs(clinica_id,id)
      on delete set null (run_id);
  end if;

  if to_regclass('public.automation_event_consumptions') is not null
     and to_regclass('public.automation_runs') is not null then
    alter table public.automation_event_consumptions
      drop constraint if exists automation_event_consumptions_clinic_run_fk;
    alter table public.automation_event_consumptions
      add constraint automation_event_consumptions_clinic_run_fk
      foreign key (clinica_id,run_id)
      references public.automation_runs(clinica_id,id)
      on delete set null (run_id);
  end if;
end $$;

-- Processos internos usam service_role; uma sessão sem usuário nunca deve ser
-- tratada como membro da clínica pelas políticas RLS.
create or replace function app_private.automation_has_access(
  p_clinica_id uuid,
  p_admin_only boolean default false
) returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists (
    select 1
      from public.usuarios_clinica uc
     where uc.clinica_id=p_clinica_id
       and uc.user_id=auth.uid()
       and uc.ativo
       and (not p_admin_only or uc.papel in ('owner','admin'))
  );
$$;

alter table public.automation_tasks enable row level security;
drop policy if exists automation_tasks_members_select on public.automation_tasks;
drop policy if exists automation_tasks_admins_manage on public.automation_tasks;
create policy automation_tasks_members_select
  on public.automation_tasks for select to authenticated
  using (app_private.automation_has_access(clinica_id,false));
create policy automation_tasks_admins_manage
  on public.automation_tasks for all to authenticated
  using (app_private.automation_has_access(clinica_id,true))
  with check (app_private.automation_has_access(clinica_id,true));

grant select,insert,update,delete on public.automation_tasks to authenticated;
grant all on public.automation_tasks to service_role;

-- Corrige os eventos para os status válidos do Financeiro 2.0 e usa o total
-- calculado após descontos e acréscimos.
create or replace function app_private.automation_receivable_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    v_event:='finance.receivable.created';
  elsif new.status='pago' and old.status is distinct from new.status then
    v_event:='payment.received';
  elsif new.status='parcial' and
        (old.status is distinct from new.status or old.valor_recebido is distinct from new.valor_recebido) then
    v_event:='payment.partial';
  end if;

  if v_event is not null then
    perform app_private.emit_automation_event(
      new.clinica_id,v_event,'finance_receivable',new.id,
      jsonb_build_object(
        'receivable_id',new.id,'cliente_id',new.cliente_id,'status',new.status,
        'valor_total',new.valor_total,'valor_recebido',new.valor_recebido,'vencimento',new.vencimento
      ),
      'automation:'||v_event||':'||new.id||':'||case when tg_op='INSERT' then 'created' else txid_current()::text end,
      now()
    );
  end if;
  return new;
end $$;

drop trigger if exists automation_receivable_event_trigger on public.finance_recebiveis;
create trigger automation_receivable_event_trigger
  after insert or update of status,valor_recebido on public.finance_recebiveis
  for each row execute function app_private.automation_receivable_event_trigger();

create or replace function public.enqueue_due_finance_automation_events(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare r record; v_event text; v_count integer:=0;
begin
  for r in
    select id,clinica_id,cliente_id,status,valor_total,valor_recebido,vencimento
      from public.finance_recebiveis
     where status in ('aberto','parcial')
       and vencimento between current_date-30 and current_date+1
     order by vencimento
     limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_event:=case when r.vencimento<current_date
      then 'finance.receivable.overdue' else 'finance.receivable.due_soon' end;
    perform app_private.emit_automation_event(
      r.clinica_id,v_event,'finance_receivable',r.id,
      jsonb_build_object(
        'receivable_id',r.id,'cliente_id',r.cliente_id,'status',r.status,
        'valor_total',r.valor_total,'valor_recebido',r.valor_recebido,'vencimento',r.vencimento
      ),
      'automation:'||v_event||':'||r.id||':'||current_date,now()
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

grant execute on function public.enqueue_due_finance_automation_events(integer) to service_role;

-- Atualiza imediatamente o schema exposto pela API REST do Supabase depois
-- que tabelas ou colunas forem recuperadas por esta migration.
notify pgrst, 'reload schema';

commit;
