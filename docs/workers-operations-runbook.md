# Runbook operacional de workers

| Worker | Scheduler | Frequencia | Auth | Retry/idempotencia | Status |
|---|---|---|---|---|---|
| Automacoes 2.0 | GitHub Actions `automations-cron.yml` | ~5 min | Bearer `CRON_SECRET` | claims/`SKIP LOCKED`, receipts, retry persistente | operacional no codigo |
| Meta CAPI | GitHub Actions `meta-capi-cron.yml` | ~5 min | Bearer `CRON_SECRET` | claim atomica, event_id, retry/dead | operacional no codigo |
| Notificacoes/WhatsApp | GitHub Actions `operational-workers-cron.yml` | ~5 min | Bearer `CRON_SECRET` | claims de outbox/jobs, max attempts, backoff, `job_id` unico | scheduler criado na F0C |
| Expiracao da loja | GitHub Actions `operational-workers-cron.yml` | ~5 min | Bearer `CRON_SECRET` | RPC transacional ignora pedidos ja finalizados | scheduler criado na F0C |
| Financeiro recorrente | Vercel Cron | diario 06:00 UTC | Bearer `CRON_SECRET` fornecido pela Vercel | RPC gera somente competencias devidas | operacional no codigo |
| Asaas webhook | evento do provider | sob demanda | token do webhook | payment id e operacoes canonicas idempotentes | operacional |
| InfinitePay webhook | evento do provider | sob demanda | assinatura/token configurado | referencia externa e liquidacao canonica | operacional |

## Requisitos externos

- Configurar o mesmo `CRON_SECRET` na Vercel e em GitHub Actions Secrets.
- Habilitar os workflows no branch padrao.
- Confirmar que o dominio `https://clinicas.nexawi.com.br` aponta para o deploy atual.
- GitHub cron e best-effort; atrasos ocasionais devem ser tolerados pelos claims e pela idempotencia.

## Diagnostico

### Modelos WhatsApp e Coexistence

- O painel consulta somente a conexao primaria e o WABA atual. Modelos de conexoes antigas permanecem no banco para historico, sem contar como prontos.
- A sincronizacao usa a listagem completa da Meta. Modelos ausentes ficam marcados como DELETED, sem apagar registros.
- Ao processar um job com modelo pendente/pausado/em recurso ou ausente, o worker sincroniza a conexao uma vez por lote e reavalia o modelo.
- Enquanto houver analise, o job volta para retry por pelo menos uma hora sem consumir tentativa de entrega. Uma falha na consulta tambem preserva tentativas, mas aparece como retryScheduled e HTTP 422.
- O log notification_worker_completed registra contadores; succeeded inclui processamento de outbox e NAO comprova entrega. Confirmar delivered/read em whatsapp_messages.

### Frequencia real do scheduler

O plano Vercel Hobby nao permite um cron de cinco minutos. Manter o financeiro diario em vercel.json. A expressao do GitHub solicita cinco minutos, mas nao garante esse intervalo; foram observados intervalos de horas em producao.

Para recuperar uma fila, usar Run workflow em main no Operational Workers. Nao repetir continuamente sem verificar o resultado. Para SLA de lembretes, configurar um agendador externo confiavel com o mesmo Bearer CRON_SECRET ou, apos autorizacao de mudanca de plano, Vercel Pro. Nao publicar secrets em URLs nem ativar um segundo scheduler sem revisar o existente.

### Verificacao de execucao

1. Verificar a ultima execucao no GitHub Actions/Vercel.
2. Confirmar HTTP 200 sem registrar o secret.
3. Executar as consultas de `docs/operations-diagnostics.sql`.
4. Investigar crescimento de `pending/retry`, locks antigos, `dead/failed` e waits vencidos.
5. Correlacionar por IDs tecnicos; nao incluir telefone, e-mail, token ou conteudo clinico em logs.

## Falha e recuperacao

- **401:** conferir presenca e igualdade do secret nos dois executores.
- **5xx:** manter retry controlado, consultar estado persistente e corrigir a causa antes de reprocessar.
- **Timeout:** nao assumir falha; a proxima execucao deve reclamar apenas itens liberados/abandonados.
- **Fila presa:** pausar scheduler, identificar locks antigos, validar worker health e liberar somente pelo RPC/fix-forward previsto.
- **Duplicidade:** preservar registros, confirmar chaves idempotentes e nunca apagar historico para ocultar o evento.

## Outbox booking.created

O evento e produzido atomicamente pela F0B. O consumidor WhatsApp processa eventos configurados; o consumidor de automacoes recebe sua propria copia quando emitida para `automation`. Eventos sem integracao habilitada sao finalizados conscientemente, sem impedir de garantir entrega externa inexistente.

## Health check minimo

- Banco responde e migrations esperadas existem.
- Schedulers possuem execucao recente.
- Idade do item pendente mais antigo nao cresce continuamente.
- Nao existem `running`/locks acima da janela documentada.
- Taxa de `failed/dead` e revisada antes de reprocessamento.
