# Inventario de migrations

## FONTE CANÔNICA ATUAL — 2026-09-11

- Quantidade oficial: **55 migrations**.
- Ordem: nomes de arquivo em ordem lexicográfica; nenhum timestamp duplicado.
- SHA-256 agregado do manifesto `nome=hash`: `cd4f229cdd9c0e77b89e69f4e7dc582657bb9b492a51b5d801d2fe6504d1e4a2`.
- Staging `ojmszqqxnvmvudhzzzgo`: 55 `COMMON`, 0 `LOCAL_ONLY`, 0 `REMOTE_ONLY`.
- Produção `sitoiwxalwfybcqivutd`: 9 `COMMON`, 46 `LOCAL_ONLY` no histórico e 13 `REMOTE_ONLY` da Barbearia.
- `LOCAL_ONLY` descreve exclusivamente o histórico remoto; não significa que o objeto físico esteja ausente. O dump produtivo confirmou todos os objetos canônicos da Clínica.
- Este inventário pertence à NexaWi Clínicas. A lista Barbearia abaixo é apenas evidência histórica do banco produtivo compartilhado.

O relatório com os 55 hashes individuais e a comparação de schema é `docs/F0C-CLOSE-01-PARITY-2026-09-11.md`.

## Histórico de produção por migration

`COMMON` significa arquivo local e registro no histórico produtivo em 2026-09-11. O staging possui todas as linhas como `COMMON`.

| Migration | Dominio | Operacao | Dependencia/risco | Historico remoto |
|---|---|---|---|---|
| 20260618122000 initial_clinica_saas_schema | Clinica base | create/alter | raiz da Clinica | LOCAL_ONLY |
| 20260618143000 cliente_prontuario | Prontuario legado | create/alter | clientes | LOCAL_ONLY |
| 20260618162000 storage_financeiro_basico | Storage/financeiro legado | create/backfill | Clinica base | LOCAL_ONLY |
| 20260618174500 saas_comercial | SaaS | create/backfill | Clinica base | LOCAL_ONLY |
| 20260619123000 clinica_logos_storage | Storage | policies/DML | storage | LOCAL_ONLY |
| 20260619133000 prontuario_consentimentos | Prontuario | create/alter | clientes | LOCAL_ONLY |
| 20260619153000 crm_oportunidades | CRM legado | create/alter | clientes | LOCAL_ONLY |
| 20260622110000 public_site_checkout | Site/checkout | create/alter | agenda/financeiro | LOCAL_ONLY |
| 20260622113000 clinic_site_images_storage | Storage | policies/DML | storage | LOCAL_ONLY |
| 20260623100000 site_notifications_seen | Site | alter | site publico | LOCAL_ONLY |
| 20260625110000 clinica_integracoes | Integracoes | create/alter | Clinica base | LOCAL_ONLY |
| 20260627110000 pacotes_multiplos_procedimentos | Pacotes | alter | pacotes/procedimentos | LOCAL_ONLY |
| 20260627143000 procedimento_imagem_site | Procedimentos | alter | procedimentos | LOCAL_ONLY |
| 20260628110000 usuarios_clinica_permissoes | Auth | alter | usuarios_clinica | LOCAL_ONLY |
| 20260707120000 marketing_home_config | Marketing | create/alter | Clinica base | LOCAL_ONLY |
| 20260714120000 clinica_lojinha_ecommerce | Clinica/Loja | create/backfill | Clinica base | LOCAL_ONLY |
| 20260714123000 clinica_asaas_individual_segura | Asaas | alter/functions | integracoes | LOCAL_ONLY |
| 20260722200000 clinica_tutoriais | Clinica/Tutorial | create/backfill | Clinica base | LOCAL_ONLY |
| 20260730153000 clinica_pagamentos_multi_gateway | Gateways | alter/backfill | checkout | LOCAL_ONLY |
| 20260809100000 clinica_demo_snapshot | Demo | create/backfill | todos os dominios anteriores | LOCAL_ONLY |
| 20260809101000 clinica_conversion_funnel | Tracking | create/alter | marketing | LOCAL_ONLY |
| 20260809103000 clinica_intervalo_preco_promocional | Agenda | alter | procedimentos | LOCAL_ONLY |
| 20260825100000 multisegmento_bi_foundation | Segmentos/BI | create/backfill | Clinica base | LOCAL_ONLY |
| 20260825103000 bi_aggregations | BI | functions/views | BI foundation | LOCAL_ONLY |
| 20260826100000 whatsapp_meta_official | WhatsApp | create/backfill | agenda/outbox | LOCAL_ONLY |
| 20260827100000 financeiro_2_core | Financeiro 2 | create/backfill | financeiro legado | LOCAL_ONLY |
| 20260827101000 financeiro_2_rpcs | Financeiro 2 | functions | core | LOCAL_ONLY |
| 20260827101500 financeiro_2_operacoes | Financeiro 2 | functions/backfill | RPCs | LOCAL_ONLY |
| 20260827102000 financeiro_2_backfill | Financeiro 2 | backfill | legado/core; lock de dados | LOCAL_ONLY |
| 20260827103000 financeiro_2_consolidacao | Financeiro 2 | create/alter/backfill | quatro migrations F2 | LOCAL_ONLY |
| 20260828100000 financeiro_2_comissoes_eventos | Financeiro 2 | create/functions | core/liquidacoes | LOCAL_ONLY |
| 20260828101000 crm_2_core | CRM 2 | create/alter | CRM legado | LOCAL_ONLY |
| 20260828102000 crm_2_rpcs | CRM 2 | alter/functions | CRM 2 core | LOCAL_ONLY |
| 20260828103000 crm_2_backfill | CRM 2 | backfill | legado/core | LOCAL_ONLY |
| 20260828104000 crm_2_hardening | CRM 2 | alter/backfill | CRM 2 | LOCAL_ONLY |
| 20260828105000 crm_2_pipeline_management | CRM 2 | functions | CRM 2 | LOCAL_ONLY |
| 20260828106000 crm_2_event_idempotency_fix | CRM 2 | fix-forward | timestamp invalido, preservar | LOCAL_ONLY |
| 20260829100000 demo_environment_v2 | Demo | create/backfill | dominios registrados | LOCAL_ONLY |
| 20260830100000 automation_engine_v2 | Automacoes | create/backfill | outbox/CRM/agenda/F2 | LOCAL_ONLY |
| 20260830110000 automation_engine_v2_hardening | Automacoes | create/alter | engine | LOCAL_ONLY |
| 20260831100000 automation_engine_operational_hardening | Automacoes | alter/backfill | engine/worker | LOCAL_ONLY |
| 20260831120000 tracking_2_meta_capi | Tracking | create/backfill | marketing/SaaS | COMMON |
| 20260831130000 self_service_signup_rate_limit | Auth | function/policy | signup | LOCAL_ONLY |
| 20260831140000 saas_subscription_lifecycle | SaaS/Asaas | create/backfill | cobrancas/assinaturas | LOCAL_ONLY |
| 20260901100000 auth_rpc_security_hardening | Auth/RLS | alter/constraints | NOT VALID intencional | COMMON |
| 20260901120000 crm_default_pipeline_idempotency | CRM 2 | function/backfill | pipeline | COMMON; drift corrigido adiante |
| 20260902120000 admin_delete_clinic | Admin | function | cascatas/Asaas externo | COMMON |
| 20260902130000 demo_unlimited_plan | Demo/SaaS | backfill | planos/demo | LOCAL_ONLY |
| 20260907120000 growth_tracking_3_phase_1 | Tracking | create/alter | Tracking 2 | COMMON |
| 20260907130000 prontuario_seguro_rls | F0A | create/backfill/RLS | clientes e legado clinico | COMMON |
| 20260908100000 agenda_atomic_finance_canonical | F0B | create/alter/backfill | Agenda/F2/outbox | COMMON |
| 20260908120000 schema_parity_operational_fix | F0C | constraint/functions | corrige drift confirmado | LOCAL_ONLY |
| 20260908130000 demo_snapshot_generated_columns_fix | Demo/F0C | function fix-forward | generated/identity columns | LOCAL_ONLY |
| 20260909100000 agenda_safe_delete | Agenda | function fix-forward | exclusao com historico financeiro | COMMON |
| 20260909110000 agenda_delete_public_booking_fix | Agenda | function fix-forward | preserva solicitacao publica | COMMON |

## Anomalias

- `20260828106000` possui minuto `60`. O arquivo nao pode ser renomeado porque integra a cadeia historica; um futuro baseline canonico deve absorver essa anomalia.
- Nao existem timestamps duplicados.
- As 13 migrations `REMOTE_ONLY` foram localizadas no repositorio da Barbearia. Elas nao podem ser inseridas na cadeia ativa da Clinica: o teste comprovou colisao historica de RPCs genericos. A reconciliacao exige baseline compartilhado.
- Nenhuma migration historica foi editada.
- O schema produtivo comum e compativel com as 55 migrations, mas o historico produtivo nao e 55/55. Nao executar `migration repair` sem um plano de reconciliacao separado e autorizado.

## Remote only com origem identificada

| Versao | Arquivo original no repositorio Barbearia |
|---|---|
| 20260710130000 | initial_barbearia_saas_schema.sql |
| 20260710162000 | barbearia_role_grants.sql |
| 20260710170000 | barbearia_saas_support.sql |
| 20260710171000 | barbearia_service_content.sql |
| 20260710172000 | barbearia_private_storage.sql |
| 20260713140000 | barbearia_ecommerce_completo.sql |
| 20260715103000 | barbearia_demo_snapshot.sql |
| 20260716163000 | barbearia_ecommerce_remote_repair.sql |
| 20260716164500 | barbearia_support_remote_repair.sql |
| 20260716170000 | barbearia_demo_baseline_data.sql |
| 20260717100000 | barbearia_tutoriais.sql |
| 20260722143000 | barbearia_store_expirations_cron.sql |
| 20260722220000 | barbearia_conversion_funnel.sql |
