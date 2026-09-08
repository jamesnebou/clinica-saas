begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.clinicas (id, nome, slug, status)
values
  ('a0000000-0000-4000-8000-000000000001', 'Tenant A RLS', 'tenant-a-rls-prontuario', 'ativa'),
  ('b0000000-0000-4000-8000-000000000001', 'Tenant B RLS', 'tenant-b-rls-prontuario', 'ativa');

insert into public.usuarios_clinica (clinica_id, email, papel, ativo, permissoes)
values
  ('a0000000-0000-4000-8000-000000000001', 'owner-a-rls@nexawi.test', 'owner', true, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'admin-a-rls@nexawi.test', 'admin', true, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'admin-restrito-a-rls@nexawi.test', 'admin', true, '{"secoes":["clientes"]}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'profissional-a-rls@nexawi.test', 'profissional', true, '{"secoes":["clientes","prontuario"]}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'profissional-restrito-a-rls@nexawi.test', 'profissional', true, '{"secoes":["clientes"]}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'recepcao-a-rls@nexawi.test', 'recepcao', true, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'financeiro-a-rls@nexawi.test', 'financeiro', true, '{}'::jsonb),
  ('b0000000-0000-4000-8000-000000000001', 'owner-b-rls@nexawi.test', 'owner', true, '{}'::jsonb);

insert into public.clientes (id, clinica_id, nome, email, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Paciente A', 'paciente-a-rls@nexawi.test', 'ativo'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Paciente B', 'paciente-b-rls@nexawi.test', 'ativo');

update public.cliente_prontuarios
set alergias = 'Dado clinico A', anamnese = '{"tenant":"A"}'::jsonb
where cliente_id = 'a1000000-0000-4000-8000-000000000001';

update public.cliente_prontuarios
set alergias = 'Dado clinico B', anamnese = '{"tenant":"B"}'::jsonb
where cliente_id = 'b1000000-0000-4000-8000-000000000001';

insert into public.cliente_fotos (id, clinica_id, cliente_id, tipo, titulo, url)
values ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'documento', 'Anexo A', 'https://example.invalid/anexo-a');

insert into public.cliente_consentimentos (id, clinica_id, cliente_id, tipo, titulo, texto)
values ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'anamnese', 'Consentimento A', 'Conteudo de teste');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select alergias from public.cliente_prontuarios order by cliente_id$$,
  array['Dado clinico A'::text],
  'Owner A acessa somente o prontuario do Tenant A'
);
select throws_ok(
  $$select anamnese from public.clientes where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Colunas clinicas legadas nao podem ser consultadas por sessao autenticada'
);
select results_eq(
  $$select titulo from public.cliente_fotos$$,
  array['Anexo A'::text],
  'Owner A acessa anexos do proprio tenant'
);
select results_eq(
  $$select titulo from public.cliente_consentimentos$$,
  array['Consentimento A'::text],
  'Owner A acessa consentimentos do proprio tenant'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000001","email":"admin-restrito-a-rls@nexawi.test","role":"authenticated"}', true);
select is_empty($$select alergias from public.cliente_prontuarios$$, 'Admin A sem capability nao acessa prontuario');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","email":"admin-a-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select alergias from public.cliente_prontuarios$$,
  array['Dado clinico A'::text],
  'Admin A padrao acessa prontuario do Tenant A'
);
select lives_ok(
  $$update public.cliente_prontuarios set contraindicacoes = 'Atualizado pelo Admin A' where cliente_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'Admin A atualiza prontuario autorizado'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000001","email":"profissional-restrito-a-rls@nexawi.test","role":"authenticated"}', true);
select is_empty($$select alergias from public.cliente_prontuarios$$, 'Profissional A sem capability nao acessa prontuario');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","email":"profissional-a-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select alergias from public.cliente_prontuarios$$,
  array['Dado clinico A'::text],
  'Profissional A explicitamente autorizado acessa o prontuario do Tenant A'
);
select lives_ok(
  $$update public.cliente_prontuarios set medicamentos_uso = 'Atualizado pelo Profissional A' where cliente_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'Profissional A autorizado atualiza prontuario'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","email":"recepcao-a-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select nome from public.clientes where id = 'a1000000-0000-4000-8000-000000000001'$$,
  array['Paciente A'::text],
  'Recepcao A acessa cadastro administrativo do Tenant A'
);
select is_empty($$select alergias from public.cliente_prontuarios$$, 'Recepcao A nao lista prontuarios');
select is_empty($$select id from public.cliente_fotos$$, 'Recepcao A nao acessa anexos clinicos');
select is_empty($$select id from public.cliente_consentimentos$$, 'Recepcao A nao acessa consentimentos clinicos');
select throws_ok(
  $$insert into public.cliente_prontuarios (clinica_id, cliente_id, alergias) values ('a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Tentativa')$$,
  '42501', null,
  'Recepcao A nao insere dados clinicos'
);
select lives_ok(
  $$update public.cliente_prontuarios set alergias = 'Tentativa recepcao'$$,
  'Update direto da recepcao nao encontra linhas pela RLS'
);
reset role;
select is(
  (select alergias from public.cliente_prontuarios where cliente_id = 'a1000000-0000-4000-8000-000000000001'),
  'Dado clinico A'::text,
  'Recepcao A nao alterou o prontuario'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","email":"financeiro-a-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select nome from public.clientes where id = 'a1000000-0000-4000-8000-000000000001'$$,
  array['Paciente A'::text],
  'Financeiro A acessa cadastro necessario do Tenant A'
);
select is_empty($$select alergias from public.cliente_prontuarios$$, 'Financeiro A nao lista prontuarios');
select is_empty($$select id from public.cliente_fotos$$, 'Financeiro A nao acessa anexos clinicos');
select is_empty($$select id from public.cliente_consentimentos$$, 'Financeiro A nao acessa consentimentos clinicos');
select lives_ok(
  $$update public.cliente_prontuarios set alergias = 'Tentativa financeiro'$$,
  'Update direto do financeiro nao encontra linhas pela RLS'
);
reset role;
select is(
  (select alergias from public.cliente_prontuarios where cliente_id = 'a1000000-0000-4000-8000-000000000001'),
  'Dado clinico A'::text,
  'Financeiro A nao alterou o prontuario'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","email":"owner-b-rls@nexawi.test","role":"authenticated"}', true);
select results_eq(
  $$select alergias from public.cliente_prontuarios$$,
  array['Dado clinico B'::text],
  'Owner B acessa somente o prontuario do Tenant B'
);
select is_empty(
  $$select alergias from public.cliente_prontuarios where cliente_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'Owner B nao acessa prontuario do Tenant A'
);
select is_empty(
  $$select id from public.cliente_fotos where clinica_id = 'a0000000-0000-4000-8000-000000000001'$$,
  'Owner B nao acessa anexos do Tenant A'
);
select is_empty(
  $$select id from public.cliente_consentimentos where clinica_id = 'a0000000-0000-4000-8000-000000000001'$$,
  'Owner B nao acessa consentimentos do Tenant A'
);
reset role;

select * from finish();
rollback;
