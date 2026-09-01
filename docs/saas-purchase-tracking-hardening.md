# Purchase SaaS: auditoria e homologação

## Semântica final

- `Purchase` só é elegível em `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` quando o status do pagamento também confirma o recebimento.
- A identidade é `purchase:{payment.id}`. `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` e reentregas do mesmo pagamento convergem para a mesma linha em `meta_conversion_events`.
- A cobrança deve possuir `subscription` igual a `clinicas.asaas_subscription_id`. Customer e `externalReference`, quando presentes nos dois lados, também precisam corresponder.
- Booking e loja são processados e retornam antes da decisão SaaS.
- Demo, cobrança sem assinatura, assinatura antiga, valor inválido e eventos não financeiros não geram `Purchase`.
- O valor enviado é `payment.value`, sem substituir pelo `netValue` líquido de taxas. A moeda é `BRL` e o `source_type` é `saas_payment`.
- Falha de fila ou da Meta é isolada do webhook financeiro. O pagamento local já foi persistido e a resposta ao Asaas continua bem-sucedida.

## Refund e chargeback

- `PAYMENT_REFUNDED` altera a cobrança local para `estornado`.
- `PAYMENT_PARTIALLY_REFUNDED` usa `estornado_parcial`.
- Estorno em andamento usa `estorno_pendente`.
- Chargeback solicitado, em disputa ou aguardando reversão usa `contestado`.
- A linha de `asaas_cobrancas` e o `pago_em` original são preservados. O `Purchase` histórico em `meta_conversion_events` não é apagado e nenhum novo `Purchase` é criado.
- Se uma disputa for revertida a favor da NexaWi, um novo `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` do mesmo `payment.id` reutiliza o mesmo `event_id` e não duplica a conversão.

## SQL seguro de conferência

Substitua os valores entre `<...>`. As consultas são somente leitura.

```sql
select id, nome, slug, asaas_customer_id, asaas_subscription_id, assinatura_status
from public.clinicas
where id = '<CLINICA_ID>'::uuid;

select clinica_id, asaas_payment_id, asaas_subscription_id, evento, status,
       valor, pago_em, vencimento, created_at, updated_at
from public.asaas_cobrancas
where asaas_payment_id = '<PAYMENT_ID>';

select event_name, event_id, clinica_id, source_type, source_id, status,
       attempts, sent_at, last_error_code, created_at
from public.meta_conversion_events
where event_name = 'Purchase'
  and event_id = 'purchase:<PAYMENT_ID>';

select count(*) as purchases_do_pagamento
from public.meta_conversion_events
where event_name = 'Purchase'
  and event_id = 'purchase:<PAYMENT_ID>';
```

Resultado esperado: uma cobrança, `asaas_subscription_id` igual ao da clínica e no máximo um `Purchase` com `source_type = 'saas_payment'` e `source_id = <PAYMENT_ID>`.

## Teste real controlado

1. Use uma clínica de homologação que não seja a Demo e confirme seus IDs de customer e assinatura atual.
2. Ative `META_CAPI_TEST_EVENT_CODE` para que o evento apareça em **Test Events** da Meta sem contaminar a medição de produção.
3. Crie ou use uma cobrança recorrente da assinatura atual no Sandbox Asaas, com valor pequeno e identificadores conhecidos.
4. Confirme o pagamento pelo Sandbox e registre `payment.id`.
5. Aguarde `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`; execute as consultas acima.
6. Reenvie o mesmo webhook e depois processe o outro evento pago do mesmo `payment.id`. A contagem deve continuar em 1.
7. Confirme no Test Events da Meta o `event_id`, `value` e `currency`.
8. Em outra cobrança controlada, simule estorno/chargeback. A cobrança deve mudar de status, manter `pago_em` e não criar outro `Purchase`.
9. Repita com um sinal de agendamento e um pedido da loja. Nenhum deles pode aparecer como `Purchase` SaaS.
