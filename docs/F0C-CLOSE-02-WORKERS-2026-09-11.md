# F0C-CLOSE-02 - Workers, schedulers e sinalização operacional

**Projeto:** NexaWi Clínicas  
**Data:** 2026-09-11  
**Escopo:** código e configuração versionada; nenhuma chamada a worker remoto, banco, Meta, gateway, Resend ou Vercel foi executada.

## 1. Resultado

- `F0C-05`: **CLOSED** no código e na configuração versionada.
- `AUD-P1-02`: **CLOSED**. Falha real por item não pode mais resultar em HTTP 200 saudável.
- `AUD-P2-08`: **CLOSED**. Dispatch produtivo fora de `main` falha antes de qualquer request.
- Migration: **não necessária**.
- Ativação operacional: exige configurar o GitHub Environment `production` conforme a seção 8.

Sem essa configuração externa, os workflows falham fechados e não chamam endpoint algum. Isso é uma interrupção segura, não um fallback para produção.

## 2. Arquitetura anterior

As rotas de automações, notificações e Meta CAPI recebiam resumos com `failures`/`errors`/`retried`, mas respondiam sempre `HTTP 200` e `ok=true` quando não ocorria uma exceção fatal. Como os schedulers dependiam de `curl --fail-with-body`, falhas internas reais permaneciam verdes no GitHub Actions.

Também existiam três implementações de autenticação por `CRON_SECRET`, com comparação e respostas diferentes. Os workflows tinham URL produtiva literal e `workflow_dispatch` podia ser iniciado a partir de qualquer ref sem uma barreira anterior ao request.

## 3. Inventário de workers

| Worker/rota | Scheduler e frequência | Concorrência/retry/timeout | Fila e idempotência | Métricas/estado |
|---|---|---|---|---|
| `/api/cron/automations` | GitHub Actions, `*/5 * * * *` | grupo `automations-worker-production`; curl retry 2; connect 10 s; request 50 s; route 60 s | claims com `SKIP LOCKED`; consumo único por evento/versão; receipts e task keys determinísticos; retry persistido, máximo 5 | contadores de eventos/waits/runs e contrato comum; health persistido em `automation_worker_executions` |
| `/api/cron/notifications` | GitHub Actions, `4-59/5 * * * *` | grupo `operational-workers-production`; curl retry 2; connect 10 s; request 50 s; route 60 s | claims de outbox/jobs com `SKIP LOCKED`; jobs deduplicados; mensagem única por `job_id`; retry/dead persistidos | `outbox`, `jobs`, `errors` e contrato comum |
| `/api/cron/meta-capi` | GitHub Actions, `2-57/5 * * * *` | grupo `meta-capi-worker-production`; curl retry 2; connect 10 s; request 50 s; route 60 s | claim atômico; evento único por `event_name/event_id`; status `sent/retry/dead`; deduplicação Meta por `event_id` | `claimed`, `sent`, `retried` e contrato comum |
| `/api/cron/store-expirations` | GitHub Actions, `4-59/5 * * * *` | grupo `operational-workers-production`; curl retry 2; connect 10 s; request 50 s; route 60 s | RPC atualiza somente reservas ainda expiradas/elegíveis; repetição não reexpira item concluído | `expiredOrders` e contrato comum; falha RPC é fatal |
| `/api/cron/finance-recurring` | Vercel Cron, `0 6 * * *` | timeout da route 60 s; retry/concurrency externos não definidos em `vercel.json` | RPC bloqueia recorrências com `FOR UPDATE`; origem por recorrência/data é única e inserts usam conflito idempotente | `generated` e contrato comum; falha RPC é fatal |

O scheduler interno `enqueue_due_finance_automation_events` continua executado no início do worker de automações e usa a mesma cadeia idempotente de outbox.

Não foi encontrado outro scheduler versionado. Backlog, idade do item mais antigo e dead letters continuam consultáveis nos status já persistidos, mas não foram adicionadas queries agregadas a cada execução para evitar custo e mudança de schema nesta fase.

## 4. Autenticação padronizada

Todas as cinco rotas usam `src/lib/cron/auth.js`, marcado `server-only`.

- `CRON_SECRET` é obrigatório e ausência falha fechada;
- o header esperado é exatamente `Authorization: Bearer <secret>`;
- a comparação usa hashes SHA-256 de tamanho fixo com `timingSafeEqual`;
- resposta uniforme: `HTTP 401`, `{ "ok": false, "error": "Não autorizado." }` e `Cache-Control: no-store`;
- nenhum segredo é registrado ou devolvido;
- o helper não é importado por Client Components.

## 5. Contrato HTTP novo

Todas as respostas saudáveis de worker incluem:

```json
{
  "ok": true,
  "partial": false,
  "processed": 0,
  "succeeded": 0,
  "skipped": 0,
  "retryScheduled": 0,
  "failed": 0,
  "dead": 0
}
```

Regras:

| Situação | HTTP | `ok` | `partial` |
|---|---:|---:|---:|
| sem erro, inclusive lote vazio ou somente skips normais | 200 | true | false |
| uma ou mais falhas por item, com retry ou permanente | 422 | false | true apenas se outro item teve sucesso/skip |
| exceção fatal do worker | 500 | false | false/ausente |

`skipped` cobre condições normais como evento sem automação aplicável, automação cancelada e mensagem que deixou de ser aplicável. Esses casos não tornam o scheduler vermelho.

## 6. Idempotência e retry

A mudança de sinal HTTP foi aplicada somente depois de confirmar proteções persistentes:

- automações: claims exclusivos, consumo por evento/versão, runs únicos, action receipts e task keys;
- notificações: outbox/job com claim exclusivo, upsert de job e unicidade de `whatsapp_messages.job_id`;
- Meta CAPI: status persistido e `event_id` estável;
- financeiro recorrente: lock de recorrência e origem única;
- expiração de loja: transição condicionada ao estado elegível.

Falhas por item usam HTTP 422 para que `curl --retry` não transforme a execução em verde após uma segunda chamada vazia. Exceções fatais continuam em HTTP 500 e podem aproveitar o retry de transporte. Itens já concluídos não voltam aos claims; retries de negócio mantêm backoff e limites existentes. Nenhum payload, regra de tracking, template, receipt, lock ou limite de tentativas foi removido.

Limite inerente: provedores externos não oferecem transação atômica com o PostgreSQL. Uma queda exatamente depois de o provedor aceitar uma mensagem e antes de persistir o identificador continua sendo um risco residual de entrega pelo menos uma vez; esta tarefa não alterou essa arquitetura.

## 7. Isolamento production/staging

Os três workflows agora:

- usam GitHub Environment `production`;
- recebem a URL por `vars.PRODUCTION_APP_URL`;
- recebem a credencial por `secrets.PRODUCTION_CRON_SECRET`;
- falham se URL ou secret estiver ausente;
- validam a URL exatamente contra `https://clinicas.nexawi.com.br` antes de disponibilizar o secret ao `curl`;
- não possuem fallback para produção ou staging;
- recusam `workflow_dispatch` quando `github.ref != refs/heads/main` antes do request;
- preservam schedules, concurrency e retry.

Não foi criado scheduler automático de staging. Uma homologação futura deve usar workflow/environment separado, URL própria e credencial própria; nunca deve reutilizar `PRODUCTION_CRON_SECRET`.

O cron financeiro permanece no projeto Vercel de produção e usa o `CRON_SECRET` desse ambiente. Preview/staging não recebe scheduler novo nesta tarefa.

## 8. Configuração manual obrigatória no GitHub

Antes de reativar/validar os schedules:

1. criar ou confirmar o Environment `production` no repositório GitHub;
2. configurar a variable `PRODUCTION_APP_URL` exatamente como `https://clinicas.nexawi.com.br`;
3. configurar o environment secret `PRODUCTION_CRON_SECRET` com o mesmo valor atualmente usado por `CRON_SECRET` na aplicação Production, sem imprimir ou rotacionar o valor;
4. opcionalmente exigir aprovação/proteção de branch no Environment;
5. executar manualmente um workflow a partir de `main` e confirmar HTTP 200 em lote saudável;
6. confirmar que tentativa manual a partir de outra branch falha no passo `Validar alvo produtivo`.

Nenhuma dessas configurações foi criada ou lida nesta execução.

## 9. Testes

Foram adicionadas regressões para:

- secret ausente, vazio e incorreto;
- autenticação única e server-only nas cinco rotas;
- `200/ok=true` em lote saudável;
- `422/ok=false/partial=true` em falha parcial retriável;
- `422/ok=false` em dead/permanent;
- skip normal sem falso positivo;
- propagação do status classificado pelas rotas;
- URL ausente com fail-closed;
- dispatch fora de `main` bloqueado;
- allowlist do host produtivo;
- secret produtivo separado;
- timeout, retry e concurrency do Meta CAPI.

Resultados finais:

| Comando | Resultado |
|---|---|
| `npm test` | PASS, 405/405 |
| `npm run lint` | PASS |
| `npm run build` | PASS, 82 páginas; o `.next` padrão estava bloqueado pelo OneDrive e a repetição usou `NEXT_DIST_DIR=.next-f0c-close-02` |
| `git diff --check` | PASS |

O diretório temporário do build foi removido. Nenhum teste chamou produção ou serviço externo.

## 10. Limitações e próximos controles

- Não há alerta externo específico por idade de backlog; o GitHub Action vermelho agora é o sinal imediato de falha por lote.
- O workflow não mede capacidade para 100/1.000 clínicas.
- O cron Vercel financeiro não possui concurrency/retry versionados além da idempotência da RPC.
- A existência e as proteções do GitHub Environment precisam de confirmação humana.
- F0C-02, F0C-04, proteção antiabuso pública e separação física Clínica/Barbearia permanecem fora do escopo.

## 11. Rollback

Não há alteração de banco. Em incidente, reverter somente o commit da aplicação/workflows restaura as rotas anteriores. As variables/secrets do GitHub Environment podem permanecer cadastradas, pois não produzem efeito sem workflow que as use. Não executar migration repair, rollback de migration ou rotação de segredo como parte desse rollback.
