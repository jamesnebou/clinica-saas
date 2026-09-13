# F0C-CLOSE-03 - Disaster Recovery completo

**Projeto:** NexaWi Clínicas

**Data do exercício:** 2026-09-11/12

**Branch:** `main`

**SHA:** `7503ba08639b59d37f5607d0c756f2eafe41c87f`

**Production protegida:** `sitoiwxalwfybcqivutd`

**Staging protegida:** `ojmszqqxnvmvudhzzzgo`

**Alvo usado:** Supabase local descartável `clinica-estetica-dr-local`

**Operações remotas:** nenhuma

**Status F0C-04:** `CONDITIONALLY CLOSED`

## 1. Decisão

Database, Auth, Storage físico, hashes, RLS e aplicação foram recuperados e validados no laboratório local com dados exclusivamente sintéticos. O procedimento está versionado e bloqueia explicitamente os refs de Production e Staging.

F0C-04 permanece `CONDITIONALLY CLOSED`, não por falha do restore, mas porque plano, frequência, retenção e PITR efetivamente configurados em Production não foram consultados de forma segura nesta tarefa. Esses dados estão `UNVERIFIED` e exigem o checklist humano do Dashboard Supabase.

## 2. Estado capturado

| Item | Evidência |
|---|---|
| Node | `24.14.0` |
| npm | `11.9.0` |
| Supabase CLI | `2.117.0` |
| Docker | `29.7.2` |
| PostgreSQL local | `17.6` |
| Migrations | 55/55, primeira `20260618122000`, última `20260909110000` |
| Git inicial | branch `main`, HEAD acima; alteração preexistente em `AGENTS.md` preservada |

## 3. Arquitetura de recuperação

O artefato foi separado em três camadas:

1. migrations para schema, grants, RLS e objetos programáveis;
2. custom dump de `public.*`, `auth.users` e `auth.identities`;
3. arquivo físico dos buckets com manifesto e SHA-256.

Secrets, sessões temporárias e configuração de provedores externos não fazem parte do dump. O fluxo canônico completo está em `docs/disaster-recovery-runbook.md`.

## 4. Fixture sintética

Foram criadas três clínicas sintéticas: principal, secundária do mesmo owner para troca de clínica e tenant B isolado. O cenário inclui 4 usuários Auth, memberships owner/recepção/outro tenant/sem membership, 2 clientes, prontuários gerados, consentimento, foto privada, logo, site image, profissional, procedimento, agendamento, recebível/parcela/liquidação, pipeline/oportunidade CRM e automação em rascunho.

Nenhum dado pessoal real, senha real ou arquivo real foi versionado. A senha de laboratório foi fornecida apenas em variável de processo.

## 5. Restore Database

O fresh reset aplicou as 55 migrations em `39.545 s`. O dump foi validado antes do restore:

- formato: PostgreSQL custom dump, data-only;
- escopo: public + users/identities Auth;
- tamanho: 48.587 bytes;
- SHA-256: `d4afbaeb96edb661bf61b530fffecb4a6172abceaf4732ce53a2a0d86c8771ca`.

Restore Auth: `0.168 s`. Restore public: `0.451 s`. O bloco public exigiu `--disable-triggers` por FKs circulares, usando role local compatível. A verificação imediata provou igualdade exata das 17 tabelas do baseline.

Catálogo pós-restore:

| Objeto | Quantidade |
|---|---:|
| migrations | 55 |
| tabelas public | 92 |
| views public | 4 |
| funções public | 55 |
| triggers não internos | 67 |
| índices public | 347 |
| constraints public | 660 |
| policies public | 199 |
| tabelas public com RLS | 92 |

Generated columns encontradas: `clientes.telefone_whatsapp`, `finance_recebiveis.valor_total` e `finance_pagaveis.valor_total`. `telefone_whatsapp` foi recalculado para `5577999990001`, sem insert explícito na coluna gerada.

## 6. Auth

Quatro usuários e suas identities/provider/metadata foram restaurados. Hash Auth: `7ba59ad7b8c6fde2be342cc9dd86b34c13af73f9f45319ba5154ca9aebcbe368`.

PASS:

- login por senha sintética;
- sessão e `getUser`;
- vínculo com `usuarios_clinica`;
- owner em dois memberships válidos;
- tenant B isolado;
- usuário sem membership sem acesso;
- pedido local de recuperação de senha.

Sessões antigas, OTPs e tokens temporários não são considerados portáveis. Em recuperação real, exigir novo login e seguir o procedimento suportado pelo Supabase para schemas gerenciados.

## 7. Storage

O backup físico encontrou e restaurou 3 objetos em 3 buckets. Restore: `0.329 s`; verificação de integridade completa: `1.311 s`.

| Bucket | Caminho sintético | Bytes | SHA-256 antes/depois | Resultado |
|---|---|---:|---|---|
| `cliente-fotos` | tenant/cliente/`dr-private.png` | 68 | `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460` | PASS |
| `clinica-logos` | tenant/`dr-logo.png` | 68 | mesmo hash | PASS |
| `clinica-site-images` | tenant/site/`dr-site.png` | 68 | mesmo hash | PASS |

O bucket privado negou download anônimo, signed URL funcionou e os públicos responderam por URL. O dry-run inventariou os mesmos 3 objetos sem escrita.

## 8. RLS e domínio

| Prova | Resultado |
|---|---|
| pgTAP F0A + F0B | 53/53 PASS |
| REST/RLS F0A | PASS |
| owner/prontuário | permitido no tenant correto |
| recepção/prontuário | negado |
| financeiro/prontuário | negado pelos testes F0A |
| usuário sem membership | negado |
| cross-tenant | PASS |
| F0B concorrência | 1 winner, 1 conflito `23P01` |
| liquidação | 1, idempotente |
| Demo restore | generated column, repetição e isolamento PASS; snapshot adulterado rejeitado |

## 9. Smoke da aplicação

A aplicação local foi iniciada apontando somente para o Supabase restaurado; Meta, Asaas, InfinitePay e Resend ficaram desabilitados.

PASS:

- login e dashboard;
- troca entre Clínica DR Sintética A e Clínica DR Troca;
- cliente, ficha, prontuário, consentimento e foto;
- agenda e controles de edição/reagendamento visíveis;
- financeiro com saldo restaurado de R$ 40,00;
- CRM com oportunidade restaurada;
- automação restaurada;
- nenhum erro de console da aplicação na tela de automações.

A abertura da tela CRM materializou seis etapas canônicas ausentes no pipeline sintético. Por isso o hash de `crm_pipeline_stages` mudou somente depois do smoke. A comparação obrigatória origem/restore havia passado antes da aplicação; a mutação posterior é comportamento de inicialização do CRM, não perda do restore.

## 10. Tempos e RPO/RTO

| Métrica | Classe | Valor |
|---|---|---|
| RPO configurado Production | UNVERIFIED | frequência/retention/PITR exigem Dashboard |
| RPO medido no laboratório | MEASURED | zero entre snapshot sintético e desastre simulado |
| RPO técnico possível | UNVERIFIED | depende do plano/PITR e export físico Storage |
| RPO operacional desejado | TARGET | Database/Auth <= 15 min; Storage clínico <= 1 h |
| RTO core do laboratório | MEASURED | `41.804 s` até integridade DB/Auth/Storage |
| startup da aplicação | MEASURED | `0.661 s` |
| smoke funcional | MEASURED | aproximadamente `22.3 s` de execução observada |
| RTO total do laboratório | MEASURED | aproximadamente `64.8 s` |
| RTO operacional | TARGET | <= 4 h após declaração, incluindo validação e cutover |
| PITR Production | UNVERIFIED | HUMAN VERIFICATION REQUIRED |

Os números são do laboratório com três arquivos de 68 bytes e não constituem garantia produtiva.

## 11. Integridade

`DATA INTEGRITY = PASS` imediatamente após restore:

- 17 tabelas críticas: contagens e SHA-256 iguais;
- Auth: 4/4 e hash igual;
- Storage: 3/3 e hashes iguais;
- dump: hash conferido antes de importar;
- IDs, FKs, identities, generated columns e memberships preservados.

O baseline temporário guarda os hashes completos por tabela e não contém dado real. Artefatos não foram adicionados ao Git.

| Tabela | Linhas | SHA-256 |
|---|---:|---|
| `clinicas` | 3 | `9857854f4543a73ffd133574f1e22bcbda69e7ee3f22b1ce97a5d7890bee4107` |
| `usuarios_clinica` | 4 | `cfc7d81220230db8b656407ff2aa08e1b623420b4d7bacb686bc97608fca72a4` |
| `clientes` | 2 | `174ec88ecdf620ab17fd1d3834dbc41ecae697e1a32e0f4a92ec7d86331ed3eb` |
| `cliente_prontuarios` | 2 | `7b343ef8cdb786aabac7569367a7d3b0e38f322698b22507652238569dc1f8c1` |
| `cliente_consentimentos` | 1 | `b01bea26047ea0a3e609717fa17ab5b0ba4f1e6909e83bed8497331388d2e018` |
| `cliente_fotos` | 1 | `d9be8f138c65bc7823219759140b2b45ad20321bf8665eaa7454fee94f5905fa` |
| `profissionais` | 1 | `40c334aa7579856823898a09bf532863982b92996d4dca35fef85ecf36fbef1a` |
| `procedimentos` | 1 | `717b4652961de0492e6c7c7d4a01c84fa8c65c14d256827fb1c399d084e45b13` |
| `agendamentos` | 1 | `cee2bd5255cb50a27f4cd0531604f54e8d16a8e345d3524f9404a9f7436ca528` |
| `finance_recebiveis` | 1 | `0abcda5c4772c87ff041babef57df7985043690e795fbb4525d2c19dac735707` |
| `finance_liquidacoes` | 1 | `e78bce787ac243b2b38b4f83f16ce6a7893fb9ed0d465fbb2037e7adda88f0b5` |
| `finance_recebivel_parcelas` | 1 | `afe9653bb8082b271635ebc00ed6e2203345a710d5eef221145aac71765c42a1` |
| `finance_contas` | 3 | `c6d6c4ddca48a2a3aab96817476f6feeb02e7608f2f9b41a0c7998ec39052383` |
| `crm_pipelines` | 1 | `da5ceb7f6fa53d41e287fb79fa85b1903d0515dcc714aa13d2d6a751d7629315` |
| `crm_pipeline_stages` | 1 | `5cc37417018a6e4c2b02c6385c0ee0d3d03fdd055ff23a57f18ed9d8ca1bd16b` |
| `crm_oportunidades` | 1 | `7d577ee46ad5884a087aa87277ca6f1d08f4d7664c725752f85dec6c853856e4` |
| `automations` | 1 | `74592ab61c5494dd6f753169e1e187513181c26b7082b37e448c119442c68b15` |

## 12. Segurança dos scripts

Foram adicionados 8 testes cobrindo refs protegidos, target ausente, confirmação de restore, confirmação remota isolada, path traversal/caminho absoluto, hash mismatch, overwrite desabilitado, ausência de senha/secret em logs e validação do Storage privado.

Production e Staging são bloqueadas inclusive para backup nesses scripts deliberadamente conservadores. Um procedimento de export produtivo futuro deve ser separado e estritamente read-only; não afrouxar este guard.

## 13. Limitações e achados

1. Plano, backups automáticos, retenção e PITR de Production: `UNVERIFIED`.
2. Não foi ensaiada perda total em novo projeto Supabase hospedado; a prova foi local e isolada.
3. Volume real de fotos e tempo de download/upload não foram medidos.
4. `service_role` local não possui `USAGE` em `app_private`; insert direto de CRM por service role falha em trigger privado. A fixture usou sessão owner, que é o caminho funcional da UI. Corrigir/auditar o caminho server-side em tarefa fix-forward separada.
5. O truncate Auth local em banco já vazio emitiu negação ao tentar cascatear para tabela pública; o restore e hashes passaram. Em run real, truncar/importar por owners compatíveis e validar cada exit code antes de prosseguir.

## 14. Checklist humano restante

- Confirmar no Dashboard Production plano, frequência, horário, retenção e backups disponíveis.
- Confirmar se PITR está habilitado, janela e método de restore.
- Confirmar procedimento suportado para Auth em perda total do projeto.
- Definir/exportar backup físico recorrente de `cliente-fotos` fora do projeto.
- Aprovar RPO/RTO targets com negócio e LGPD.
- Ensaiar restore em projeto Supabase remoto temporário, sem dados reais.
- Corrigir/auditar o grant server-side CRM em fix-forward separado.

## 15. Resultado

| Item | Estado |
|---|---|
| Database restore | PASS |
| Auth restore | PASS |
| Storage restore | PASS |
| hashes | PASS |
| login pós-restore | PASS |
| RLS/F0A | PASS |
| Agenda/F0B | PASS |
| Financeiro | PASS |
| CRM via sessão owner | PASS |
| Automação | PASS |
| PITR | UNVERIFIED |

Checks finais:

- testes DR: 8/8 PASS;
- pgTAP: 53/53 PASS;
- `npm test`: 421/421 PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS (a primeira execução em sandbox falhou ao abrir `.next/trace-build`; a repetição com escrita permitida compilou normalmente);
- `git diff --check`: PASS.

**F0C-04: `CONDITIONALLY CLOSED`.**

Nenhuma operação remota, alteração em Production/Staging, Vercel, Meta, gateway, secret ou scheduler foi realizada.
