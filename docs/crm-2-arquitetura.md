# CRM 2.0 - Arquitetura

O CRM usa `clientes` como identidade canônica da pessoa. Uma pessoa pode possuir várias oportunidades, e cada oportunidade pode se relacionar com zero ou mais agendamentos. Portanto, contato, oportunidade e agendamento permanecem entidades distintas.

## Componentes

- `crm_pipelines` e `crm_pipeline_stages`: funis e etapas configuráveis por clínica.
- `crm_oportunidades`: negociação, responsável, valor, temperatura, score e atribuição.
- `crm_activities`: follow-ups, tarefas, notas e contatos com prazo e conclusão.
- `crm_opportunity_events`: timeline imutável de mudanças de domínio.
- `crm_tags` e `crm_opportunity_tags`: classificação comercial.
- `crm_opportunity_appointments`: vínculo explícito com agenda.
- `domain_outbox_events`: entrega confiável de eventos para futuras automações.

Todas as estruturas usam `clinica_id`, RLS e chaves estrangeiras compostas para impedir vínculos entre tenants. Operações críticas de criação, movimentação e conclusão são RPCs transacionais.

## Compatibilidade

O campo legado `status` continua sendo atualizado a partir de `tipo` e `semantic_key` da etapa. Integrações novas usam `pipeline_id` e `stage_id`; leitores antigos continuam funcionando durante a transição.
