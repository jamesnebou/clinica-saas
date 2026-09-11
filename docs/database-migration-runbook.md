# Runbook de migrations, backup e restore

## FONTE CANÔNICA ATUAL — 2026-09-11

- A cadeia oficial da NexaWi Clínicas contém **55 migrations** em `supabase/migrations`, ordenadas pelo nome do arquivo e sem timestamps duplicados.
- O manifesto `nome=SHA-256` da cadeia possui SHA-256 agregado `cd4f229cdd9c0e77b89e69f4e7dc582657bb9b492a51b5d801d2fe6504d1e4a2`.
- Produção: Supabase `sitoiwxalwfybcqivutd` (`Clinica-saas`). A aplicação local de produção aponta para esse ref. O schema da Clínica é compatível com o fresh 55/55, mas o histórico remoto continua não reconciliado.
- Staging: Supabase dedicado `ojmszqqxnvmvudhzzzgo` (`NexaWi Clinicas Staging`). O projeto está vinculado localmente e foi confirmado pela API da Supabase; histórico 55/55.
- Promoção: migration nova passa por fresh e upgrade locais, staging, validação read-only e só depois pode ser aplicada em produção em janela autorizada. A aplicação compatível é promovida depois do schema necessário.
- Toda correção de schema é **fix-forward**. Migration já aplicada nunca é editada, renomeada ou removida.
- `migration repair` não aplica SQL e não é procedimento normal de promoção. Em produção só pode ser considerado em incidente/reconciliação formal, após prova read-only de equivalência física, backup confirmado e autorização explícita.
- Ownership: este repositório é dono exclusivamente das 55 migrations da NexaWi Clínicas. Migrations da NexaWi Barbearia não entram nesta cadeia.
- Status temporário das verticais: staging da Clínica é separado; produção ainda contém objetos da Clínica e da Barbearia no mesmo PostgreSQL. Até a separação, qualquer mudança produtiva exige coordenação entre as verticais.

## Regras

1. Toda alteracao usa migration nova e fix-forward.
2. Migrations aplicadas nunca sao renomeadas ou editadas.
3. O staging da Clinica e dedicado. A producao ainda e compartilhada com a Barbearia, mas cada repositorio preserva sua cadeia; nao concatenar migrations historicas.
4. `migration repair` altera somente o historico. Ele nunca substitui a execucao do SQL.
5. Nenhuma correcao massiva de dados ocorre sem diagnostico, backup e autorizacao.

## Histórico — estado auditado em 2026-09-08

> Esta seção preserva a evidência da reconciliação anterior. Ela não substitui a fonte canônica de 2026-09-11 acima.

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

## Histórico — reconciliação do banco compartilhado

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

## Staging

O projeto dedicado de staging e `ojmszqqxnvmvudhzzzgo` (`NexaWi Clinicas Staging`). Em 2026-09-11 ele foi confirmado como `ACTIVE_HEALTHY`, separado da producao e com 55/55 migrations. O dump read-only do schema confirmou todos os objetos canonicos da Clinica; `rls_auto_enable()` e seus tres grants aparecem apenas no hospedado como infraestrutura da plataforma.

Antes de qualquer escrita, repetir `projects list`, confirmar nome/ref e comparar com `supabase/.temp/project-ref`. Nunca inferir o ambiente apenas pelo hostname da aplicacao. Staging nao recebe dados clinicos reais nem credenciais/gateways produtivos.

## CI, deploy e sincronismo

- Os workflows existentes executam workers; nao existe pipeline versionado que aplique migrations automaticamente.
- O deploy da aplicacao e feito pela Vercel a partir do repositorio, enquanto migrations dependem de operacao humana. Portanto, schema e aplicacao podem ficar fora de sincronia.
- Antes de promover codigo que dependa de schema novo, o responsavel deve provar fresh/upgrade local, confirmar staging pelo ref, aplicar e validar a migration em staging, confirmar backup produtivo, aplicar a migration produtiva em janela controlada e somente entao promover a aplicacao compativel.
- Protecao de branch e regras do repositorio GitHub nao sao observaveis pelo codigo local e precisam ser confirmadas externamente.

## Pos-deploy

Confirmar versao implantada, historico de migrations, HTTP dos workers, login, troca de clinica, prontuario, criacao e reagendamento, baixa financeira e reconciliacoes somente leitura. Monitorar filas e erros durante a janela definida; diante de incompatibilidade, reverter a aplicacao e corrigir schema somente por fix-forward.

## Restore seguro

1. Criar projeto/staging ou banco local vazio; nunca apontar para producao.
2. Restaurar roles/schema/dados na ordem indicada pelo Supabase.
3. Validar contagens agregadas e integridade referencial.
4. Executar pgTAP, F0A, F0B e reconciliacoes.
5. Apontar uma instancia isolada da aplicacao para o restore e executar smoke tests.
6. Descartar o ambiente somente depois de registrar o resultado.

No restore integral local validado na F0C-R, o custom dump precisou ser aplicado
com `supabase_admin`, `--no-owner` e preservacao dos privilegios. O usuario
`postgres` nao possuia permissao para todos os objetos gerenciados, e
`--no-privileges` removeu grants necessarios. A evidencia e os hashes estao em
`docs/f0c-r-restore-homologation.md`.

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
