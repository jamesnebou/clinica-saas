-- F0C: consultas somente leitura. Nao corrige nem exibe PII.

select version, name
from supabase_migrations.schema_migrations
order by version;

select n.nspname as schema_name, c.relname as table_name, con.conname,
       con.contype, con.convalidated
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'app_private') and not con.convalidated
order by schema_name, table_name, con.conname;

select diagnostico, count(*) as quantidade,
       coalesce(sum(valor_canonico), 0) as valor_canonico,
       coalesce(sum(valor_legado), 0) as valor_legado
from public.finance_reconciliacao_legado_v2
group by diagnostico
order by diagnostico;

select
  count(*) filter (where nullif(trim(coalesce(c.anamnese, '')), '') is not null) as clientes_com_legado,
  count(*) filter (where cp.id is not null) as prontuarios_novos,
  count(*) filter (where nullif(trim(coalesce(c.anamnese, '')), '') is not null and cp.id is null) as backfill_ausente
from public.clientes c
left join public.cliente_prontuarios cp
  on cp.clinica_id = c.clinica_id and cp.cliente_id = c.id;

select consumer, status, count(*) as quantidade,
       min(created_at) as item_mais_antigo
from public.domain_outbox_events
where status in ('pending', 'retry', 'processing', 'failed')
group by consumer, status
order by consumer, status;

select status, count(*) as quantidade, min(scheduled_at) as item_mais_antigo
from public.notification_jobs
where status in ('pending', 'retry', 'processing', 'failed')
group by status
order by status;

select status, count(*) as quantidade, min(resume_at) as wait_mais_antigo
from public.automation_waits
where status in ('waiting', 'claimed')
group by status
order by status;

select status, count(*) as quantidade, min(created_at) as run_mais_antigo
from public.automation_runs
where status in ('queued', 'running', 'retry', 'failed')
group by status
order by status;

select status, count(*) as quantidade, min(created_at) as evento_mais_antigo
from public.meta_conversion_events
where status in ('pending', 'processing', 'retry', 'dead')
group by status
order by status;
