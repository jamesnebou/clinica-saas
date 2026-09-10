# Broker central do Meta Embedded Signup

O dashboard autenticado cria uma sessão curta em `POST /api/whatsapp/embedded-signup/start`. O servidor vincula a sessão à clínica, ao usuário, ao papel e à origem validada. O navegador recebe apenas o identificador público da sessão, a origem central e uma URL com state opaco.

Somente `META_CONNECT_ORIGIN` serve `/whatsapp/connect` e carrega o JavaScript SDK da Meta. O broker envia o code e os IDs retornados ao callback central; o fluxo META-05 continua server-side. Depois, comunica apenas o identificador e o resultado ao dashboard usando `postMessage` com o `targetOrigin` armazenado na sessão. O dashboard aceita mensagens somente da origem central e confirma o estado real no endpoint autenticado antes de exibir sucesso.

## Configuração

- Production: `META_CONNECT_ORIGIN=https://connect.nexawi.com.br`
- Preview/Staging: configurar uma origem central separada e autorizada no app Meta correspondente ao ambiente.
- Adicionar somente o host central à lista de domínios permitidos do JavaScript SDK da Meta.

Não são compartilhados cookies entre o dashboard e o broker. Tokens Meta, App Secret, service role, PIN e dados clínicos nunca são enviados ao popup.
