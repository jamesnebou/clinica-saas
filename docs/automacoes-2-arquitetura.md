# Motor de Automação 2.0: arquitetura

## Objetivo

O Motor 2.0 executa fluxos multi-tenant a partir de eventos canônicos da NexaWi Clínicas. Ele não substitui CRM, Agenda, Financeiro, Notification Engine ou WhatsApp. O motor orquestra esses módulos por contratos explícitos, registra cada decisão e impede que uma automação altere dados de outra clínica.

## Fluxo operacional

1. Uma operação de domínio grava seu dado e um evento em `domain_outbox_events` na mesma transação.
2. O cron chama `/api/cron/automations` com `CRON_SECRET`.
3. O worker reivindica eventos com lock concorrente e `SKIP LOCKED`.
4. O evento é normalizado pelo catálogo central e o contexto da entidade é resolvido com `clinica_id` obrigatório.
5. Automações ativas para o tipo de evento são avaliadas contra sua versão publicada e imutável.
6. Cada execução recebe um snapshot, correlação, causalidade e profundidade.
7. Condições, branches, esperas e ações são processadas em sequência.
8. Esperas persistem em `automation_waits`; o scheduler retoma a mesma run.
9. Ações externas usam recibos idempotentes em `automation_action_receipts`.
10. Runs, steps, auditoria e métricas preservam o resultado para diagnóstico.

## Componentes

- `registry/events.mjs`: catálogo dos eventos aceitos e seus campos seguros.
- `registry/actions.mjs`: catálogo de ações, parâmetros, capacidades e risco.
- `registry/operators.mjs`: operadores permitidos pelo avaliador de condições.
- `validation.mjs`: valida schema, referências, limites e capacidades antes da publicação.
- `compiler.mjs`: compila a definição validada para um plano determinístico.
- `context.js`: carrega somente o contexto necessário e sempre pelo tenant.
- `engine.js`: cria runs, processa passos, retries, waits e conclusão.
- `executor.js`: adaptadores para CRM, Agenda, Financeiro, e-mail, WhatsApp e tarefas.
- `scheduler.js`: coordena outbox, waits e runs reivindicadas.
- `service.js`: leitura paginada para dashboard e observabilidade.

## Modelo de dados

- `automations`: identidade, status e rascunho editável.
- `automation_versions`: versões publicadas e imutáveis.
- `automation_runs`: uma execução vinculada ao evento e à versão.
- `automation_run_steps`: timeline de decisões e ações.
- `automation_waits`: retomadas duráveis.
- `automation_event_consumptions`: deduplicação evento-versão.
- `automation_action_receipts`: exatamente uma entrega lógica por run e passo.
- `automation_tasks`: tarefas internas geradas pelo motor.

## Operação

O cron recomendado é frequente e idempotente. Execuções concorrentes são suportadas pelos RPCs de claim. Falhas transitórias retornam à fila com backoff; falhas permanentes ficam visíveis na timeline. Publicar cria nova versão sem alterar runs já iniciadas. Pausar impede novos disparos, mas não apaga histórico.

## Limitações explícitas

- Ações de alto risco dependem de `AUTOMATION_ALLOW_HIGH_RISK_ACTIONS=true`.
- WhatsApp exige conexão oficial e template aprovado; ausência vira `unavailable`, não sucesso falso.
- O e-mail depende da infraestrutura central já configurada.
- O motor não executa código arbitrário, SQL fornecido pelo usuário ou caminhos fora do catálogo.
- A listagem resume as 50 runs mais recentes; o detalhe usa histórico paginado no servidor.
