# Motor de Automacao 2.0 - homologacao operacional

## Scheduler

O endpoint server-side e `GET /api/cron/automations`. Ele aceita somente `Authorization: Bearer <CRON_SECRET>`.

O projeto esta no plano Vercel Hobby. Nesse plano, cron nativo com frequencia de poucos minutos nao e compativel: a frequencia minima e diaria e o horario pode variar. Por isso, `vercel.json` nao recebe um cron de cinco minutos nesta etapa.

Para operacao comercial, escolha uma destas estrategias:

1. usar um scheduler externo confiavel a cada cinco minutos, chamando o endpoint com Bearer; ou
2. migrar o projeto para Vercel Pro e adicionar `{"path":"/api/cron/automations","schedule":"*/5 * * * *"}` sem remover os crons existentes.

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
