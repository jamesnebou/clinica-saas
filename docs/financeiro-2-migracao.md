# Financeiro 2.0 - Migração

## Banco que ainda não recebeu o Financeiro 2.0

Aplicar uma única vez, nesta ordem:

1. `20260827100000_financeiro_2_core.sql`
2. `20260827101000_financeiro_2_rpcs.sql`
3. `20260827101500_financeiro_2_operacoes.sql`
4. `20260827102000_financeiro_2_backfill.sql`
5. `20260827103000_financeiro_2_consolidacao.sql`
6. `20260828100000_financeiro_2_comissoes_eventos.sql`

## Banco que já recebeu as quatro primeiras migrations

Não execute novamente as migrations `100000`, `101000`, `101500` e `102000`.
Objetos como `finance_contas` já existem e o PostgreSQL recusará a recriação.

Execute somente:

`20260827103000_financeiro_2_consolidacao.sql`

Essa migration usa a estratégia *fix forward*: valida o núcleo instalado, cria
somente a estrutura complementar ausente, repara parcelas/rateios históricos e
substitui as funções financeiras pelas versões finais. Ela é transacional e
idempotente, portanto pode ser reaplicada com segurança pelo SQL Editor caso a
execução anterior tenha sido concluída integralmente.

Se a consolidação informar relações ausentes, não tente executar as quatro
migrations antigas em bloco. Primeiro confira em `supabase_migrations.schema_migrations`
quais versões estão registradas e valide o schema antes de prosseguir.

O backfill é idempotente e não altera tabelas legadas. Registros inferidos recebem `metadata.backfill=true` e `metadata.inferido=true`. Pacotes sem vínculo inequívoco de pagamento não recebem liquidação inventada. Competência de atendimento só é criada para atendimento concluído; loja só reconhece pedido pago.

Após validação por amostragem, manter o dual-write por pelo menos um ciclo de cobrança. Não remover colunas ou tabelas legadas nesta fase.

## Extensão de comissões e aging

Depois que a consolidação `20260827103000` estiver aplicada e validada, execute:

`20260828100000_financeiro_2_comissoes_eventos.sql`

Ela adiciona o pagamento atômico de comissões por profissional, registra o contas a pagar e a liquidação correspondente e publica as visões de aging de recebíveis e pagáveis. Não execute essa extensão antes da consolidação, pois ela depende das RPCs financeiras finais.
## Recorrências

O repositório inclui um cron diário às 06:00 UTC em `vercel.json`, que chama
`/api/cron/finance-recurring`. Configure `CRON_SECRET` no ambiente de produção
antes de ativar o agendamento. O endpoint não aceita execução sem o segredo.
