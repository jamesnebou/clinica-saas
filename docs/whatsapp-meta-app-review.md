# Meta WhatsApp Embedded Signup: operacao e App Review

Documento atualizado em 2026-09-08 a partir da documentacao oficial do Meta
WhatsApp Business Platform e da colecao oficial da Meta no Postman.

## Modelo da NexaWi

- A NexaWi opera como Tech Provider com uma credencial permanente de System User.
- Cada clinica autoriza a propria WABA e o proprio numero no Embedded Signup.
- O billing padrao e `client_direct`: a empresa cliente mantem o pagamento com a
  Meta. A NexaWi nao compartilha linha de credito automaticamente.
- Todas as operacoes administrativas ocorrem server-to-server.
- O navegador recebe somente App ID, Config ID e um `state` opaco de uso unico.

## Configuracao externa obrigatoria

O `META_WHATSAPP_CONFIG_ID` e criado no Meta Dashboard e nao esta definido no
codigo. Antes da homologacao, confirmar no Dashboard:

1. configuracao criada para o app correto e para Embedded Signup Cloud API;
2. `whatsapp_business_management` e `whatsapp_business_messaging` habilitadas;
3. dominios HTTPS e OAuth redirect URIs de homologacao/producao autorizados;
4. NexaWi Business Portfolio verificado e Tech Provider habilitado;
5. System User de tipo Admin pertencente ao Business Portfolio da NexaWi;
6. token do System User emitido para o app correto com `business_management`,
   `whatsapp_business_management` e `whatsapp_business_messaging`;
7. webhook configurado e inscrito no objeto WhatsApp Business Account;
8. App ID, Business ID e System User ID conferidos, sem copiar IDs de outro app.

Variaveis exclusivamente server-side:

- `META_APP_SECRET`;
- `META_SYSTEM_USER_ACCESS_TOKEN`;
- `META_PHONE_REGISTRATION_SECRET`, aleatorio e com pelo menos 32 caracteres;
- `META_WEBHOOK_VERIFY_TOKEN`.

O `META_SYSTEM_USER_ID` identifica deterministicamente o principal representado
pelo token. O token nunca e enviado ao navegador ou persistido nas tabelas das
clinicas. O segredo de registro deriva um PIN estavel por Phone Number ID via
HMAC; o PIN nao e persistido nem escrito em logs.

## Fluxo server-to-server

1. Criar sessao com `state` hasheado, tenant, usuario, validade de 15 minutos e
   estagio `started`.
2. Executar o Embedded Signup com o Config ID externo.
3. Receber `code`, WABA ID e Phone Number ID por canais oficiais separados.
4. Consumir o `state` uma unica vez, preso ao mesmo tenant e usuario.
5. Trocar o code em `GET /oauth/access_token`.
6. Inspecionar o business token em `GET /debug_token` com App Access Token.
7. Validar `is_valid`, App ID, tipo, scopes, granular scopes e target WABA.
8. Ler `GET /{WABA_ID}` e `GET /{WABA_ID}/phone_numbers` com o business token.
9. Inspecionar a credencial permanente e exigir o mesmo App ID e os tres scopes.
10. Confirmar o System User em `GET /{BUSINESS_ID}/system_users`.
11. Consultar `GET /{WABA_ID}/assigned_users?business={BUSINESS_ID}`.
12. Se ausente, executar uma vez
    `POST /{WABA_ID}/assigned_users?user={SYSTEM_USER_ID}&tasks=["MANAGE"]` e
    consultar novamente.
13. Confirmar a WABA em
    `GET /{BUSINESS_ID}/client_whatsapp_business_accounts`.
14. Executar idempotentemente `POST /{WABA_ID}/subscribed_apps` e confirmar via
    `GET /{WABA_ID}/subscribed_apps`.
15. Registrar o numero Cloud API em `POST /{PHONE_NUMBER_ID}/register` com
    `messaging_product=whatsapp` e PIN derivado server-side.
16. Com o token permanente, reler WABA, numeros e `message_templates`.
17. Persistir a conexao como `templates_syncing`, sincronizar templates e somente
    depois marcar `ready`.

Estagios ficam registrados em `whatsapp_onboarding_sessions.metadata.stage`:
`started`, `meta_authorized`, `assets_validated`,
`system_user_assignment_pending`, `system_user_assigned`,
`webhook_subscribed`, `phone_registered`, `syncing`, `ready` ou `failed`.

## Permissoes para App Review

### business_management

Uso real: identificar o System User da NexaWi e estabelecer/verificar sua
relacao com uma WABA externa compartilhada. Endpoints:

- `GET /{BUSINESS_ID}/system_users`;
- `GET /{WABA_ID}/assigned_users?business={BUSINESS_ID}`;
- `POST /{WABA_ID}/assigned_users`;
- `GET /{BUSINESS_ID}/client_whatsapp_business_accounts`.

Sem essa operacao, a NexaWi nao consegue provar que a credencial permanente esta
autorizada para operar a WABA de uma clinica externa depois do onboarding.

### whatsapp_business_management

Uso real: consultar WABA e numeros, inscrever o app, registrar o numero e ler ou
gerenciar templates. Endpoints principais:

- `GET /{WABA_ID}` e `GET /{WABA_ID}/phone_numbers`;
- `POST|GET /{WABA_ID}/subscribed_apps`;
- `POST /{PHONE_NUMBER_ID}/register`;
- `GET|POST /{WABA_ID}/message_templates`.

### whatsapp_business_messaging

Uso real: envio de mensagens aprovadas pela Cloud API em
`POST /{PHONE_NUMBER_ID}/messages`. O recebimento ocorre pelo webhook assinado;
a permissao nao substitui a inscricao da WABA em `subscribed_apps`.

## Billing

O codigo registra `billing_mode=client_direct` e nao chama `extendedcredits` nem
`whatsapp_credit_sharing_and_attach`. Portanto, a clinica e responsavel por seu
metodo de pagamento com a Meta. Mudar para billing agregado seria uma decisao
comercial e regulatoria externa, nao parte deste onboarding.

## Ambiente de homologacao Meta

1. Criar Preview HTTPS com banco Supabase isolado e dominio cadastrado no app.
2. Usar WABA e numero exclusivos de teste, nunca ativos de uma clinica real.
3. Configurar todas as variaveis `META_*` na Preview, com System User Admin.
4. Adicionar o Facebook testador aos papeis do app e ao Business Portfolio/WABA
   de teste com acesso administrativo.
5. Executar o fluxo pela interface, conferir os estagios no banco e validar
   `ready`, health check, assinatura de webhook e sincronizacao de templates.
6. Testar novamente o callback concluido e confirmar que retorna `replay=true`
   sem nova atribuicao, inscricao ou registro.
7. Nao enviar mensagem real no App Review; usar ativo de teste e demonstrar a
   tela de saude, quando permitido pela configuracao da Meta.

## Roteiro do screencast

1. Mostrar login de owner/admin e abrir Dashboard > WhatsApp.
2. Clicar em Conectar WhatsApp e concluir o popup oficial com empresa de teste.
3. Mostrar retorno ao dashboard e progressao ate Pronto.
4. Mostrar numero, nome verificado, webhook ativo e templates sincronizados.
5. Explicar que `business_management` e usado no backend para localizar o System
   User e atribui-lo/verifica-lo na WABA externa.
6. Explicar separadamente gestao de ativos/templates e envio de mensagens.
7. Mostrar que outra clinica nao consegue reutilizar o mesmo `state` ou ativo.

Em App Mode Development, o teste depende dos papeis permitidos pelo app e pelos
ativos empresariais. Para onboarding comercial de empresas externas, concluir
App Review e Advanced Access exigidos no Meta Dashboard.

## Referencias oficiais

- https://developers.facebook.com/docs/whatsapp/embedded-signup/
- https://developers.facebook.com/docs/graph-api/reference/debug-token/
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration/
- https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
