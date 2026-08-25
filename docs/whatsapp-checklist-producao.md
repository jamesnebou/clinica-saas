# Checklist de produção do WhatsApp

- [ ] Migration aplicada em staging e validada antes de produção.
- [ ] App e empresa NexaWi verificados na Meta.
- [ ] Embedded Signup testado com uma WABA de homologação.
- [ ] `META_*`, `APP_URL` e `CRON_SECRET` configurados no servidor.
- [ ] Webhook HTTPS validado e assinatura inválida rejeitada.
- [ ] Templates aprovados em `pt_BR`.
- [ ] Scheduler executando e monitorado.
- [ ] Opt-in separado da LGPD exibido no site.
- [ ] `PARAR` e `SAIR` testados.
- [ ] Criação, pagamento pendente/confirmado, lembretes, remarcação e cancelamento testados.
- [ ] Confirmação interativa testada sem duplicar ação.
- [ ] Link de pagamento expirado/pago rejeitado.
- [ ] Isolamento entre duas clínicas validado.
- [ ] E-mail, Asaas e InfinitePay submetidos a regressão.
- [ ] Lint, testes e build aprovados.
- [ ] Nenhum envio real realizado durante validação automatizada.
