# Operação e observabilidade

## Worker

Chamar `GET /api/cron/notifications` com `Authorization: Bearer <CRON_SECRET>` em intervalo de 1 a 5 minutos. Em Vercel Hobby, não adicionar cron frequente que invalide o deploy; usar scheduler externo seguro ou migrar o projeto para plano compatível. Nunca expor `CRON_SECRET` no cliente.

## Painel

`/dashboard/whatsapp` possui conexão, automações, mensagens, templates e saúde. Apenas owner/admin gerencia conexão e regras. Outros papéis dependem da permissão de seção e da capability do plano.

## Sinais de saúde

- WABA/número e webhook ativos.
- Templates aprovados.
- Jobs pendentes e falhas recentes.
- Último webhook e última mensagem.
- Qualidade e throughput retornados pela Meta.

## Alertas mínimos

- fila mais antiga acima de 10 minutos;
- aumento de `whatsapp_failed`;
- conexão `degraded`, `blocked` ou `error`;
- template `REJECTED`, `PAUSED` ou `DISABLED`;
- ausência de webhook por período incompatível com o volume.
