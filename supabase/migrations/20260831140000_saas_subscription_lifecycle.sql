begin;

alter table public.clinicas
  drop constraint if exists clinicas_assinatura_status_check;

alter table public.clinicas
  add constraint clinicas_assinatura_status_check
  check (assinatura_status in ('trial', 'ativa', 'atrasada', 'pausada', 'cancelada', 'isenta'));

create table if not exists public.saas_subscription_operations (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  operation_key uuid not null unique,
  operation_type text not null check (operation_type in ('activate', 'pause', 'reactivate', 'change_plan', 'cancel')),
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  target_plan text,
  subscription_id text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  locked_until timestamptz not null default (now() + interval '5 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_saas_subscription_operations_clinic_processing
  on public.saas_subscription_operations (clinica_id)
  where status = 'processing';

create index if not exists idx_saas_subscription_operations_clinic_created
  on public.saas_subscription_operations (clinica_id, created_at desc);

drop trigger if exists set_updated_at_saas_subscription_operations on public.saas_subscription_operations;
create trigger set_updated_at_saas_subscription_operations
before update on public.saas_subscription_operations
for each row execute function app_private.set_updated_at();

alter table public.saas_subscription_operations enable row level security;

create or replace function public.claim_saas_subscription_operation(
  p_clinica_id uuid,
  p_operation_key uuid,
  p_operation_type text,
  p_target_plan text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operation_id uuid;
begin
  if p_operation_type not in ('activate', 'pause', 'reactivate', 'change_plan', 'cancel') then
    raise exception 'INVALID_SUBSCRIPTION_OPERATION';
  end if;

  update public.saas_subscription_operations
  set
    status = 'failed',
    error_code = 'STALE_OPERATION_LOCK',
    completed_at = now(),
    metadata = metadata || jsonb_build_object('released_at', now())
  where clinica_id = p_clinica_id
    and status = 'processing'
    and locked_until < now();

  insert into public.saas_subscription_operations (
    clinica_id,
    operation_key,
    operation_type,
    target_plan
  )
  values (
    p_clinica_id,
    p_operation_key,
    p_operation_type,
    p_target_plan
  )
  on conflict do nothing
  returning id into v_operation_id;

  return v_operation_id;
end;
$$;

revoke all on function public.claim_saas_subscription_operation(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_saas_subscription_operation(uuid, uuid, text, text) to service_role;
grant select, insert, update on public.saas_subscription_operations to service_role;

notify pgrst, 'reload schema';

commit;
