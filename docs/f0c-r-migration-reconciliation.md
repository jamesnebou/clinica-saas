# F0C-R: reconciliacao Clinica e Barbearia

Auditoria realizada em 2026-09-08. Os dois repositorios possuem o mesmo
`project-ref` (`sitoiwxalwfybcqivutd`), portanto compartilham banco PostgreSQL e
`supabase_migrations.schema_migrations`.

## Legenda

- A: objeto existe e o schema final e equivalente ao fresh reset da Clinica.
- B: objeto existe, mas foi encontrado drift ou efeito de dados nao comprovado.
- C: estrutura desejada ausente no remoto.
- D: Barbearia-only.
- E: Clinica-only.
- F: infraestrutura compartilhada.
- G: colisao de nomenclatura/assinatura.

`A` compara schema. Backfills e DML historicos continuam exigindo diagnostico de
dados no ambiente homologado antes de reconciliar o historico.

## Historico observado

- COMMON: 7.
- LOCAL_ONLY no repositorio da Clinica: 45.
- REMOTE_ONLY em relacao ao repositorio da Clinica: 13.
- O repositorio da Barbearia possui ainda `20260809102000`, ausente do historico
  remoto e da cadeia da Clinica.
- O remoto contem os objetos finais dos dois produtos, mas seu historico registra
  apenas uma parte de cada cadeia.

## COMMON

| Migration | Resultado fisico |
|---|---|
| 20260831120000 tracking_2_meta_capi | A/E; schema presente |
| 20260901100000 auth_rpc_security_hardening | A/F; schema presente |
| 20260901120000 crm_default_pipeline_idempotency | B/E; funcao remota com mojibake |
| 20260902120000 admin_delete_clinic | A/E; schema presente |
| 20260907120000 growth_tracking_3_phase_1 | A/E; schema presente |
| 20260907130000 prontuario_seguro_rls | A/E; F0A preservada |
| 20260908100000 agenda_atomic_finance_canonical | A/E; F0B preservada |

## Classificacao das 45 LOCAL_ONLY da Clinica

| Migration | Classe | Evidencia/acao |
|---|---|---|
| 20260618122000 initial_clinica_saas_schema | A/E/F | Base da Clinica presente; usa `app_private` e extensoes compartilhadas |
| 20260618143000 cliente_prontuario | A/E | Schema legado presente |
| 20260618162000 storage_financeiro_basico | A/E | Schema presente; bucket/dados exigem diagnostico |
| 20260618174500 saas_comercial | A/E | Schema SaaS presente; backfill exige diagnostico |
| 20260619123000 clinica_logos_storage | A/E | Policies e bucket presentes |
| 20260619133000 prontuario_consentimentos | A/E | Schema presente |
| 20260619153000 crm_oportunidades | A/E | CRM legado presente |
| 20260622110000 public_site_checkout | A/E | Site, agenda e checkout presentes |
| 20260622113000 clinic_site_images_storage | A/E | Policies e bucket presentes |
| 20260623100000 site_notifications_seen | A/E | Colunas presentes |
| 20260625110000 clinica_integracoes | A/E | Schema presente |
| 20260627110000 pacotes_multiplos_procedimentos | A/E | Estrutura presente; dados exigem diagnostico |
| 20260627143000 procedimento_imagem_site | A/E | Coluna presente |
| 20260628110000 usuarios_clinica_permissoes | A/E | Permissoes presentes |
| 20260707120000 marketing_home_config | A/E | Configuracao presente |
| 20260714120000 clinica_lojinha_ecommerce | A/E/G | Schema presente; cinco RPCs historicamente colidem com Barbearia |
| 20260714123000 clinica_asaas_individual_segura | A/E | Schema e funcoes presentes |
| 20260722200000 clinica_tutoriais | A/E | Tabela presente |
| 20260730153000 clinica_pagamentos_multi_gateway | A/E | Schema presente; backfill exige diagnostico |
| 20260809100000 clinica_demo_snapshot | A/E | Schema presente; snapshot/dados exigem diagnostico |
| 20260809101000 clinica_conversion_funnel | A/E | Schema presente |
| 20260809103000 clinica_intervalo_preco_promocional | A/E | Colunas presentes |
| 20260825100000 multisegmento_bi_foundation | A/E | Schema presente; backfill exige diagnostico |
| 20260825103000 bi_aggregations | A/E | Views e funcoes presentes |
| 20260826100000 whatsapp_meta_official | B/E | Constraint remota nao inclui `payment`; F0C corrige |
| 20260827100000 financeiro_2_core | A/E | Nucleo presente |
| 20260827101000 financeiro_2_rpcs | A/E | RPCs presentes |
| 20260827101500 financeiro_2_operacoes | A/E | Operacoes presentes |
| 20260827102000 financeiro_2_backfill | B/E | Schema presente; resultado do backfill exige reconciliacao de dados |
| 20260827103000 financeiro_2_consolidacao | A/E | Fix-forward estrutural presente |
| 20260828100000 financeiro_2_comissoes_eventos | B/E | `finance_pagar_comissoes` remota agrega incorretamente; F0C corrige |
| 20260828101000 crm_2_core | A/E | Nucleo presente |
| 20260828102000 crm_2_rpcs | A/E | RPCs presentes |
| 20260828103000 crm_2_backfill | B/E | Schema presente; resultado do backfill exige diagnostico |
| 20260828104000 crm_2_hardening | A/E | Hardening presente |
| 20260828105000 crm_2_pipeline_management | A/E | Funcoes presentes |
| 20260828106000 crm_2_event_idempotency_fix | A/E | Fix presente; timestamp invalido deve ser preservado |
| 20260829100000 demo_environment_v2 | B/E | Schema presente; dataset/registry remoto exige diagnostico |
| 20260830100000 automation_engine_v2 | A/E | Nucleo presente |
| 20260830110000 automation_engine_v2_hardening | A/E | Hardening presente |
| 20260831100000 automation_engine_operational_hardening | A/E | Claims/retries presentes |
| 20260831130000 self_service_signup_rate_limit | A/E | Funcao e indices presentes |
| 20260831140000 saas_subscription_lifecycle | A/E | Schema e RPCs presentes |
| 20260902130000 demo_unlimited_plan | B/E | Migration de dados; efeito remoto nao comprovado pelo dump de schema |
| 20260908120000 schema_parity_operational_fix | B/E | F0C preservada, ainda LOCAL_ONLY; corrige os tres drifts conhecidos |

## Classificacao das 13 REMOTE_ONLY

| Migration | Classe | Evidencia/acao |
|---|---|---|
| 20260710130000 initial_barbearia_saas_schema | A/D/F | Base Barbearia, `app_private`, `pgcrypto` e `btree_gist` presentes |
| 20260710162000 barbearia_role_grants | A/D | Grants da Barbearia presentes |
| 20260710170000 barbearia_saas_support | A/D | Suporte SaaS presente |
| 20260710171000 barbearia_service_content | A/D | Colunas de servicos presentes |
| 20260710172000 barbearia_private_storage | A/D | Bucket privado presente |
| 20260713140000 barbearia_ecommerce_completo | B/D/G | Tabelas presentes; RPCs genericas colidiram com a Clinica |
| 20260715103000 barbearia_demo_snapshot | A/D | Snapshot presente |
| 20260716163000 barbearia_ecommerce_remote_repair | A/D | RPCs finais prefixadas `barbearia_*` presentes; resolve G |
| 20260716164500 barbearia_support_remote_repair | A/D | Estrutura final presente |
| 20260716170000 barbearia_demo_baseline_data | B/D | Migration de dados; estado atual exige diagnostico |
| 20260717100000 barbearia_tutoriais | A/D | Tabela presente |
| 20260722143000 barbearia_store_expirations_cron | A/D/F | `pg_cron` e agendamento pertencem a operacao compartilhada |
| 20260722220000 barbearia_conversion_funnel | A/D | Funil da Barbearia presente |

`20260809102000_barbearia_multiagenda_infinitepay.sql` e C/D em relacao ao
historico remoto: existe somente no repositorio da Barbearia e precisa ser
avaliada como migration futura, nunca marcada como aplicada sem executar e
validar seu SQL.

## Colisoes comprovadas

As duas cadeias historicas criaram as mesmas assinaturas publicas com semantica
de tenant diferente:

- `public.criar_pedido_loja(...)`;
- `public.cancelar_pedido_loja(uuid,text)`;
- `public.confirmar_pagamento_pedido_loja(uuid,text,jsonb,timestamptz)`;
- `public.estornar_pedido_loja(uuid,text)`;
- `public.expirar_pedidos_loja()`.

O remoto atual preserva as RPCs da Clinica com nomes genericos e as da Barbearia
com prefixo `barbearia_*`. Nao foram encontradas colisoes de nome entre tabelas,
policies ou triggers nas migrations auditadas.

## Arquitetura recomendada

Enquanto os produtos permanecerem no mesmo PostgreSQL, deve existir uma unica
cadeia mantida por um repositorio de banco, organizada conceitualmente como:

1. infraestrutura compartilhada;
2. dominio Clinica;
3. dominio Barbearia;
4. migrations futuras globais, com IDs reservados centralmente.

Separar os projetos Supabase eliminaria o acoplamento, mas exige migrar dados,
Auth, Storage, webhooks e secrets. Nao e a opcao de menor risco para a
reconciliacao imediata.

## Baseline proposta, ainda nao executavel

A baseline deve ser gerada do schema remoto apos aplicar e validar a F0C e
resolver explicitamente `20260809102000`. Ela representa o estado canonico de
Core + Clinica + Barbearia, sem dados de negocio, usuarios, snapshots ou
backfills historicos.

- Banco novo: aplica baseline uma vez e depois somente migrations posteriores.
- Banco atual: nao executa o SQL da baseline. Depois de provar equivalencia por
  dump/hash e restore em staging, registra-se apenas o marco exato, mediante
  autorizacao especifica.
- Historico: migrations antigas permanecem byte a byte em `legacy/clinica` e
  `legacy/barbearia` ou nos repositorios originais imutaveis.
- Futuro: um gerador de timestamp/CI central impede IDs duplicados e exige fresh
  database, upgrade fixture, lint SQL e diff de schema.

Nao foi criado SQL de baseline nesta fase porque nao existe staging isolado para
provar fresh install, upgrade do estado remoto, Auth, Storage, RLS e restore.
