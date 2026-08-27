# Ambiente demo da NexaWi Clínicas

## Objetivo

O ambiente demo é uma funcionalidade de produção usada em demonstrações comerciais, avaliações e App Review. Ele mantém um único tenant demonstrativo com dados fictícios, ricos e restauráveis.

O reset não é um seed genérico e não aceita `clinica_id` enviado pelo navegador. A clínica é resolvida no backend a partir do usuário Auth demo e de um registro privado criado após validação.

## Causa da falha anterior

A migration `20260809100000_clinica_demo_snapshot.sql` registrava uma lista fixa de tabelas anterior ao CRM 2.0 e ao Financeiro 2.0. Depois da inclusão dessas entidades:

- o snapshot deixou de representar todo o estado mutável da clínica;
- a restauração tentava excluir `crm_oportunidades` antes de entidades filhas do CRM 2.0;
- FKs novas abortavam a transação;
- o snapshot invalidado podia ser recapturado em um estado parcial;
- reparos adicionais em JavaScript executavam fora da mesma transação do reset.

O resultado era a mensagem segura `Não foi possível preparar a demonstração agora.`, enquanto o erro técnico ficava restrito ao servidor.

## Arquitetura v2

Os componentes ficam centralizados em `src/lib/demo`:

- `config.js`: identidade e configuração da conta demo;
- `dataset.mjs`: dataset determinístico e lista de entidades mutáveis;
- `validation.mjs`: validações puras de identidade, tenant, duplicidade e riqueza;
- `logger.js`: logs estruturados sem secrets;
- `service.js`: criação/validação da conta, registro do ambiente e chamada do reset atômico;
- `demo-account.js`: fachada temporária de compatibilidade para imports existentes.

A migration `20260829100000_demo_environment_v2.sql` adiciona:

- `app_private.demo_environments`: associação privada entre usuário Auth e tenant demo;
- `app_private.demo_reset_registry`: ordem explícita de exclusão e inserção;
- `register_demo_environment_v2`: registra o ambiente somente após validação forte;
- `reset_demo_environment_v2`: restaura o dataset em uma única transação PostgreSQL.

## Fluxo de preparação

1. O backend localiza ou cria `demo@nexawi.com.br` e grava `app_metadata.demo_account = true`.
2. O backend localiza ou cria a clínica com slug `demo-nexawi-clinicas` e `metadata.demo = true`.
3. O vínculo ativo de owner é garantido em `usuarios_clinica`.
4. A identidade é validada no Node.js.
5. O RPC privado registra o par usuário/clínica após repetir as validações no banco.
6. O dataset relativo ao momento atual é gerado e validado.
7. O RPC de reset resolve a clínica pelo usuário registrado, adquire advisory lock, limpa na ordem da registry, reinsere na ordem inversa e confere as contagens.
8. Qualquer erro aborta a chamada inteira e o PostgreSQL realiza rollback.
9. Somente depois da preparação bem-sucedida o login demo prossegue.

## Barreiras de segurança

O reset exige simultaneamente:

- JWT com role `service_role`;
- usuário Auth com o e-mail demo esperado;
- `raw_app_meta_data.demo_account = true`;
- clínica com e-mail correspondente;
- slug iniciado por `demo-`;
- `clinicas.metadata.demo = true`;
- vínculo ativo entre o mesmo usuário e a mesma clínica;
- registro privado e ativo em `app_private.demo_environments`;
- versão do dataset compatível;
- `clinicId` interno do dataset igual ao tenant registrado;
- todas as linhas com o mesmo `clinica_id`;
- tabelas limitadas à registry privada.

O RPC de reset não recebe `clinica_id`. O frontend não consegue selecionar um tenant para limpeza e os papéis `anon` e `authenticated` não possuem permissão de execução.

## Concorrência

O reset usa `pg_advisory_xact_lock` por clínica e bloqueia o registro privado com `FOR UPDATE`. Dois resets simultâneos são serializados e cada execução termina em estado completo.

A demo continua sendo um tenant compartilhado. Dois visitantes podem visualizar e editar a mesma conta ao mesmo tempo; um novo login demo restaura o estado padrão e pode substituir alterações temporárias de outro visitante. Não há reset em `pagehide`, refresh ou logout, evitando que a navegação de um visitante interrompa continuamente os demais.

## Dataset

O dataset usa IDs determinísticos e datas relativas em `America/Bahia`. Ele inclui:

- clientes, profissionais, procedimentos, pacotes e agenda;
- pipeline, etapas, oportunidades, atividades, tags e timeline do CRM 2.0;
- contas, categorias, recebíveis, pagáveis, parcelas, liquidações, movimentos, comissões, orçamento e conciliação do Financeiro 2.0;
- produtos, pedidos, pagamentos e estoque da loja;
- metas e eventos analíticos para BI.

`pagamentos_clinica` permanece vazio. A verdade financeira da demo está nas entidades canônicas do Financeiro 2.0, evitando dupla contagem.

## Inclusão de um novo módulo

Toda migration que criar uma tabela mutável e business-critical deve incluir a revisão abaixo:

1. A tabela pertence ao tenant por `clinica_id`?
2. Os dados precisam aparecer ou ser limpos na demo?
3. A tabela foi adicionada a `DEMO_MUTABLE_TABLES` em ordem segura de exclusão?
4. A mesma tabela foi adicionada a `app_private.demo_reset_registry` por uma nova migration fix-forward?
5. O dataset inclui linhas válidas ou um array vazio intencional?
6. Os testes de contrato, tenant, idempotência e riqueza foram atualizados?
7. As novas FKs permitem a ordem inversa de inserção definida pela registry?

Não altere migrations históricas aplicadas. Faça sempre uma migration incremental.

## Operação manual

1. Aplicar somente a migration `20260829100000_demo_environment_v2.sql` no Supabase correto.
2. Confirmar no ambiente server-side `DEMO_EMAIL`, `DEMO_PASSWORD` e `DEMO_CLINIC_SLUG`, caso os padrões não sejam usados.
3. Abrir `/login-cliente` e entrar com a conta demo.
4. Conferir logs `demo.prepare.started`, `demo.prepare.succeeded` ou `demo.prepare.failed` no servidor.
5. Para restaurar manualmente pela aplicação, chamar `POST /api/demo/reset` autenticado como a conta demo.

Não execute diretamente o RPC com dados montados à mão em produção. O serviço server-side é responsável por gerar e validar o contrato.

## Limites de validação local

Os testes unitários e de contrato validam dataset, segurança, registry, idempotência lógica e SQL da migration. O rollback real, triggers, FKs e RLS só podem ser comprovados após aplicar a migration em um projeto Supabase de teste e executar o login demo. A migration não deve ser aplicada remotamente por automação durante esta tarefa.
