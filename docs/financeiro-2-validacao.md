# Financeiro 2.0 - Validação

## Checklist funcional

- Confirmar que as quatro migrations históricas não foram reexecutadas no banco existente.
- Aplicar `20260827103000_financeiro_2_consolidacao.sql` quando as quatro anteriores já estiverem instaladas.
- Depois da consolidação, aplicar `20260828100000_financeiro_2_comissoes_eventos.sql` para pagamento atômico de comissões e histórico de eventos.
- Conferir que recebíveis/pagáveis históricos possuem parcelas e rateios sem duplicação.

- Criar recebível e impedir liquidação acima do saldo.
- Repetir a mesma chave idempotente e confirmar uma única liquidação.
- Criar e pagar conta a pagar.
- Transferir entre duas contas e confirmar saldo operacional neutro.
- Confirmar sinal por Asaas e InfinitePay e conferir uma liquidação canônica.
- Vender pacote parcial e conferir saldo aberto.
- Cancelar/estornar e confirmar lançamento compensatório, sem exclusão histórica.
- Conferir comissão por profissional e procedimento.
- Comparar caixa, contas a receber e DRE no mesmo período.
- Testar usuário financeiro autorizado e recepção sem acesso.
- Verificar isolamento usando duas clínicas diferentes.

## Comandos locais

`npm test`, `npm run lint`, `npm run build` e `git diff --check`.

As migrations não são aplicadas automaticamente por código ou deploy. A aplicação no Supabase exige revisão e execução humana.
