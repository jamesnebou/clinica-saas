# Financeiro 2.0 - Migração

Aplicar, nesta ordem:

1. `20260827100000_financeiro_2_core.sql`
2. `20260827101000_financeiro_2_rpcs.sql`
3. `20260827101500_financeiro_2_operacoes.sql`
4. `20260827102000_financeiro_2_backfill.sql`

O backfill é idempotente e não altera tabelas legadas. Registros inferidos recebem `metadata.backfill=true` e `metadata.inferido=true`. Pacotes sem vínculo inequívoco de pagamento não recebem liquidação inventada. Competência de atendimento só é criada para atendimento concluído; loja só reconhece pedido pago.

Após validação por amostragem, manter o dual-write por pelo menos um ciclo de cobrança. Não remover colunas ou tabelas legadas nesta fase.
## Recorrências

O repositório inclui um cron diário às 06:00 UTC em `vercel.json`, que chama
`/api/cron/finance-recurring`. Configure `CRON_SECRET` no ambiente de produção
antes de ativar o agendamento. O endpoint não aceita execução sem o segredo.
