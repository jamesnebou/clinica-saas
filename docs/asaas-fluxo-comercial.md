# Fluxo comercial Asaas

## Modelo recomendado

O SaaS deve usar uma conta Asaas da operadora do sistema para cobrar as clinicas assinantes.

Cada clinica vira:

- um `customer` no Asaas;
- uma `subscription` no Asaas;
- uma linha em `clinicas` com `asaas_customer_id` e `asaas_subscription_id`;
- cobranças sincronizadas em `asaas_cobrancas` via webhook.

Nao e necessario trocar ID manualmente por cliente. O ID do customer e da subscription fica salvo por clinica.

## Ambiente sandbox

Variaveis:

- `ASAAS_API_KEY`: chave sandbox.
- `ASAAS_BASE_URL`: `https://sandbox.asaas.com/api/v3`.
- `ASAAS_WEBHOOK_TOKEN`: token definido por voce para proteger o webhook.

Webhook na Vercel:

```txt
https://SEU_DOMINIO/api/webhooks/asaas
```

Header/token no Asaas:

```txt
asaas-access-token: valor_de_ASAAS_WEBHOOK_TOKEN
```

## Ambiente producao

Trocar somente variaveis:

- `ASAAS_API_KEY`: chave de producao.
- `ASAAS_BASE_URL`: `https://api.asaas.com/v3`.
- manter `ASAAS_WEBHOOK_TOKEN` forte e diferente do sandbox.

## Fluxo no sistema

1. Admin interno cria clinica e owner em `/admin`.
2. Owner acessa `/login-cliente`.
3. Clinica escolhe plano em `/dashboard/assinatura`.
4. Sistema cria ou reaproveita `asaas_customer_id`.
5. Sistema cria `asaas_subscription_id`.
6. Sistema consulta a primeira cobranca da assinatura e salva em `asaas_cobrancas`.
7. Webhook recebe eventos `PAYMENT_*` e `SUBSCRIPTION_*`.
8. Pagamento recebido ativa a clinica.
9. Pagamento vencido marca inadimplente e bloqueia novas operacoes.
10. Assinatura removida/inativada cancela a clinica.

## Pontos de escala

- Usar `externalReference` com o `clinica.id` evita confusao entre clientes.
- Nunca editar IDs Asaas manualmente quando o fluxo automatico ja tiver criado a assinatura.
- Webhook precisa responder 200 quando o evento foi recebido, mesmo que nao encontre clinica, para nao travar fila.
- Antes de produção, testar eventos reais no sandbox: `PAYMENT_CREATED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED`.
