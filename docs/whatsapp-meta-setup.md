# Configuração Meta

1. Criar ou usar o Meta Business Portfolio da NexaWi.
2. Criar um app do tipo Business e adicionar o produto WhatsApp.
3. Configurar a NexaWi como Tech Provider e concluir a verificação empresarial exigida pela Meta.
4. Criar a configuração de Embedded Signup e guardar o Config ID.
5. Criar um System User com os ativos/permissões necessários e gerar o token server-side.
6. Configurar o webhook público `https://SEU_HOST/api/webhooks/meta/whatsapp`.
7. Usar em `Verify token` exatamente o valor de `META_WEBHOOK_VERIFY_TOKEN`.
8. Assinar o campo `messages` do objeto WhatsApp Business Account.
9. Configurar todas as variáveis `META_*` de `.env.example` em Preview e Production na Vercel.
10. Aplicar a migration `20260826100000_whatsapp_meta_official.sql` e só então conectar uma clínica piloto.

Não cadastrar WABA, Phone Number ID, app secret ou access token manualmente na ficha da clínica.

Documentação oficial: [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/), [Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/), [Message Templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/).
