# CRM 2.0 - Validação

## Banco

1. Aplicar as quatro migrations na ordem documentada.
2. Confirmar RLS com dois usuários de clínicas diferentes.
3. Executar `crm_ensure_default_pipeline` para uma clínica existente e uma nova.
4. Verificar `crm_possible_duplicates` sem consolidar registros automaticamente.

## Fluxo funcional

1. Criar oportunidade manual com etiquetas.
2. Arrastar entre etapas e confirmar timeline.
3. Mover para Perdido exigindo motivo.
4. Criar e concluir atividade; validar próxima ação e métricas.
5. Criar lead no formulário público.
6. Agendar procedimentos com cada política de CRM.
7. Confirmar pagamento Asaas e InfinitePay para `direct_sale`.
8. Exportar CSV com filtros de responsável, temperatura e origem.
9. Validar BI atual e período anterior.

## Regressão

Rodar `npm test`, `npm run lint` e `npm run build`. Validar manualmente Kanban em desktop e mobile, drag-and-drop por toque e teclado, permissões por papel, conta demo e isolamento multi-tenant.
