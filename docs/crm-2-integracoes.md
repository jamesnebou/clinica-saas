# CRM 2.0 - Integrações

## Site público e agenda

Cada procedimento define `crm_booking_behavior`:

- `none`: não cria oportunidade.
- `evaluation`: cria ou vincula oportunidade em Avaliação agendada.
- `opportunity`: cria ou vincula oportunidade na entrada do pipeline.
- `direct_sale`: cria a oportunidade e somente a fecha como ganha após pagamento confirmado.

O formulário "Quero saber mais" cria contato canônico e oportunidade. A reserva pública grava o vínculo em `crm_opportunity_appointments`, `agendamentos.crm_oportunidade_id` e `site_agendamentos_publicos.crm_oportunidade_id`.

## Pagamentos

Os webhooks Asaas e InfinitePay fecham venda direta de forma idempotente por meio da RPC de movimentação. Falhas do CRM não impedem a confirmação financeira do webhook.

## WhatsApp, BI e automações

Eventos de CRM são gravados na timeline e no outbox. O BI calcula conversão a partir das etapas dinâmicas e mantém os status legados apenas como compatibilidade. O outbox prepara os eventos para o Motor de Automação sem executar automações dentro da transação principal.
