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
