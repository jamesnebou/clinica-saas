# Templates canônicos

Os templates são `UTILITY`, idioma `pt_BR`, prefixo `nexawi_`:

- `nexawi_booking_created`
- `nexawi_booking_payment_pending`
- `nexawi_payment_expiring`
- `nexawi_payment_confirmed`
- `nexawi_payment_expired`
- `nexawi_appointment_reminder_24h`
- `nexawi_appointment_reminder_3h`
- `nexawi_booking_cancelled`
- `nexawi_booking_rescheduled`

Os lembretes possuem resposta rápida `Confirmar presença`. Links de pagamento usam um redirecionador assinado da NexaWi para registrar o clique antes de abrir o checkout armazenado.

Na tela `Dashboard > WhatsApp > Templates`, `Enviar ausentes` submete apenas nomes ainda não encontrados. A Meta pode manter o item como `PENDING` ou rejeitá-lo; somente `APPROVED` é elegível para envio. Não alterar o número ou a ordem das variáveis sem versionar o nome do template e o builder correspondente.
