# F0C-CLOSE-01 - Evidência de fresh, upgrade e paridade

**Projeto:** NexaWi Clínicas
**Data:** 2026-09-11
**SHA base testado:** `623f80af1eb86b569070eeb571b8ef6adf4ff977`
**Branch:** `main`
**Supabase CLI:** `2.117.0`
**PostgreSQL local:** `17`

## 1. Resultado executivo

| Área | Resultado | Evidência |
|---|---|---|
| Fresh database | `PASS` | reset local sem seed aplicou 55 migrations sem intervenção |
| Cadeia 55/55 | `PASS` | histórico local 55/55; sem timestamp duplicado |
| Upgrade 52 para 55 | `PASS` | fixture preservada e migrations 53-55 aplicadas em ordem |
| Staging migration parity | `PASS` | ref confirmado; histórico 55/55 |
| Staging schema compatible | `PASS` | nenhum objeto canônico ausente ou divergente |
| Production migration parity | `FAIL` | 9 comuns, 46 ausentes do histórico e 13 Barbearia-only |
| Production schema compatible | `PASS` | todos os objetos comuns da Clínica têm definição idêntica |
| F0A pgTAP/RLS | `PASS` | 27/27 pgTAP e REST/RLS real |
| F0B pgTAP | `PASS` | 26/26 |
| F0B concorrência | `PASS` | um vencedor, um conflito `23P01`, uma liquidação |
| F0C diagnósticos | `PASS` local/staging; `FAIL` histórico produtivo | schema e histórico comparados read-only |
| Restore Demo | `PASS` | restore repetido, generated column, cross-tenant e snapshot adulterado |

Conclusão dos blockers:

- `F0C-01`: **CLOSED**. Fonte canônica atualizada.
- `F0C-02`: **OPEN**. Staging está provado, mas o histórico produtivo não é 55/55.
- `F0C-03`: **CLOSED**. Fresh e upgrade são reproduzíveis e foram executados.

Nenhuma escrita, migration, repair ou alteração foi realizada em staging ou produção.

## 2. Cadeia canônica

- Quantidade: 55 arquivos SQL.
- Timestamps duplicados: nenhum.
- Primeira migration: `20260618122000_initial_clinica_saas_schema.sql`.
- Últimas migrations:
  - `20260908120000_schema_parity_operational_fix.sql`;
  - `20260908130000_demo_snapshot_generated_columns_fix.sql`;
  - `20260909100000_agenda_safe_delete.sql`;
  - `20260909110000_agenda_delete_public_booking_fix.sql`.
- SHA-256 agregado do manifesto `nome=hash`: `cd4f229cdd9c0e77b89e69f4e7dc582657bb9b492a51b5d801d2fe6504d1e4a2`.
- Anomalia histórica preservada: `20260828106000`; o timestamp não é renomeado porque a migration já integra o histórico.

## 3. Fresh database

Comando executado exclusivamente na stack local das portas `55421/55422`:

```powershell
npx --yes supabase@latest db reset --local --no-seed
```

Resultado:

- 55/55 aplicadas em ordem;
- nenhuma intervenção manual;
- 92 tabelas `public`;
- 55 funções `public`;
- 67 triggers não internos;
- 347 índices totais reportados pelo catálogo, dos quais 154 declarações canônicas no dump `public`;
- 92/92 tabelas `public` com RLS;
- 199 policies;
- 443 constraints canônicas no dump;
- 429 declarações de grant/revoke para objetos `public`;
- cinco RPCs críticas presentes;
- três buckets criados pelas migrations.

Buckets locais:

| Bucket | Público | Limite | MIME |
|---|---:|---:|---|
| `cliente-fotos` | não | 10 MiB | JPEG, PNG, WebP |
| `clinica-logos` | sim | 30 MiB | JPEG, PNG, WebP, SVG |
| `clinica-site-images` | sim | 50 MiB | JPEG, PNG, WebP, SVG |

Existem nove constraints `public` criadas como `NOT VALID` na cadeia canônica e uma constraint gerenciada no schema `realtime`. Elas também aparecem com a mesma definição nos ambientes comparados; portanto não são drift desta execução. As constraints tenant críticas verificadas pelo upgrade estão validadas.

## 4. F0A, F0B e Demo no fresh

`npx supabase test db`:

- `prontuario_secure_rls.test.sql`: 27/27;
- `phase0b_atomic_finance.test.sql`: 26/26;
- total: 53/53.

Testes de integração locais:

- `prontuario-rest-rls.mjs`: acesso por papel/capability e isolamento tenant `PASS`;
- `phase0b-concurrency.mjs`: uma reserva vencedora, uma rejeitada por overlap e uma liquidação idempotente `PASS`;
- `demo-snapshot-restore.mjs`: dados restaurados, `telefone_whatsapp` recalculado, repetição idempotente, tenant B intacto e snapshot adulterado rejeitado com `42501`.

## 5. Upgrade 52 para 55

Marco real usado: `20260908120000`, com 52 registros no histórico local.

Sequência:

```powershell
npx --yes supabase@latest db reset --local --no-seed --version 20260908120000
# carregar tests/integration/phase0c-upgrade-fixture.sql no PostgreSQL local
npx --yes supabase@latest migration up --local
# executar tests/integration/phase0c-upgrade-validate.sql com ON_ERROR_STOP
```

Migrations aplicadas no upgrade:

1. `20260908130000_demo_snapshot_generated_columns_fix.sql`;
2. `20260909100000_agenda_safe_delete.sql`;
3. `20260909110000_agenda_delete_public_booking_fix.sql`.

A fixture precisou ser corrigida para refletir o schema real do marco 52: a criação da clínica já gera a conta financeira padrão, e `agendamentos.procedimento_ids` já existe após F0B. O teste agora reutiliza a conta padrão e preenche simultaneamente a referência legada e o array canônico. Isso altera somente o teste local, não migration ou schema.

Validações pós-upgrade:

- cliente preservado;
- prontuário/backfill preservado;
- agendamento e procedimentos preservados;
- recebível e liquidação preservados;
- reconciliação legada válida;
- constraints tenant críticas válidas;
- histórico 55/55;
- CRM, WhatsApp e Automations presentes;
- RPCs críticas presentes;
- F0A, F0B, concorrência, REST/RLS e restore Demo repetidos com `PASS`.

## 6. Staging

Identificação comprovada antes da consulta:

- nome: `NexaWi Clinicas Staging`;
- ref: `ojmszqqxnvmvudhzzzgo`;
- status: `ACTIVE_HEALTHY`;
- projeto vinculado localmente: sim;
- separado da produção `sitoiwxalwfybcqivutd`: sim.

Comparação read-only:

- migration history: 55/55;
- tabelas comuns: 92, zero ausentes, zero diferenças;
- funções comuns: 55, zero ausentes, zero diferenças;
- views comuns: 4, zero diferenças;
- índices comuns: 154, zero diferenças;
- policies comuns: 199, zero diferenças;
- constraints comuns: 443, zero diferenças;
- triggers comuns: 67, zero diferenças;
- tabelas com RLS: 92, zero diferenças;
- grants canônicos: 429, zero ausentes.

Drift observado: função `rls_auto_enable() RETURNS event_trigger` e três grants relacionados existem apenas no staging hospedado. O objeto não substitui nem altera objetos canônicos e corresponde ao auto-hardening da plataforma. Classificação: **compatível, platform-managed extra**.

O primeiro dump terminou com `SSL SYSCALL EOF`; uma única repetição read-only foi concluída normalmente.

## 7. Produção

Identificação:

- nome: `Clinica-saas`;
- ref: `sitoiwxalwfybcqivutd`;
- status: `ACTIVE_HEALTHY`;
- modo da auditoria: estritamente read-only.

Histórico:

- migrations canônicas da Clínica: 55;
- `COMMON`: 9;
- `LOCAL_ONLY` no histórico produtivo: 46;
- `REMOTE_ONLY` da Barbearia: 13;
- total de registros remotos relevantes retornados: 22.

Schema da Clínica:

- 92/92 tabelas encontradas e idênticas;
- 55/55 funções encontradas e idênticas;
- 4/4 views idênticas;
- 154/154 índices idênticos;
- 199/199 policies idênticas;
- 443/443 constraints idênticas;
- 67/67 triggers idênticos;
- 92/92 habilitações RLS idênticas;
- 429/429 grants/revokes canônicos presentes.

Objetos adicionais da Barbearia em produção: 32 tabelas, 8 funções, 50 índices, 32 policies, 145 constraints, 24 triggers, 32 habilitações RLS e 113 grants/revokes. Esses objetos explicam a diferença global do dump e confirmam que a produção ainda é compartilhada.

Classificação: **schema da Clínica compatível; migration parity FAIL**. Nenhum `migration repair` foi executado ou recomendado automaticamente.

## 8. Hashes dos dumps de schema

Os arquivos ficaram somente em diretório temporário e não contêm dados de negócio.

| Ambiente | SHA-256 do dump `public` | Observação |
|---|---|---|
| Local final | `be974aea70dbdd39617a0259373b507ffc12d3dacbaa88067e82188b07c139db` | canônico 55/55 |
| Staging | `ae4dee16ce1938e695730b6e7106a0dde819249075b78470d83a36f21e2f0b90` | extra platform-managed |
| Produção | `cc3eadc822c8074dd3b3653ef8e1c265c69c70ab8af05fe7310f9efc4d6e1a85` | inclui objetos Barbearia |

Hashes globais diferentes são esperados por causa dos extras documentados. A comparação por objeto comprovou igualdade das definições comuns.

## 9. Drifts encontrados

| Ambiente | Objeto/diferença | Migration relacionada | Risco | Correção proposta |
|---|---|---|---|---|
| Staging | `rls_auto_enable()` e três grants extras | nenhuma; plataforma | baixo | manter documentado; não criar migration apenas para remover |
| Produção | histórico 9/55 para a Clínica | reconciliação histórica | alto operacional | plano separado com backup, prova física e autorização; não reparar nesta fase |
| Produção | 13 migrations/objetos Barbearia | cadeia Barbearia | blast radius compartilhado | coordenar releases até separação física |
| Cadeia | nove constraints `public` permanecem `NOT VALID` | histórico de hardening | médio | avaliar em tarefa própria; não alterar fora do escopo F0C-CLOSE-01 |

Não foi encontrada definição física divergente em nenhum objeto canônico comum.

## 10. Comandos candidatos para CI futuro

O CI deve usar apenas Supabase local/descartável e falhar se o alvo não for explicitamente local.

```powershell
npx --yes supabase@latest start
npx --yes supabase@latest db reset --local --no-seed
npx --yes supabase@latest migration list --local
npx --yes supabase@latest test db
node tests/integration/prontuario-rest-rls.mjs
node tests/integration/phase0b-concurrency.mjs
node tests/integration/demo-snapshot-restore.mjs
npm run lint
npm test
npm run build
git diff --check
```

Job separado de upgrade:

```powershell
npx --yes supabase@latest db reset --local --no-seed --version 20260908120000
# psql local -v ON_ERROR_STOP=1 -f tests/integration/phase0c-upgrade-fixture.sql
npx --yes supabase@latest migration up --local
# psql local -v ON_ERROR_STOP=1 -f tests/integration/phase0c-upgrade-validate.sql
```

Nenhuma URL, project ref ou credencial remota deve existir nesses jobs.

## 11. Manifesto SHA-256 das 55 migrations

```text
e6d8d8be25b012059821c65651e0c205e9e2fe60d3395f61cdb56e98fcf21fd5  20260618122000_initial_clinica_saas_schema.sql
1feb75f1edb9244efe1e5fcecbea99779c2f471ff2b5c52ae366ea52cdf5f7bd  20260618143000_cliente_prontuario.sql
3d13f6d5f92e84ed81cd82723b4f437a1758e5f555ba37835e9d2123b624686d  20260618162000_storage_financeiro_basico.sql
258a4752a940bec658c54dbf5bd05b5caa0289de92c147c2cd316449a57c5358  20260618174500_saas_comercial.sql
32644a61323d0526d6dca007946f759dba7a12b63665fb85682e4321e4be70cd  20260619123000_clinica_logos_storage.sql
af162f8078a144fe55726099aac99bf07ef408be5bbd4208fe25cee71cdff484  20260619133000_prontuario_consentimentos.sql
01c0b3383c77d5a04fb4bd0db7cce84f6036f5e05e55cd1ac1b008ad64c85e9b  20260619153000_crm_oportunidades.sql
3608c86a396354b8cf9ce56c71f86b9b7010476e310b4764d2f1d66030198628  20260622110000_public_site_checkout.sql
134d74bdea026dff6ea93b789674af680a0542aaf05256ef362cefb9b872baee  20260622113000_clinic_site_images_storage.sql
86d0f39a095e00839f146815d294d2ad0cc9ff015b42d6d616b6ad3a9d585bbe  20260623100000_site_notifications_seen.sql
6d5b73529706c12ded5b0d472ac73efd2cabd85f5d4c034b16a760baaca6475c  20260625110000_clinica_integracoes.sql
8180123dd93413b25be5dfb8ce11d3fc9789f93ea807881e278dd7dd4f90febb  20260627110000_pacotes_multiplos_procedimentos.sql
898dcc73c3437b1994f42ccd562f651a8d2eee242332f8bdedb48ff2155f7c88  20260627143000_procedimento_imagem_site.sql
4b69509fd5f7388150e425cc6af7c02ab26d05bb14bc8c44bcf33c883abb7fda  20260628110000_usuarios_clinica_permissoes.sql
bb464288a42bac221cb18dcc6ab909911fb1af005a7ff6206ff9fe885f86cbf9  20260707120000_marketing_home_config.sql
53eec06053ad7650123de559c0f542ec4ff47628b1b663d62488eded635e7721  20260714120000_clinica_lojinha_ecommerce.sql
cf407406ff695dacb3157fdc3995a25bc3a12e63511733f6aca365a864e63211  20260714123000_clinica_asaas_individual_segura.sql
2e8bf94776cec5db73ca7b4f5121250a900e612dda74119bb29249bb4f694da3  20260722200000_clinica_tutoriais.sql
029a95b7a163dd0748ea00860315ce270a303066b6d0f643c77d1be404132af0  20260730153000_clinica_pagamentos_multi_gateway.sql
21b31de300306ea27300619bcca9599aecd1ee07e54f8c122cc5c7e11849f85a  20260809100000_clinica_demo_snapshot.sql
e3be3d27dafa91a9369fac75486a23c5966ad57a816236675f8bfd5caad258fa  20260809101000_clinica_conversion_funnel.sql
fc62196be714c7c0609d09fcbbb6bbab47b596c06277f7954fbabcdec32cf0bb  20260809103000_clinica_intervalo_preco_promocional.sql
45d8af3f1ec71a6e4e568a8e8375a413be540c5728e6f6e11500304248c407c9  20260825100000_multisegmento_bi_foundation.sql
027368b6bc3689c2a3b9f81d9407b93e6fd47d64a3168ec2e81e021de9704184  20260825103000_bi_aggregations.sql
2759a727bd88dc7b735ba007b0e8538554b3343075f53fa27f5c086d10f3c1ee  20260826100000_whatsapp_meta_official.sql
a8e399a9a045acd40b5a06e9197d45532152ea3b7e950b3f5b599e2107630673  20260827100000_financeiro_2_core.sql
79ecca9e772eadff745ae00b374dbe73a0b76a5b9fe18c25d935e270618e2fa8  20260827101000_financeiro_2_rpcs.sql
f97c5b79db23635257dbddd25ce46a2ea7820830119ddfe7692025859d11d59d  20260827101500_financeiro_2_operacoes.sql
5c7b48452edbcac6ee07929f13eba9124d9d833e852118aafe6c151b4ac88587  20260827102000_financeiro_2_backfill.sql
3bd49bd1ee3125bcf3df67d362da146b8151efe1b6535d617157ba7cc006c292  20260827103000_financeiro_2_consolidacao.sql
8d06f71c9d517eca889e51f2dcf0cc43a048a18bc0a95abbe888ee04294f129a  20260828100000_financeiro_2_comissoes_eventos.sql
655b78c87a4f37032a0f94e712b406b3e99c8d924957a5fc43008db830ac651c  20260828101000_crm_2_core.sql
2ebeb642f5002e440e4ddd8cbc5894ba61a542416a0cad7b13c1a5f2312ef6d5  20260828102000_crm_2_rpcs.sql
0c1b079956d4f3e2595bc468c546cfc1cc2779bac987d34867336da1e5097c47  20260828103000_crm_2_backfill.sql
1d411459e9a09985bfef2d0b063eebf0c91cd776b9293264c397dd20f1ca2b34  20260828104000_crm_2_hardening.sql
0547184905f2867d6722623428bb62619b7c3b149a49fb2e277a78b6d77a5416  20260828105000_crm_2_pipeline_management.sql
9a03c491b2112da2d381de2ea977b4827ef8f70a91e6473a8c81d958223c81b8  20260828106000_crm_2_event_idempotency_fix.sql
f65cef7de5b4410bdaa5b348587e3b77b7f61c8ca8510dbe20f5044c580e1ce2  20260829100000_demo_environment_v2.sql
d21fb1b60fe176f619a617f635fac1b615868ace6deff296e3f12e0289a2d96a  20260830100000_automation_engine_v2.sql
562dad1bed0a80f99834179be2361a3bc1f98195d1645ef6118ca86b116030d7  20260830110000_automation_engine_v2_hardening.sql
280f048981c13898cf174f5e99a68f790ea3ec788374456ee8757a7c0fbd4d4b  20260831100000_automation_engine_operational_hardening.sql
7325e62be2fb29f2b613f221d8de495aa8beaa39dbd20a6b7c1c322638e4830f  20260831120000_tracking_2_meta_capi.sql
5b513dd54513d2d716ace35639a845d8a82800fd0f9d1bdf3b000ced964dcb0e  20260831130000_self_service_signup_rate_limit.sql
792765a19e5a31c91e1fd70a940d84d37ed27222fbda7d46866ca72b6b3c6bfe  20260831140000_saas_subscription_lifecycle.sql
a96222ff305dc8da9921b0118200121f6928eb273d80c055888a20d6a7cfff8d  20260901100000_auth_rpc_security_hardening.sql
63fe022c85cf93d3cba279e34d1a2b22d2f4171e8335350c45a0876e43186e36  20260901120000_crm_default_pipeline_idempotency.sql
641242d7b0a064a4e993593c899b4eb00afba1da296c39298abc86a199492b8d  20260902120000_admin_delete_clinic.sql
4404c354d8b3af8efbb064666a6079edd409ecc2ab3f2811e9fe9d96854161a9  20260902130000_demo_unlimited_plan.sql
fe2bb8fe724c726ba8e2ff2a4f148aa6b703b5680b7fd84e980f85cde7f9fef9  20260907120000_growth_tracking_3_phase_1.sql
c493c8596d40eb82bc9e98549a0781fd37f0b82506c967940999544095d8e340  20260907130000_prontuario_seguro_rls.sql
35d8c87cba17eba118c0bfc6bdf5f237ba5f2f368a309a6946d6cef0ec56b04d  20260908100000_agenda_atomic_finance_canonical.sql
7fc7c87da4d9139242f0c8879205daf01ad34a59cc2e7ef3ea84ff4471752162  20260908120000_schema_parity_operational_fix.sql
e990d723135e60f199f8230f08bb2b7f3f80f1e483d3d8d3ad9cf3b7e5796aa5  20260908130000_demo_snapshot_generated_columns_fix.sql
45da518b61d96c95ee346fd740fdb02ef0a9e0f5f043d4097badbb9a32447725  20260909100000_agenda_safe_delete.sql
763a24bfe9c60617e0d271431b45464bfd6176bbdd3f818e48c3038b2347ad92  20260909110000_agenda_delete_public_booking_fix.sql
```

## 12. Checks finais

- `git diff --check`: `PASS`.
- `npm run lint`: `PASS`.
- `npm test`: `PASS`, 396/396.
- `npm run build`: `PASS`, 82 páginas geradas. O diretório `.next` existente estava bloqueado localmente; a repetição usou `NEXT_DIST_DIR=.next-f0c-close-build`, opção já suportada por `next.config.mjs`.

## 13. Limites

- F0C-04 (DR completo Auth/Storage) não foi iniciado.
- F0C-05 (workers/ambientes) não foi iniciado.
- Nenhum dado clínico, Auth object, Storage object, gateway, Meta, Vercel ou secret foi lido ou alterado.
- A reconciliação do histórico produtivo exige tarefa e autorização próprias.
