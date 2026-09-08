# Fase 0B - Agenda atomica e financeiro canonico

## Fonte de verdade

O Financeiro 2.0 e a unica fonte de verdade financeira. Para recebimentos de atendimentos, a autoridade e formada por `finance_recebiveis`, `finance_recebivel_parcelas`, `finance_liquidacoes`, `finance_liquidacao_parcelas`, `finance_movimentos`, `finance_competencias` e `finance_comissoes`.

`agendamentos` representa o compromisso operacional. `pagamentos_clinica` permanece apenas como espelho temporario de compatibilidade e nunca determina o saldo ou o status canonico.

## Booking

Booking publico e interno entram por `agenda_criar_agendamento_atomico_v2`. Cliente, agendamento, lista completa de procedimentos, registro publico, obrigacao financeira aplicavel, operacao idempotente e evento de outbox sao persistidos na mesma transacao. A constraint de sobreposicao no banco continua sendo a protecao final contra TOCTOU.

Checkout, e-mail, WhatsApp, CRM e tracking ficam fora do nucleo. O evento duravel `booking.created` e gravado junto com o commit; integracoes podem ser repetidas com idempotencia.

## Pagamentos de agenda

Webhooks e dashboard usam RPCs transacionais. A baixa nasce no modelo canonico e, na mesma transacao, atualiza o espelho legado e os campos operacionais da agenda. Eventos repetidos usam a referencia do provider e nao criam liquidacao adicional.

Cancelamento usa `finance_cancelar_pagamento_agendamento_v2`, que reaproveita o estorno canonico e sincroniza agenda, booking publico e legado sem escrita parcial.

## Loja e pacotes

Pagamentos confirmados da loja entram por `finance_registrar_pagamento_pedido_v2`. Estoque, pedido, recebivel, parcela, liquidacao e o espelho `pagamentos_loja_clinica` mudam na mesma transacao. Cancelamentos e estornos usam `finance_cancelar_pagamento_pedido_v2` e nao apagam o historico canonico.

Vendas de pacotes entram por `finance_vender_pacote_v2`. O pacote do cliente, a obrigacao canonica, a parcela, a eventual liquidacao inicial e o espelho legado sao criados atomicamente. A chave de idempotencia impede uma segunda venda quando o formulario e reenviado.

## Legado e remocao futura

- `pagamentos_clinica`: compatibilidade temporaria para telas antigas; escrita somente pelo adaptador transacional canonico.
- campos `valor_pago`, `pagamento_status`, `forma_pagamento` e `data_pagamento` de `agendamentos`: projecao operacional.
- `pagamentos_loja_clinica`: espelho temporario da liquidacao canonica de pedidos.
- `cliente_pacotes`: contrato operacional de sessoes; a obrigacao e os recebimentos pertencem ao Financeiro 2.0.

Antes de remover o legado, todas as leituras devem migrar para o Financeiro 2.0 e a view `finance_reconciliacao_legado_v2` deve permanecer sem diagnosticos diferentes de `ok`.

## Reconciliacao

`finance_reconciliacao_legado_v2` detecta registro canonico ausente, espelho legado ausente, espelho duplicado e divergencias de valor, recebido ou status. A view e apenas diagnostica e nao corrige dados automaticamente.
