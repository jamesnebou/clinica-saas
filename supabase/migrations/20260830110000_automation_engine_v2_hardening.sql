begin;

alter table if exists public.automation_action_receipts
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.automation_tasks
  add column if not exists idempotency_key text;

create unique index if not exists automation_tasks_idempotency_uidx
  on public.automation_tasks(idempotency_key)
  where idempotency_key is not null;

commit;
