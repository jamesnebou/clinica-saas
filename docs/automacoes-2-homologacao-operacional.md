# Motor de Automacao 2.0 - homologacao operacional

## Scheduler

O endpoint server-side e `GET /api/cron/automations`. Ele aceita somente `Authorization: Bearer <CRON_SECRET>`.

O projeto esta no plano Vercel Hobby. O worker de producao e acionado pelo GitHub Actions em `.github/workflows/automations-cron.yml`, aproximadamente a cada cinco minutos. O workflow tambem aceita execucao manual por `workflow_dispatch`.

O secret `CRON_SECRET` deve existir com o mesmo valor em dois lugares:

1. Vercel, como variavel server-side do ambiente Production;
2. GitHub, em **Settings > Secrets and variables > Actions > Repository secrets**.

O workflow usa `curl --fail-with-body`, timeout, retry limitado e um grupo de `concurrency` que impede dois workers deste workflow em paralelo. O segredo fica no ambiente do step e nao deve ser impresso. O GitHub Actions nao oferece garantia de horario exato; sob carga, a execucao agendada pode sofrer atraso.

Para validar depois do deploy:

1. abra **Actions > Automation Worker > Run workflow**;
2. confirme resposta HTTP 200 e JSON com `ok: true`;
3. consulte a ultima linha de `automation_worker_executions`;
4. confirme que uma execucao sem itens retorna contadores zerados, sem erro;
5. mantenha `AUTOMATION_ALLOW_HIGH_RISK_ACTIONS=false`.

Nao adicione o segredo na URL, em query string, em `NEXT_PUBLIC_*` ou no arquivo YAML.

Referencias oficiais: [uso e precos de Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) e [gerenciamento de Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Variaveis Vercel

| Variavel | Obrigatoria | Escopo | Exemplo seguro | Ausente |
| --- | --- | --- | --- | --- |
| `CRON_SECRET` | Sim | Server-side | segredo aleatorio longo | endpoint responde 401 e o worker nao executa |
| `AUTOMATION_ALLOW_HIGH_RISK_ACTIONS` | Sim | Server-side | `false` | acoes sensiveis permanecem bloqueadas |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Server-side | chave service role | worker nao acessa claims/RPCs |
| `SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL` | Sim | Server-side | `https://projeto.supabase.co` | cliente admin nao inicializa |
| `RESEND_API_KEY` | Apenas para e-mail | Server-side | chave do Resend | acao de e-mail fica indisponivel/falha controlada |
| `RESEND_FROM_EMAIL` | Apenas para e-mail | Server-side | `NexaWi <avisos@dominio.com>` | envio nao possui remetente valido |

Nunca crie `NEXT_PUBLIC_CRON_SECRET` nem exponha service role no navegador.

## Respostas do endpoint

- Sem `Authorization` ou com Bearer incorreto: HTTP 401 e nenhum claim executado.
- Com `Authorization: Bearer <CRON_SECRET>` correto: HTTP 200 com o resumo do lote.
- Lote vazio: HTTP 200, `eventsFound`, `waitsFound` e `runsFound` iguais a zero.
- Falha fatal de banco/RPC: HTTP 500; o `curl --fail-with-body` faz o job falhar e o retry cobre somente a janela configurada.

## Homologacao isolada

O script usa o codigo real do motor, aceita exclusivamente a clinica com slug demo e `metadata.demo = true`, mantem high-risk em `false`, pausa as automacoes temporarias e remove os registros criados ao final. Ele nao chama o worker global, evitando consumir eventos de outras clinicas.

```powershell
$env:AUTOMATION_HOMOLOGATION_CONFIRM='demo-isolado'
node --env-file=.env.local --experimental-loader ./scripts/automation-alias-loader.mjs ./scripts/homologate-automation-engine.mjs
```

Para homologar envio real, informe tambem um destinatario controlado:

```powershell
$env:AUTOMATION_HOMOLOGATION_EMAIL='destinatario-controlado@dominio.com'
```

O resultado e JSON e diferencia `PASS`, `FAIL` e `NOT_EXECUTED`. Teste automatizado ou mock nao deve ser relatado como homologacao real.

## Concorrencia e falha parcial

- Eventos, waits e runs sao claimed em transacoes com `FOR UPDATE SKIP LOCKED`.
- Estados `processing`/`running` abandonados voltam a ser elegiveis depois de dez minutos.
- O batch e limitado entre 1 e 100; padrao 25.
- Cada evento/versao possui uma unica run; cada acao possui receipt por chave deterministica.
- Falha de uma unidade nao interrompe o restante do batch; a unidade entra em retry ou falha permanente.
- O negocio grava no outbox na propria transacao; o worker assincrono nao bloqueia a operacao original.

## High-risk

Permanecem bloqueadas por padrao:

- `agenda.update_status`;
- `finance.create_receivable`.

Nao habilite a flag em producao antes de mover toda mutacao high-risk para services canonicos com transicoes e auditoria especificas.
