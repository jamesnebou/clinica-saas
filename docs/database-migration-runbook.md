# Runbook de migrations, backup e restore

## Regras

1. Toda alteracao usa migration nova e fix-forward.
2. Migrations aplicadas nunca sao renomeadas ou editadas.
3. O projeto Supabase e compartilhado por Clinica e Barbearia; a cadeia canonica precisa conter migrations dos dois produtos.
4. `migration repair` altera somente o historico. Ele nunca substitui a execucao do SQL.
5. Nenhuma correcao massiva de dados ocorre sem diagnostico, backup e autorizacao.

## Estado auditado

- 52 migrations ativas no repositorio da Clinica.
- 13 migrations `REMOTE_ONLY`, todas localizadas com o SQL original no repositorio da Barbearia.
- 45 migrations `LOCAL_ONLY` no historico, incluindo a fix-forward F0C. A maioria dos objetos anteriores existe fisicamente no remoto por aplicacao manual, mas o historico precisa de reconciliacao controlada.
- O remoto possui 32 tabelas adicionais da Barbearia; isso e esperado no banco compartilhado.
- Drift confirmado: constraint de token WhatsApp, texto da funcao de pipeline CRM e agregacao da funcao de comissoes. A migration `20260908120000` corrige os tres.

## Criacao e validacao local

1. Criar migration com timestamp UTC valido e nome descritivo.
2. Revisar locks, backfills, constraints, grants, RLS e dependencias.
3. Executar `npx supabase@latest db reset --local`.
4. Executar `npx supabase@latest test db`.
5. Executar `npm run lint`, `npm test`, `npm run build` e `git diff --check`.
6. Fazer dump de schema e revisar o diff antes de qualquer ambiente remoto.

## Reconciliacao do historico compartilhado

1. Congelar mudancas de schema nos dois repositorios.
2. Confirmar que cada versao remota possui o arquivo SQL original na cadeia canonica combinada.
3. Comparar dump local fresh com dump remoto, separando objetos `barbearia_*` esperados.
4. Para uma versao `LOCAL_ONLY`, marcar `applied` somente se o objeto e a definicao fisica correspondentes forem comprovados.
5. Aplicar de verdade migrations cujo schema ainda nao exista; somente depois registrar o historico.
6. Nunca marcar `reverted` uma migration cuja estrutura continua ativa.
7. Executar `db push --dry-run` e exigir que liste apenas migrations realmente pendentes.

As cadeias historicas nao podem ser simplesmente concatenadas: o fresh reset combinado falhou porque migrations antigas de Clinica e Barbearia criam `criar_pedido_loja` com a mesma assinatura e nomes de parametro diferentes. A estrategia aprovada deve ser:

1. gerar dump de schema do remoto compartilhado sem dados;
2. revisar e testar esse dump como baseline em banco vazio;
3. criar um repositorio/cadeia unificada iniciada no baseline;
4. manter as migrations historicas nos repositorios originais como arquivo auditavel;
5. reconciliar o historico remoto somente depois de homologar o baseline e obter autorizacao.

## Antes de migration critica

1. Confirmar saude e espaco do banco.
2. Registrar commit e lista de migrations pendentes.
3. Confirmar backup da plataforma e criar dump logico cifrado fora do repositorio.
4. Registrar contagens agregadas de clinicas, clientes, prontuarios, agendamentos, recebiveis e liquidacoes.
5. Pausar schedulers que possam escrever nas tabelas afetadas.
6. Aplicar uma migration por vez na ordem cronologica.
7. Validar objetos, grants, RLS e constraints.
8. Executar smoke tests e reconciliacoes somente leitura.
9. Reativar schedulers e monitorar filas.

## Backup

- Verificar no Dashboard do Supabase o plano, horario do backup, retencao e disponibilidade de PITR; essas capacidades nao sao inferidas pelo codigo.
- Para migration critica, gerar dump logico de schema e dados com `supabase db dump` ou `pg_dump`, sem versionar dados reais.
- Guardar hash, data, project ref, commit e responsavel pelo backup.
- Um dump sem teste de restauracao nao e considerado recuperavel.

## Restore seguro

1. Criar projeto/staging ou banco local vazio; nunca apontar para producao.
2. Restaurar roles/schema/dados na ordem indicada pelo Supabase.
3. Validar contagens agregadas e integridade referencial.
4. Executar pgTAP, F0A, F0B e reconciliacoes.
5. Apontar uma instancia isolada da aplicacao para o restore e executar smoke tests.
6. Descartar o ambiente somente depois de registrar o resultado.

## Cenários de recuperacao

### A. Migration falhou antes do commit

Confirmar rollback no log e no historico, manter workers pausados, corrigir via nova migration quando necessario e repetir em staging.

### B. Migration concluiu e a aplicacao falhou

Nao desfazer schema automaticamente. Reverter a aplicacao para o commit compativel ou publicar fix-forward, validar compatibilidade e monitorar erros.

### C. Backfill incorreto

Interromper writers afetados, preservar evidencias, comparar com backup e criar correcao deterministica auditavel. Nao executar `UPDATE` manual sem script revisado.

### D. Restore remoto necessario

Declarar incidente, bloquear escrita, escolher backup/PITR confirmado, restaurar em ambiente paralelo, validar e somente entao planejar troca controlada.

### E. Worker processou eventos incorretamente

Pausar o scheduler, bloquear novas claims, identificar IDs por estado e timestamps, corrigir por operacao idempotente/compensatoria e reativar em lote pequeno.

## Rollout preparado para F0A/F0B/F0C

Congelar schema; confirmar commit; confirmar backup; reconciliar historico; validar paridade; aplicar F0A; smoke F0A; aplicar F0B; reconciliar financeiro; aplicar F0C; smoke de agenda, financeiro, CRM e WhatsApp; validar gateways sem cobranca real; monitorar filas; liberar operacao.

## Rollback operacional

O rollback padrao e da aplicacao, nao de migrations destrutivas. Schema recebe fix-forward. Restore integral e ultima medida e exige ambiente paralelo validado.
