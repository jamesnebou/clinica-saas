# Motor de Automação 2.0: segurança

## Isolamento multi-tenant

Todas as entidades persistidas carregam `clinica_id`. FKs compostas impedem associar runs, versões, tarefas ou consumos de clínicas diferentes. As policies RLS consultam a associação ativa em `usuarios_clinica`; não existe bypass baseado em `auth.uid() is null`.

## Service role

O worker usa service role somente em código server-side. RPCs de claim e scheduler não são concedidos a clientes autenticados. O endpoint cron exige segredo comparado no servidor. Service role não é uma autorização de negócio: executor e resolvers continuam filtrando `clinica_id`.

## Permissões

Operações são separadas em `view`, `manage`, `publish`, `runs` e `export`. Owner e admin possuem o conjunto completo. Demais papéis recebem somente operações compatíveis. A checagem ocorre no servidor antes de criar, alterar status, publicar ou cancelar runs.

## Publicação e integridade

Rascunhos são validados por tamanho, profundidade, quantidade de passos, IDs únicos, tipos, referências, capabilities e limites do plano. Publicar grava definição normalizada e hash em uma versão imutável. Runs sempre apontam para a versão publicada que as originou.

## Idempotência e concorrência

- Consumo único por evento e versão.
- Run única por evento e versão.
- Recibo único por ação lógica.
- Tarefa interna única por chave idempotente.
- Locks de claim com expiração e `SKIP LOCKED`.
- Releitura do recibo quando duas execuções disputam a mesma ação.
- Recibo `processing` abandonado pode ser retomado após janela de segurança.

## Proteção de loop e abuso

Correlação, causalidade, automation ID e profundidade acompanham eventos derivados. Reentrada própria é negada por padrão. Há limites de profundidade, passos, waits, tamanho da definição, tentativas, automações ativas e runs mensais. Ações sensíveis exigem feature flag explícita.

## Dados sensíveis

Snapshots devem conter somente o necessário para a execução. Segredos de provedores não entram na definição, timeline ou logs. Erros são truncados e não devem registrar tokens, headers ou payloads sensíveis. Upload de definição nunca permite código executável.
