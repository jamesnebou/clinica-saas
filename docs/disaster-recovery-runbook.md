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
