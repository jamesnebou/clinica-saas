# CRM 2.0 - Migração

Aplicar localmente ou no ambiente autorizado, uma vez e nesta ordem:

1. `20260828101000_crm_2_core.sql`
2. `20260828102000_crm_2_rpcs.sql`
3. `20260828103000_crm_2_backfill.sql`
4. `20260828104000_crm_2_hardening.sql`
5. `20260828105000_crm_2_pipeline_management.sql`

As migrations são aditivas e preservam `crm_oportunidades.status`. Não edite migrations históricas já aplicadas. Se uma etapa falhar, identifique a versão registrada em `supabase_migrations.schema_migrations` e produza fix forward; não reaplique blocos parcialmente executados sem confirmar o estado do schema.

O hardening normaliza telefone/e-mail, cria detecção de possíveis duplicidades e instala validações de tenant. A única limpeza é o snapshot da conta de demonstração com slug `demo-nexawi-clinicas`, para que ele seja recapturado com o novo formato; dados comerciais reais não são apagados.

A migration `105000` adiciona somente as operações atômicas para criar pipelines com suas etapas iniciais e definir o pipeline padrão. Ela não recria tabelas nem altera oportunidades existentes.

Nenhuma migration foi executada remotamente por esta implementação.
