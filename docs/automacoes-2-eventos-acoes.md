# Motor de Automação 2.0: eventos e ações

## Evento canônico

Todo evento contém `id`, `schema_version`, `type`, `occurred_at`, `clinica_id`, `subject`, `payload`, `actor`, `correlation_id`, `causation_id`, `automation_run_id` e `automation_depth`. Campos não declarados no catálogo não são oferecidos no builder.

## Eventos suportados

O catálogo atual cobre eventos reais emitidos por Agenda, CRM, Financeiro e cadastro, incluindo criação e alteração de agendamento, mudança de etapa de oportunidade e vencimento de recebíveis. A lista efetiva deve ser consultada em `src/lib/automations/registry/events.mjs`; adicionar um nome à interface sem produtor real é proibido.

## Ações suportadas

- CRM: criar tarefa, atualizar etapa e responsável conforme o contrato disponível.
- Agenda: atualizar status quando a política de alto risco estiver habilitada.
- Financeiro 2.0: criar recebível e parcela com referência ao tenant e origem idempotente.
- E-mail: enviar por meio do serviço central de e-mail.
- WhatsApp: enfileirar no Notification Engine usando conexão oficial e template aprovado.
- Operação: criar tarefa interna com responsável e vencimento.
- Controle: condição, branch e espera por duração ou data/hora.

## Definição versionada

Uma definição possui `schemaVersion`, `trigger`, `conditions` e `steps`. Cada passo tem ID único e tipo conhecido. Referências dinâmicas usam apenas caminhos aprovados, por exemplo `event.payload.*`, `booking.*`, `client.*`, `opportunity.*`, `receivable.*` e `clinic.*` conforme o evento e a ação.

## Operadores

O avaliador aceita somente os operadores registrados: igualdade, diferença, comparação numérica ou temporal, presença, inclusão e prefixos/sufixos quando compatíveis com o tipo. Não existe `eval`, expressão JavaScript, SQL ou acesso livre a propriedades.

## Templates iniciais

- Confirmação ou lembrete de agendamento.
- Follow-up comercial de oportunidade.
- Cobrança de recebível vencido.
- Tarefa interna de retorno.

Templates são criados pausados. O usuário deve revisar parâmetros, validar capacidades e publicar uma versão antes de receber eventos.

## Inclusão de novos contratos

1. Confirmar que o domínio emite um evento transacional real.
2. Adicionar o evento e campos seguros ao catálogo.
3. Implementar resolver de contexto tenant-scoped quando necessário.
4. Registrar a ação e seu schema de parâmetros.
5. Implementar o executor idempotente por `run_id + step_id`.
6. Adicionar testes de sucesso, falha, replay, permissão e cross-tenant.
