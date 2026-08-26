# Financeiro 2.0 - Arquitetura

## Verdades do domínio

- Agenda gera previsão e pode originar uma obrigação.
- Venda de pacote ou produto cria uma obrigação a receber.
- Liquidação movimenta caixa e nunca pode exceder o saldo da obrigação.
- Competência reconhece resultado quando o fato gerador ocorre.
- Transferência entre contas não é receita nem despesa.
- BI consome o resumo canônico e usa o legado apenas durante a implantação.

## Camadas

`finance_recebiveis` e `finance_pagaveis` representam obrigações. `finance_liquidacoes` registra o ato de pagar/receber. `finance_movimentos` é o livro-caixa. `finance_competencias` alimenta a DRE. `finance_conciliacoes` liga referências externas a liquidações. `finance_comissoes` guarda repasses com origem rastreável.

Todas as entidades operacionais possuem `clinica_id`, RLS e chaves estrangeiras compostas para impedir referências entre tenants. Operações críticas usam RPC transacional, bloqueio `FOR UPDATE` e chave de idempotência.

## Integrações

Agenda, pacotes, loja, Asaas e InfinitePay mantêm dual-write durante a transição. Ausência temporária do schema financeiro não interrompe checkout ou webhook. Erros financeiros reais não são ocultados.
