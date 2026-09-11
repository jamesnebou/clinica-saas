select case when count(*) = 1 then 'client_preserved=ok' else 'client_preserved=failed' end
from public.clientes where id = 'e1000000-0000-4000-8000-000000000001';

select case when count(*) = 1 and max(anamnese ->> 'tipo_sanguineo') = 'O+'
  then 'prontuario_backfill=ok' else 'prontuario_backfill=failed' end
from public.cliente_prontuarios
where clinica_id = 'e0000000-0000-4000-8000-000000000001'
  and cliente_id = 'e1000000-0000-4000-8000-000000000001';

select case when count(*) = 1
  and max(cardinality(procedimento_ids)) = 1
  then 'appointment_preserved=ok' else 'appointment_preserved=failed' end
from public.agendamentos
where id = 'e4000000-0000-4000-8000-000000000001';

select case when count(*) = 1 and max(valor_recebido) = 40 and max(status) = 'parcial'
  then 'receivable_preserved=ok' else 'receivable_preserved=failed' end
from public.finance_recebiveis
where id = 'e6000000-0000-4000-8000-000000000001';

select case when count(*) = 1 and max(valor_bruto) = 40
  then 'liquidation_preserved=ok' else 'liquidation_preserved=failed' end
from public.finance_liquidacoes
where idempotency_key = 'upgrade-liquidation';

select case when count(*) = 1 and bool_and(diagnostico = 'ok')
  then 'legacy_reconciliation=ok' else 'legacy_reconciliation=failed' end
from public.finance_reconciliacao_legado_v2
where agendamento_id = 'e4000000-0000-4000-8000-000000000001';

select case when count(*) = 0 then 'tenant_constraints=ok' else 'tenant_constraints=failed' end
from pg_constraint
where conname in (
  'cliente_prontuarios_cliente_tenant_fk',
  'agenda_booking_operations_agendamento_tenant_fk',
  'finance_package_sale_operations_cliente_tenant_fk'
) and not convalidated;

select case when count(*) = 55 then 'migration_history=ok' else 'migration_history=failed' end
from supabase_migrations.schema_migrations;

select case when count(*) = 3 then 'crm_schema=ok' else 'crm_schema=failed' end
from information_schema.tables
where table_schema = 'public'
  and table_name in ('crm_pipelines', 'crm_pipeline_stages', 'crm_oportunidades');

select case when count(*) = 4 then 'whatsapp_schema=ok' else 'whatsapp_schema=failed' end
from information_schema.tables
where table_schema = 'public'
  and table_name in ('whatsapp_connections', 'whatsapp_templates', 'whatsapp_messages', 'whatsapp_onboarding_sessions');

select case when count(*) = 5 then 'automation_schema=ok' else 'automation_schema=failed' end
from information_schema.tables
where table_schema = 'public'
  and table_name in ('automations', 'automation_versions', 'automation_runs', 'notification_jobs', 'domain_outbox_events');

select case when count(distinct p.proname) = 5 then 'critical_rpcs=ok' else 'critical_rpcs=failed' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'agenda_criar_agendamento_atomico_v2',
    'finance_registrar_pagamento_agendamento_v2',
    'finance_vender_pacote_v2',
    'capture_clinica_demo_snapshot',
    'restore_clinica_demo_snapshot'
  );

do $$
begin
  if not exists (
    select 1 from public.clientes
    where id = 'e1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'upgrade validation failed: client';
  end if;

  if not exists (
    select 1 from public.cliente_prontuarios
    where clinica_id = 'e0000000-0000-4000-8000-000000000001'
      and cliente_id = 'e1000000-0000-4000-8000-000000000001'
      and anamnese ->> 'tipo_sanguineo' = 'O+'
  ) then
    raise exception 'upgrade validation failed: medical record';
  end if;

  if not exists (
    select 1 from public.agendamentos
    where id = 'e4000000-0000-4000-8000-000000000001'
      and cardinality(procedimento_ids) = 1
  ) then
    raise exception 'upgrade validation failed: appointment';
  end if;

  if not exists (
    select 1 from public.finance_recebiveis
    where id = 'e6000000-0000-4000-8000-000000000001'
      and valor_recebido = 40
      and status = 'parcial'
  ) then
    raise exception 'upgrade validation failed: receivable';
  end if;

  if (select count(*) from supabase_migrations.schema_migrations) <> 55 then
    raise exception 'upgrade validation failed: migration history';
  end if;
end
$$;
