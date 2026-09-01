# Assinaturas SaaS Asaas

## Regra operacional

- Primeira contratação: cria uma assinatura somente quando não existe recorrência `ACTIVE` ou `INACTIVE` para a clínica.
- Recuperação: consulta primeiro `clinicas.asaas_subscription_id` e depois busca por `externalReference` e `customer`.
- Pausa: `PUT /subscriptions/{id}` com `status: INACTIVE`. O ID é preservado e cobranças já emitidas permanecem inalteradas.
- Reativação: `PUT /subscriptions/{id}` com `status: ACTIVE` e um novo `nextDueDate`. Não cria outra assinatura.
- Troca de plano: atualiza a assinatura existente com `updatePendingPayments: false`. A mudança vale para cobranças futuras; cobranças pendentes já emitidas conservam valor e forma originais.
- Cancelamento definitivo: `DELETE /subscriptions/{id}`. O Asaas remove as cobranças pendentes ou vencidas dessa recorrência e mantém as já pagas.
- Reaquisição: depois de um cancelamento definitivo, uma nova contratação pode criar um novo `subscription.id`. Esse novo contrato gera um novo `Subscribe`, com `event_id` determinístico pelo novo ID.

Referências oficiais:

- https://docs.asaas.com/reference/recuperar-uma-unica-assinatura
- https://docs.asaas.com/reference/listar-assinaturas
- https://docs.asaas.com/reference/atualizar-assinatura-existente
- https://docs.asaas.com/reference/remover-assinatura
- https://docs.asaas.com/docs/eventos-para-assinaturas

## Concorrência e idempotência

`saas_subscription_operations` registra cada operação. Uma constraint parcial permite apenas uma operação `processing` por clínica. A chave do formulário impede repetição do mesmo envio, e locks abandonados expiram após cinco minutos.

Se uma requisição criar a assinatura no Asaas e falhar antes da sincronização local, a próxima tentativa pesquisa `externalReference` e `customer` antes de qualquer novo `POST`. Assim, o timeout não cria outra recorrência.

## Tracking 2.0

- `Subscribe`: somente quando houve um novo `POST /subscriptions` bem-sucedido.
- Pausa, reativação, sincronização e troca de plano: não geram `Subscribe`.
- `Purchase`: continua exclusivo do webhook de pagamento SaaS confirmado e exige que `payment.subscription` seja a assinatura atual da clínica.
- Booking e loja retornam antes do bloco de `Purchase` SaaS.
- A Demo e clínicas isentas são bloqueadas nas actions de assinatura.

## Diagnóstico das assinaturas duplicadas

Não execute `DELETE` SQL em `asaas_cobrancas`. Os registros pagos são histórico financeiro e devem ser preservados.

1. Localize a clínica e os IDs conhecidos:

```sql
select id, nome, asaas_customer_id, asaas_subscription_id, assinatura_status, plano
from public.clinicas
where id = '<CLINICA_ID>';
```

2. Liste no Asaas as assinaturas pelo cliente e pela referência externa:

```text
GET /v3/subscriptions?customer=<ASAAS_CUSTOMER_ID>&includeDeleted=true
GET /v3/subscriptions?externalReference=<CLINICA_ID>&includeDeleted=true
```

3. Para cada `subscription.id`, consulte as cobranças:

```text
GET /v3/subscriptions/<SUBSCRIPTION_ID>/payments
```

4. Considere como recorrência principal o ID salvo em `clinicas.asaas_subscription_id`, desde que ele esteja `ACTIVE` ou `INACTIVE` e corresponda ao plano desejado.

5. Antes de remover as antigas, confirme que nenhum pagamento recebido pertence a elas. Pagamentos recebidos permanecem no Asaas e no histórico local.

6. Remova individualmente apenas as recorrências duplicadas confirmadas:

```text
DELETE /v3/subscriptions/<SUBSCRIPTION_DUPLICADA_ID>
```

O próprio Asaas removerá as cobranças pendentes ou vencidas dessas recorrências. Não remova as cobranças pagas e não faça limpeza manual no banco.

7. Aguarde os webhooks `SUBSCRIPTION_DELETED` e `PAYMENT_DELETED`. Eventos de subscriptions antigas não alteram a recorrência atual.

8. Confirme que restou somente uma assinatura reutilizável e recarregue a página de assinatura. A tela mostra pendências da recorrência atual e mantém pagamentos históricos.

## Homologação

1. Aplicar a migration `20260831140000_saas_subscription_lifecycle.sql` em Sandbox.
2. Garantir que o webhook SaaS inclua eventos `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`, além dos eventos de pagamento.
3. Ativar um plano e registrar o `subscription.id`.
4. Repetir a ativação: o ID deve permanecer igual.
5. Pausar: status remoto `INACTIVE`, mesmo ID.
6. Reativar: status remoto `ACTIVE`, mesmo ID e novo `nextDueDate`.
7. Trocar de plano: mesmo ID, novo valor para cobranças futuras.
8. Cancelar definitivamente somente em uma conta de teste: assinatura removida, pendências removidas pelo Asaas e pagamentos preservados.
9. Confirmar que existe apenas um evento `Subscribe` por `subscription.id` e que `Purchase` nasce somente após pagamento SaaS confirmado.
