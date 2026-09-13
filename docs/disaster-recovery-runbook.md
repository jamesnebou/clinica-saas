# Runbook de disaster recovery

## Escopo e regra de segurança

Este runbook cobre NexaWi Clínicas: PostgreSQL, Auth, Storage e validação da aplicação. O restore deve ocorrer primeiro em ambiente local descartável ou projeto remoto isolado confirmado. Nunca restaurar diretamente sobre Production.

Refs protegidos pelos scripts versionados:

- Production: `sitoiwxalwfybcqivutd`.
- Staging: `ojmszqqxnvmvudhzzzgo`.

`scripts/dr/safety.mjs` bloqueia ambos os refs. Um alvo remoto diferente exige `DR_ISOLATED_REMOTE_CONFIRM=ISOLATED:<ref>` e o restore exige adicionalmente `DR_CONFIRM_RESTORE=RESTORE:<ref>`. Essas confirmações não tornam seguro um alvo incorreto: nome, organização e ref devem ser revisados por duas pessoas antes de qualquer comando remoto.

## Conteúdo mínimo do backup

### Database

O backup deve abranger schema, dados, migrations, funções, triggers, índices, constraints, grants, RLS, policies, sequences/identity e generated columns. Dados críticos incluem clínicas, memberships, clientes, prontuários, consentimentos, fotos, agenda, procedimentos, profissionais, financeiro, CRM, automações, WhatsApp, integrações e logs/auditoria necessários à operação.

### Auth

Preservar usuários, identities, providers, e-mail, metadata relevante e o vínculo entre `auth.users` e `public.usuarios_clinica`. Sessões existentes, OTPs e tokens temporários não são um mecanismo confiável de recuperação; após restore, exigir novo login e testar recuperação de senha.

Um dump de `auth.users` sozinho não basta. `auth.identities`, ownership, triggers e vínculos públicos também precisam ser restaurados. Em Supabase hospedado, usar o procedimento suportado pelo plano/projeto e validar compatibilidade de versão antes de importar diretamente schemas gerenciados.

### Storage

O PostgreSQL contém metadados, não o conteúdo físico dos objetos. O backup precisa exportar separadamente:

| Bucket | Criticidade | Acesso | Tratamento |
|---|---|---|---|
| `cliente-fotos` | CRITICAL | PRIVATE | backup físico obrigatório, hash, signed URL e RLS |
| `clinica-logos` | REBUILDABLE | PUBLIC | backup recomendado, hash e URL pública |
| `clinica-site-images` | REBUILDABLE | PUBLIC | backup recomendado, hash e URL pública |

`scripts/dr/storage-archive.mjs` preserva `bucket/path`, gera manifesto e SHA-256, suporta `DR_DRY_RUN=true`, recusa destino existente e usa `upsert: false`.

## Sequência canônica

1. Declarar incidente, responsável, horário e sistemas afetados.
2. Conter writers, workers e deploys somente quando autorizado pelo plano de incidente.
3. Preservar logs, hashes, refs, SHA da aplicação e timestamps.
4. Selecionar backup/PITR anterior ao incidente e registrar sua origem.
5. Criar alvo vazio e isolado; confirmar nome, organização e ref.
6. Aplicar as 55 migrations canônicas para reconstruir schema, grants e RLS.
7. Restaurar Auth com role/ownership compatíveis e conferir identities/providers.
8. Restaurar dados públicos, sequences/identity e generated columns conforme o dump; então conferir memberships.
9. Restaurar metadados Storage no banco, se fizerem parte do artefato.
10. Restaurar objetos físicos dos três buckets e validar SHA-256.
11. Reaplicar secrets e configurações externas pelo secret manager, nunca pelo dump.
12. Apontar uma instância isolada da aplicação para o restore.
13. Executar integridade, pgTAP, F0A, F0B, Demo, RLS e smoke funcional.
14. Comparar contagens, hashes, filas e reconciliações.
15. Somente após aprovação formal planejar promoção/cutover e comunicação.

## Laboratório local reproduzível

Pré-requisitos: Docker, Node, Supabase CLI, cadeia de 55 migrations e stack local dedicado. A senha sintética deve existir apenas no processo em `DR_TEST_PASSWORD`.

```powershell
$env:DR_PROJECT_REF = "clinica-estetica-dr-local"
$env:DR_ARCHIVE_DIR = "$env:TEMP\nexawi-dr"
$env:DR_TEST_PASSWORD = "<senha-sintetica-temporaria>"
$env:SUPABASE_URL = "<URL-local>"
$env:SUPABASE_ANON_KEY = "<anon-local>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-local>"

node scripts/dr/local-lab.mjs seed
node scripts/dr/storage-archive.mjs backup
```

Gerar custom dump de `public.*`, `auth.users` e `auth.identities`, excluindo snapshots Demo efêmeros. Guardar SHA-256 do dump. Recriar o stack com as migrations, limpar somente o banco descartável, restaurar Auth e public com roles compatíveis e `--disable-triggers` para o bloco público quando necessário por FKs circulares.

```powershell
$env:DR_CONFIRM_RESTORE = "RESTORE:clinica-estetica-dr-local"
node scripts/dr/storage-archive.mjs restore
node scripts/dr/local-lab.mjs verify
npx supabase test db --local
```

Depois executar os runners de integração e uma instância local da aplicação. A prova só é válida se hashes e acessos passarem após o restore.

## Validação obrigatória

- Histórico com 55 migrations.
- Catálogo de tabelas, views, funções, triggers, índices, constraints e policies.
- Todas as tabelas públicas esperadas com RLS.
- Generated columns calculadas pelo PostgreSQL.
- Contagens e SHA-256 iguais ao baseline.
- Owner acessa somente seus tenants e consegue trocar entre memberships válidos.
- Recepção e financeiro não acessam prontuário clínico.
- Usuário sem membership recebe conjunto vazio/negação.
- `cliente-fotos` nega acesso anônimo e aceita signed URL válida.
- Objetos públicos respondem e preservam hash.
- Login, sessão e pedido de recovery funcionam.
- Agenda, financeiro, CRM, automações e Demo passam.
- Integrações externas ficam desabilitadas no smoke isolado.

## Secrets e configuração externa

Nunca incluir nos artefatos ou no Git:

- Supabase service role/JWT secrets;
- `CRON_SECRET` e `CLINICA_SECRETS_KEY`;
- Meta App Secret e System User token;
- Resend;
- Asaas, InfinitePay e demais gateways;
- variáveis Vercel ou GitHub Environment.

Após restore, recuperar cada valor do secret manager autorizado, aplicar ao ambiente isolado, validar escopo e rotacionar somente se o incidente exigir. Conferir Vercel, DNS/domínios, redirect URLs Supabase, webhooks/callbacks Meta e gateways, Resend, GitHub Environment e workers antes de habilitar tráfego.

## Cenários

### A. Deleção acidental

Detectar pelas auditorias/contagens; bloquear writers afetados; preservar logs e IDs; escolher PITR/backup anterior; restaurar em paralelo; reconciliar linhas/objetos; validar e promover de forma controlada; comunicar escopo e revisar permissões.

### B. Migration incorreta

Parar novas promoções; preservar migration/logs; reverter a aplicação se necessário; não editar histórico; criar fix-forward ou restaurar em paralelo se houver perda; executar fresh/upgrade/paridade; comunicar e adicionar gate preventivo.

### C. Corrupção lógica

Congelar processos que propagam a corrupção; registrar janela temporal; selecionar ponto íntegro; restaurar em paralelo; comparar domínio por domínio; aplicar correção determinística; validar hashes/RLS e monitorar reincidência.

### D. Perda do projeto Supabase

Criar projeto substituto isolado; confirmar versões/extensões; aplicar migrations; restaurar Database, Auth e Storage; configurar secrets/redirects/webhooks; validar aplicação completa; planejar DNS/Vercel cutover; comunicar indisponibilidade e fazer revisão pós-incidente.

### E. Storage apagado

Suspender uploads/deletes; preservar manifesto e logs; restaurar objetos sem overwrite; comparar hashes; conferir metadados, signed URLs e políticas; reabrir uploads gradualmente e investigar a credencial/ator.

### F. Auth corrompido

Bloquear alterações de conta; preservar auditoria; restaurar users/identities em alvo compatível ou usar procedimento oficial Supabase; conferir memberships; invalidar sessões quando necessário; testar login/recovery; comunicar usuários afetados.

### G. Aplicação quebrada com banco saudável

Não restaurar dados. Reverter/promover a aplicação para SHA compatível, validar migrations existentes, executar smoke e monitorar. Preservar logs e corrigir o código em fluxo normal.

### H. Vazamento de secret sem perda de dados

Revogar/rotacionar a credencial comprometida no provedor, revisar logs e escopo, atualizar secret managers/ambientes, redeployar quando necessário e testar integrações. Não executar restore sem evidência de alteração de dados.

## RPO, RTO e PITR

Registrar sempre quatro classificações separadas:

- `CONFIGURED`: o que o Dashboard/provedor comprova hoje.
- `MEASURED`: resultado do exercício datado.
- `TARGET`: objetivo aprovado pelo negócio.
- `UNVERIFIED`: não comprovado, nunca inferido.

O RPO depende da frequência real de backup/PITR e do backup físico de Storage. O RTO do laboratório não é garantia de produção; projeto novo, transferência de objetos, DNS, reconfiguração externa, volume real e revisão humana aumentam o tempo.

## Checklist Supabase humano

No Dashboard do projeto Production, registrar captura/data/responsável de:

- plano atual e limitações de backup;
- `Database > Backups`: backups disponíveis, frequência, horário e retenção;
- PITR habilitado ou indisponível e janela de retenção;
- mecanismo suportado de restore e se restaura no mesmo projeto ou paralelo;
- extensões/versão PostgreSQL necessárias;
- procedimento de recuperação Auth suportado;
- política de backup físico/versionamento de Storage;
- teste periódico e responsável pelo exercício.

Não iniciar um restore remoto durante essa verificação.

## Adendo OPS-HARDEN-01 (2026-09-13): export externo

Este adendo nao substitui o laboratorio historico nem reduz as travas de scripts/dr/safety.mjs.
O novo formato esta em scripts/ops/ e seu estado/evidencias em [OPS-HARDEN-01](OPS-HARDEN-01-2026-09-13.md).
A cadeia atual possui56 migrations; referencias anteriores a55 descrevem o ponto historico anterior ao antiabuso.

### Preflight e export futuro

1. Preparar projeto sintetico isolado, separado de Production E Staging, para homologar o pacote completo.
2. Usar runner efemero com volume criptografado, Node22, PostgreSQL17 client e restic; instalar CA verificada.
3. Provisionar repositorio restic em conta externa aprovada, chave recuperavel em cofre separado, permissoes minimas e alertas.
4. Configurar variaveis descritas no relatorio, sem imprimir valores sensiveis.
5. Garantir pausa real externa de todos os writers. O ACK de quiescencia nao pausa nem prova nada.
6. Executar node scripts/ops/backup-export.mjs somente apos autorizacao para o alvo.
7. Confirmar export_verified, snapshot externo e integridade. Nao publicar logs brutos de comandos no GitHub.
8. Destruir o volume efemero gerenciado mesmo em falha; nao executar rm calculado contra diretorios nao verificados.

Backup inclui banco completo custom + roles sem senhas + objetos fisicos + manifesto. Nao e copia para staging nem PITR.
O catalogo antes/depois nao substitui snapshot atomico DB/Storage.

### Restore do novo formato (sempre isolado e autorizado)

1. Identificar snapshot e ref de origem no repositorio externo; validar data e intervalo necessario. Obter chave do cofre fora do Supabase.
2. Provisionar alvo NOVO isolado, sem integracoes/gateways ativos. Bloquear egress de workers/webhooks/SMTP/Meta antes de carregar dados ou iniciar aplicacao.
3. Confirmar que alvo nao e Production nem Staging oficial. NAO colar connection string de origem em comandos de restore.
4. Baixar snapshot usando restic restore <snapshot> --target <diretorio-isolado-protegido>. Este comando restaura arquivos locais, nao o banco.
5. Localizar raiz contendo manifest.json; executar node scripts/ops/verify-backup.mjs <raiz>.
6. Inspecionar pg_restore --list <raiz>/database.dump e versoes/extensoes/roles. Arquivo custom inteiro de Supabase exige TOC revisado: NAO rodar restore cego sobre schemas gerenciados.
7. Provisionar roles compatíveis a partir de roles.sql REVISADO. Nao recriar superusers/plataforma nem reutilizar senhas de origem automaticamente.
8. Restaurar schema/dados de aplicacao, historico, grants/RLS, sequences e Auth em ordem compativel com o alvo. Usar pg_restore --exit-on-error --single-transaction --use-list=<toc-revisado> com conexao explicitamente isolada.
9. Tabelas Auth: preservar users/identities e vinculos tenant; validar UUIDs, login e recuperacao sinteticos. JWT, OAuth, SMTP, encryption keys e senhas de roles nao sao reconstruidos pelo SQL: recuperar/configurar separadamente no cofre do alvo.
10. Storage: separar bucket config/policies da metadata de objetos. Para restore via Storage API, NAO restaurar cegamente rows storage.objects e depois upload upsert:false, pois geraria conflitos.
11. Criar buckets no alvo com public/limits/MIME originais; cliente-fotos deve permanecer privado. Para cada files[].storage do manifesto, enviar seu arquivo opaco ao bucket/name original com metadata.mimetype e upsert:false. Essa importacao requer tooling de restore revisado para o alvo; NAO usar o script antigo que fixa image/png sem adaptar/verificar MIME.
12. Preservar owner/metadata/policies conforme o mecanismo suportado pelo alvo; upload por service role nao reconstitui ownership de forma automatica. Se ownership for relevante, homologar mapping antes do aceite.
13. Baixar TODOS os objetos do alvo e comparar SHA-256/tamanho com manifesto. Conferir politica anon negada no bucket clinico, acesso assinado autorizado, RLS/cross-tenant.
14. Rodar testes F0A/F0B, RPCs, agenda, financeiro, CRM, automacoes sem dispatch externo, Authlogin e contagens/hashes. Apenas depois declarar restore funcional.
15. Medir RTO real desde incidente ate aplicacao util; registrar data do snapshot DB para RPO, falhas e operador.

O novo formato ainda nao tem importador automatico hospedado aprovado. Restore integral permanece OPEN; os mocks do exportador nao fecham esta etapa.
As incompatibilidades de schemas internos em dumps completos exigem revisao conforme [guia oficial Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

### Retencao e vigilancia

- Proposta:14 diarios/8 semanais/12 mensais. Ferramenta calcula somente dry-run, nao apaga snapshots.
- Exclusao/prune somente por operador separado, com restore verificado e politica de imutabilidade homologada.
- Agendar backup-health.mjs em monitor externo independente e alertar exit!=0; freshness nao comprova restore nem le todos os bytes.
- Exercicio integral trimestral e apos mudancas de schema/Auth/Storage; readback completo periodico em janela aprovada.
- RPO alvo24h, RTO alvo8h. Nao sao medidos/garantidos em Production.
