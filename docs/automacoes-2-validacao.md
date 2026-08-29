# Motor de Automação 2.0: validação

## Pré-requisitos

1. Aplicar `20260830100000_automation_engine_v2.sql`.
2. Aplicar `20260830110000_automation_engine_v2_hardening.sql` mesmo quando a migration base já tiver sido tentada.
3. Configurar `CRON_SECRET` no ambiente do worker.
4. Configurar provedores reutilizados pelo produto: e-mail, Notification Engine/WhatsApp e Financeiro 2.0.
5. Manter ações de alto risco desabilitadas até validação operacional.

## Validação automatizada

Executar:

```bash
npm test
npm run lint
npm run build
git diff --check
```

A suíte cobre catálogo, operadores, condições, referências seguras, limites, compilação, dry-run, versões, RLS, cross-tenant, outbox, locks, retries, waits, timezone, cancelamento, permissões, idempotência, Notification Engine, Financeiro 2.0 e Demo 2.0.

## Roteiro funcional

1. Entrar como owner e abrir `/dashboard/automacoes`.
2. Criar um fluxo a partir de modelo e confirmar que nasce pausado.
3. Alterar gatilho, condições, espera e ação; executar o dry-run.
4. Tentar publicar definição inválida e confirmar bloqueio legível.
5. Publicar versão válida e confirmar versão ativa.
6. Emitir evento real do domínio e executar o cron.
7. Conferir run, timeline, snapshot mínimo e resultado da ação.
8. Reprocessar o mesmo evento e confirmar ausência de duplicidade.
9. Criar espera curta, confirmar estado `waiting` e retomada pelo scheduler.
10. Pausar a automação e confirmar que eventos novos não iniciam runs.
11. Cancelar uma run em espera e confirmar que ela não retoma.
12. Aplicar filtros e paginação do histórico.

## Cenários externos

- Sem conexão WhatsApp: passo `unavailable`, com diagnóstico.
- Template não aprovado: passo `unavailable`, sem tentativa de envio direto.
- Provedor de e-mail indisponível: retry e erro auditável.
- Ação sensível sem feature flag: bloqueio explícito.
- Limite do plano atingido: criação/publicação/run bloqueada com mensagem comercial.

## Critério de aceite

O motor está apto para produção quando migrations forem aplicadas em homologação, todos os comandos passarem, cron executar com concorrência, um fluxo de cada integração for validado ponta a ponta e a equipe confirmar políticas de ações de alto risco. Nenhum teste de integração deve usar dados de outra clínica ou credenciais de produção.
