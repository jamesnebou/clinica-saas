# WhatsApp oficial: arquitetura

## Limites

- Provider único: Meta WhatsApp Cloud API, acessada diretamente pelo Graph API.
- Cada clínica conecta a própria WABA e o próprio número pelo Embedded Signup.
- Nenhuma credencial da Meta é enviada ao navegador ou salva em tabela de clínica.
- A linha de crédito padrão é `client_direct`; o custo de conversas pertence à clínica conectada.

## Fluxo de saída

1. Agenda ou pagamento persiste a alteração principal.
2. `emitDomainEvent` grava um evento idempotente em `domain_outbox_events`.
3. O worker reivindica eventos com `FOR UPDATE SKIP LOCKED`.
4. O engine cria `notification_jobs`, respeitando automações, horário, consentimento e conexão.
5. O worker carrega os dados atuais, cancela jobs obsoletos e exige template `APPROVED`.
6. `MetaCloudProvider` envia pelo cliente Graph centralizado.
7. O webhook assinado atualiza `sent`, `delivered`, `read` ou `failed`.

`eventos_analiticos` é telemetria, nunca fila operacional.

## Fluxo de entrada

O endpoint `/api/webhooks/meta/whatsapp` valida `X-Hub-Signature-256`, deduplica o envelope, resolve o tenant por `phone_number_id`/WABA e persiste somente conteúdo mínimo. `PARAR` e `SAIR` revogam consentimentos. Respostas rápidas assinadas podem confirmar um agendamento.

## Falhas

O módulo é fail-open para agenda, e-mail e pagamentos: indisponibilidade do WhatsApp não impede o negócio principal. Retentativas usam backoff e limite de tentativas; erros permanentes não entram em loop.
