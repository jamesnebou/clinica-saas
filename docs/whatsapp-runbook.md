# Runbook de incidentes do WhatsApp

1. Confirmar que agenda, checkout e e-mail continuam funcionando.
2. Abrir `WhatsApp > Saúde` e verificar conexão, número, webhook e templates.
3. Conferir `notification_jobs`: `pending/retry` indica scheduler ou Meta instável; `failed` indica erro permanente ou limite de tentativas.
4. Conferir `whatsapp_webhook_events` sem copiar payload sensível para chamados.
5. Executar `Testar conexão`; não usar envio real como health check.
6. Sincronizar templates e conferir motivo de rejeição.
7. Se o token do System User foi revogado, rotacioná-lo na Vercel e invalidar o anterior na Meta.
8. Se uma clínica desconectou, refazer Embedded Signup; não inserir IDs manualmente.
9. Para conter incidente, desativar automações da clínica. Não desligar agenda, Asaas, InfinitePay ou e-mail.

Nunca registrar access tokens, app secret, telefone completo ou conteúdo clínico em logs.
