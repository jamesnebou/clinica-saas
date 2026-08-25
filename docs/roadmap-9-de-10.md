# Roadmap para nível 9+

## P0 - Confiabilidade e escala

- Aplicar e validar as migrations multissegmento/BI em staging e produção.
- Executar testes de RLS com dois tenants reais no Supabase.
- Instrumentar checkout, pedidos, pagamentos e carrinhos com idempotência ponta a ponta.
- Medir as RPCs com `EXPLAIN ANALYZE` usando volume representativo.
- Definir retenção de eventos e ampliar a auditoria já criada para prontuário, finanças, permissões e integrações.

## P1 - Operação 9.5

- Financeiro 2.0: contas, categorias, competência, caixa, despesas, conciliação, margem e DRE gerencial.
- WhatsApp oficial: provider adapter, templates, webhooks, fila, consentimento, opt-out e atribuição.
- Motor de automações: gatilhos, condições, ações, retentativas e auditoria.
- Estoque clínico: lotes, validade, perdas, consumo por procedimento e CMV.
- CRM 9.5: motivos de perda estruturados, SLA, atividades, scoring e atribuição multitoque.
- NFS-e com providers isolados por município.

## P2 - Diferenciação

- IA de gestão consumindo somente os contratos agregados e autorizados do BI.
- IA de atendimento com revisão humana, limites e auditoria.
- Marketing avançado, coortes, LTV, campanhas e automações por segmento.
- PWA/aplicativos e modo recepção.
- Recursos clínicos específicos por capability: odontograma, evolução fisioterapêutica, prescrições e teleatendimento.
- Multiunidade completa com consolidação e permissões por unidade.

Nenhum recurso deve aparecer como ativo antes de provider, permissão, webhook e monitoramento estarem realmente configurados.
