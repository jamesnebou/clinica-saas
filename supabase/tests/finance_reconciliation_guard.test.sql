begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('10000000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-p003@nexawi.test', ''),
  ('20000000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recepcao-p003@nexawi.test', ''),
  ('30000000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b-p003@nexawi.test', '');
insert into public.clinicas(id, nome, slug, status) values
  ('a0000000-0000-4000-8000-000000000031', 'P0-03 A', 'p003-a', 'ativa'),
  ('b0000000-0000-4000-8000-000000000031', 'P0-03 B', 'p003-b', 'ativa');
insert into public.usuarios_clinica(clinica_id, user_id, email, papel, ativo) values
  ('a0000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031', 'owner-p003@nexawi.test', 'owner', true),
  ('a0000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000031', 'recepcao-p003@nexawi.test', 'recepcao', true),
  ('b0000000-0000-4000-8000-000000000031', '30000000-0000-4000-8000-000000000031', 'owner-b-p003@nexawi.test', 'owner', true);
-- Clinic creation already provisions its default account through finance_ensure_clinic_defaults.
insert into public.finance_contas(clinica_id, nome, tipo, padrao)
values ('a0000000-0000-4000-8000-000000000031', 'Outra conta A', 'banco', false);

create temp table finance_cases(
  case_name text primary key, conciliacao_id uuid, liquidacao_id uuid,
  movimento_id uuid, recebivel_id uuid
);
grant select on finance_cases to authenticated;

create function pg_temp.finance_fixture(p_case text, p_clinic uuid, p_with_liquidation boolean default true)
returns void language plpgsql as $$
declare
  v_account uuid;
  v_receivable uuid;
  v_installment uuid;
  v_liquidation uuid;
  v_movement uuid;
  v_reconciliation uuid;
  v_reference text := 'p003:' || p_case;
begin
  select id into v_account from public.finance_contas where clinica_id = p_clinic and padrao;
  insert into public.finance_recebiveis
    (clinica_id, descricao, origem_tipo, origem_id, valor_original, valor_recebido, status)
  values (p_clinic, 'Recebível P0-03', 'manual', v_reference, 500,
    case when p_with_liquidation then 300 else 0 end,
    case when p_with_liquidation then 'parcial' else 'aberto' end)
  returning id into v_receivable;
  insert into public.finance_recebivel_parcelas
    (clinica_id, recebivel_id, numero, vencimento, valor, valor_liquidado, status)
  values (p_clinic, v_receivable, 1, current_date, 300,
    case when p_with_liquidation then 300 else 0 end,
    case when p_with_liquidation then 'pago' else 'aberto' end)
  returning id into v_installment;
  if p_with_liquidation then
    insert into public.finance_liquidacoes
      (clinica_id, recebivel_id, conta_financeira_id, tipo, valor_bruto, taxa,
       valor_liquido, provider, provider_reference, idempotency_key)
    values (p_clinic, v_receivable, v_account, 'recebimento', 300, 10,
      290, 'asaas', v_reference, v_reference)
    returning id into v_liquidation;
    insert into public.finance_movimentos
      (clinica_id, conta_financeira_id, liquidacao_id, tipo, origem_tipo,
       origem_id, descricao, valor_bruto, taxa, valor_liquido,
       provider, provider_reference)
    values (p_clinic, v_account, v_liquidation, 'entrada', 'liquidacao',
      v_liquidation::text, 'Movimento P0-03', 300, 10, 290,
      'asaas', v_reference)
    returning id into v_movement;
    insert into public.finance_liquidacao_parcelas
      (clinica_id, liquidacao_id, recebivel_parcela_id, valor)
    values (p_clinic, v_liquidation, v_installment, 300);
  end if;
  insert into public.finance_conciliacoes
    (clinica_id, conta_financeira_id, liquidacao_id, movimento_id,
     provider, provider_reference, valor_provider, status)
  values (p_clinic, v_account, v_liquidation, v_movement,
    'asaas', v_reference, 300, 'pendente')
  returning id into v_reconciliation;
  insert into finance_cases values (p_case, v_reconciliation, v_liquidation,
    v_movement, v_receivable);
end $$;

select pg_temp.finance_fixture('valid', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('value', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('provider', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('reference', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('tenant-b', 'b0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('reversed', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('cancelled', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('missing', 'a0000000-0000-4000-8000-000000000031', false);
select pg_temp.finance_fixture('unauthorized', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('movement', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('installment', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('account', 'a0000000-0000-4000-8000-000000000031');
select pg_temp.finance_fixture('wrong-state', 'a0000000-0000-4000-8000-000000000031');

update public.finance_conciliacoes set valor_provider = 301
where id = (select conciliacao_id from finance_cases where case_name = 'value');
update public.finance_conciliacoes set provider = 'outro'
where id = (select conciliacao_id from finance_cases where case_name = 'provider');
update public.finance_conciliacoes set provider_reference = 'p003:wrong-ref'
where id = (select conciliacao_id from finance_cases where case_name = 'reference');
update public.finance_recebiveis set status = 'cancelado'
where id = (select recebivel_id from finance_cases where case_name = 'cancelled');
update public.finance_movimentos set valor_liquido = 280
where id = (select movimento_id from finance_cases where case_name = 'movement');
update public.finance_liquidacao_parcelas set valor = 200
where liquidacao_id = (select liquidacao_id from finance_cases where case_name = 'installment');
update public.finance_conciliacoes
set conta_financeira_id = (select id from public.finance_contas where nome = 'Outra conta A')
where id = (select conciliacao_id from finance_cases where case_name = 'account');
update public.finance_conciliacoes set status = 'divergente'
where id = (select conciliacao_id from finance_cases where case_name = 'wrong-state');
insert into public.finance_liquidacoes
  (clinica_id, recebivel_id, conta_financeira_id, tipo, valor_bruto,
   valor_liquido, idempotency_key, reversao_de_id)
select 'a0000000-0000-4000-8000-000000000031', f.recebivel_id,
  l.conta_financeira_id, 'estorno_recebimento', 300, 290,
  'p003:reversal', l.id
from finance_cases f join public.finance_liquidacoes l on l.id = f.liquidacao_id
where f.case_name = 'reversed';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031","email":"owner-p003@nexawi.test","role":"authenticated"}', true);
select lives_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='valid'))$$,
  'conciliação válida com pagamento parcial e taxa');
select is((select status from public.finance_conciliacoes where id=(select conciliacao_id from finance_cases where case_name='valid')),
  'conciliado', 'transição persistida');
select ok((select l.conciliado and m.conciliado from finance_cases f
  join public.finance_liquidacoes l on l.id=f.liquidacao_id
  join public.finance_movimentos m on m.id=f.movimento_id where f.case_name='valid'),
  'liquidação e movimento marcados na mesma operação');
select is((select count(*) from public.auditoria_clinica where acao='financeiro.liquidacao_conciliada'
  and entidade_id=(select conciliacao_id::text from finance_cases where case_name='valid')),
  1::bigint, 'ação auditada uma vez');
select is((select valor_total from public.finance_recebiveis where id=(select recebivel_id from finance_cases where case_name='valid')),
  500::numeric, 'pagamento parcial não exige comparar com total do recebível');
select is((select valor_liquido from public.finance_liquidacoes where id=(select liquidacao_id from finance_cases where case_name='valid')),
  290::numeric, 'taxa preserva líquido diferente do bruto conciliado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='valid'))$$,
  '23505', null, 'repetição explícita é recusada sem duplicar movimento');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='value'))$$,
  '22023', null, 'valor bruto divergente é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='provider'))$$,
  '22023', null, 'provider divergente é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='reference'))$$,
  '22023', null, 'referência divergente é recusada');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='tenant-b'))$$,
  '42501', null, 'clínica A não concilia registro da clínica B');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='reversed'))$$,
  '22023', null, 'liquidação estornada é recusada');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='cancelled'))$$,
  '22023', null, 'recebível cancelado é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='missing'))$$,
  '22023', null, 'sem liquidação vinculada é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='movement'))$$,
  '22023', null, 'movimento divergente é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='installment'))$$,
  '22023', null, 'rateio da parcela divergente é recusado');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='account'))$$,
  '22023', null, 'conta financeira divergente é recusada');
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='wrong-state'))$$,
  '22023', null, 'estado divergente não pode ser confirmado diretamente');
select throws_ok($$update public.finance_conciliacoes set status='conciliado'
  where id=(select conciliacao_id from finance_cases where case_name='value')$$,
  '42501', null, 'UPDATE direto da conciliação é bloqueado');
select throws_ok($$update public.finance_conciliacoes set provider_reference='p003:tampered'
  where id=(select conciliacao_id from finance_cases where case_name='value')$$,
  '42501', null, 'referência do provider não pode ser forjada por UPDATE');
select throws_ok($$update public.finance_liquidacoes set conciliado=true
  where id=(select liquidacao_id from finance_cases where case_name='value')$$,
  '42501', null, 'UPDATE direto da liquidação é bloqueado');
select throws_ok($$update public.finance_movimentos set conciliado=true
  where id=(select movimento_id from finance_cases where case_name='value')$$,
  '42501', null, 'UPDATE direto do movimento é bloqueado');
select throws_ok($$insert into public.finance_conciliacoes
  (clinica_id, provider, provider_reference, status)
  values ('a0000000-0000-4000-8000-000000000031', 'asaas', 'p003:forged', 'conciliado')$$,
  '42501', null, 'INSERT direto já conciliado é bloqueado');
select ok(not has_table_privilege('authenticated', 'public.finance_liquidacoes', 'INSERT'),
  'liquidação não pode ser fabricada por INSERT direto');
select ok(not has_table_privilege('authenticated', 'public.finance_movimentos', 'INSERT'),
  'movimento não pode ser fabricado por INSERT direto');
select lives_ok($$update public.finance_conciliacoes set divergencia='Em revisão'
  where id=(select conciliacao_id from finance_cases where case_name='value')$$,
  'UPDATE não sensível continua permitido');
reset role;

select throws_ok($$insert into public.finance_conciliacoes
  (clinica_id, conta_financeira_id, liquidacao_id, movimento_id,
   provider, provider_reference, valor_provider, status)
  select c.clinica_id, c.conta_financeira_id, c.liquidacao_id, c.movimento_id,
    c.provider, 'p003:duplicate-confirmed', c.valor_provider, 'conciliado'
  from public.finance_conciliacoes c
  where c.id=(select conciliacao_id from finance_cases where case_name='valid')$$,
  '23505', null, 'índice impede segunda conciliação da mesma liquidação');
insert into public.finance_conciliacoes
  (clinica_id, conta_financeira_id, liquidacao_id, movimento_id,
   provider, provider_reference, valor_provider, status)
select c.clinica_id, c.conta_financeira_id, c.liquidacao_id, c.movimento_id,
  c.provider, 'p003:reuse-pending', c.valor_provider, 'pendente'
from public.finance_conciliacoes c
where c.id=(select conciliacao_id from finance_cases where case_name='valid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031","email":"owner-p003@nexawi.test","role":"authenticated"}', true);
select throws_ok($$select public.finance_conciliar_liquidacao(
  (select id from public.finance_conciliacoes where provider_reference='p003:reuse-pending'))$$,
  '22023', null, 'segunda linha pendente não reutiliza liquidação conciliada');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000031","email":"recepcao-p003@nexawi.test","role":"authenticated"}', true);
select throws_ok($$select public.finance_conciliar_liquidacao((select conciliacao_id from finance_cases where case_name='unauthorized'))$$,
  '42501', null, 'usuário sem permissão financeira é recusado');
reset role;

insert into public.finance_recebiveis
  (clinica_id, descricao, origem_tipo, origem_id, valor_original)
values ('a0000000-0000-4000-8000-000000000031', 'Caixa manual', 'manual', 'p003:manual', 100);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031","email":"owner-p003@nexawi.test","role":"authenticated"}', true);
select lives_ok($$select public.finance_liquidar_recebivel(
  p_clinica_id => 'a0000000-0000-4000-8000-000000000031',
  p_recebivel_id => (select id from public.finance_recebiveis where origem_id='p003:manual'),
  p_valor => 100, p_forma_pagamento => 'dinheiro',
  p_idempotency_key => 'p003:manual-receipt')$$,
  'Registrar recebimento manual continua funcionando sem provider');
select is((select count(*) from public.finance_conciliacoes where provider_reference='p003:manual-receipt'),
  0::bigint, 'recebimento manual não cria conciliação de provider');

select * from finish();
rollback;
