begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);

insert into public.clinicas(id,nome,slug,status) values
 ('c0000000-0000-4000-8000-000000000001','F0B A','f0b-a','ativa'),
 ('d0000000-0000-4000-8000-000000000001','F0B B','f0b-b','ativa');
insert into public.profissionais(id,clinica_id,nome,ativo) values
 ('c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Prof A',true),
 ('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Prof B',true);
insert into public.procedimentos(id,clinica_id,nome,preco,ativo) values
 ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Proc A1',100,true),
 ('c2000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Proc A2',50,true),
 ('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Proc B',80,true);

select lives_ok($$
 select public.agenda_criar_agendamento_atomico_v2(
  'c0000000-0000-4000-8000-000000000001',null,'c1000000-0000-4000-8000-000000000001',
  array['c2000000-0000-4000-8000-000000000001'::uuid,'c2000000-0000-4000-8000-000000000002'::uuid],
  '2030-01-10 12:00+00','2030-01-10 13:30+00',150,'teste','booking-1',
  '{"nome":"Paciente F0B","email":"paciente-f0b@nexawi.test","telefone":"77999999999","valor_sinal":50,"payload":{}}'::jsonb)
$$,'booking público completo');
select is((select count(*) from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),1::bigint,'cria um agendamento');
select is((select cardinality(procedimento_ids) from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),2,'preserva todos os procedimentos');
select is((select count(*) from public.site_agendamentos_publicos where clinica_id='c0000000-0000-4000-8000-000000000001'),1::bigint,'cria booking público na transação');
select is((select count(*) from public.finance_recebiveis where origem_tipo='agendamento'),1::bigint,'cria obrigação canônica quando há sinal');
select is((select count(*) from public.domain_outbox_events where event_name='booking.created' and consumer='whatsapp'),1::bigint,'grava outbox junto com booking');

select lives_ok($$
 select public.agenda_criar_agendamento_atomico_v2(
  'c0000000-0000-4000-8000-000000000001',null,'c1000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001'::uuid],
  '2030-01-10 12:00+00','2030-01-10 13:00+00',100,'retry','booking-1','{"nome":"Paciente F0B","email":"paciente-f0b@nexawi.test"}'::jsonb)
$$,'retry idempotente não falha');
select is((select count(*) from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),1::bigint,'retry não duplica');

select throws_ok($$
 select public.agenda_criar_agendamento_atomico_v2(
  'c0000000-0000-4000-8000-000000000001',null,'d1000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001'::uuid],
  '2030-01-11 12:00+00','2030-01-11 13:00+00',100,'cross','booking-cross','{"nome":"Cross","email":"cross@nexawi.test"}'::jsonb)
$$,'23503',null,'profissional cross-tenant é bloqueado');
select is((select count(*) from public.clientes where email='cross@nexawi.test'),0::bigint,'falha intermediária não deixa cliente parcial');
select throws_ok($$
 select public.agenda_criar_agendamento_atomico_v2(
  'c0000000-0000-4000-8000-000000000001',null,'c1000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001'::uuid],
  '2030-01-10 12:30+00','2030-01-10 13:00+00',100,'overlap','booking-overlap','{"nome":"Rollback","email":"rollback@nexawi.test"}'::jsonb)
$$,'23P01',null,'sobreposição falha dentro da transação');
select is((select count(*) from public.clientes where email='rollback@nexawi.test'),0::bigint,'erro no insert do agendamento reverte cliente criado');

select throws_ok($$
 select public.finance_registrar_pagamento_agendamento_v2(
  'd0000000-0000-4000-8000-000000000001',(select id from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),150,50,
  'Cross','asaas','pay-cross',now(),'pix','{}')
$$,'P0002',null,'liquidação cross-tenant é bloqueada');

select lives_ok($$
 select public.finance_registrar_pagamento_agendamento_v2(
  'c0000000-0000-4000-8000-000000000001',(select id from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),150,50,
  'Sinal','asaas','pay-f0b-1',now(),'pix','{}')
$$,'liquidação parcial canônica');
select is((select valor_recebido from public.finance_recebiveis where origem_tipo='agendamento'),50.00::numeric,'saldo recebido parcial correto');
select is((select count(*) from public.finance_liquidacoes where provider_reference='pay-f0b-1' and tipo='recebimento'),1::bigint,'uma liquidação para o evento');
select lives_ok($$
 select public.finance_registrar_pagamento_agendamento_v2(
  'c0000000-0000-4000-8000-000000000001',(select id from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),150,50,
  'Sinal','asaas','pay-f0b-1',now(),'pix','{}')
$$,'webhook duplicado é idempotente');
select is((select count(*) from public.finance_liquidacoes where provider_reference='pay-f0b-1' and tipo='recebimento'),1::bigint,'duplicidade continua uma liquidação');
select ok((select bool_and(diagnostico='ok') from public.finance_reconciliacao_legado_v2 where clinica_id='c0000000-0000-4000-8000-000000000001'),'espelho legado confere com canônico');
select lives_ok($$
 select public.finance_cancelar_pagamento_agendamento_v2(
  'c0000000-0000-4000-8000-000000000001',(select id from public.agendamentos where clinica_id='c0000000-0000-4000-8000-000000000001'),'Estorno F0B')
$$,'cancelamento estorna atomicamente');
select results_eq(
 $$select status,valor_recebido from public.finance_recebiveis where origem_tipo='agendamento'$$,
 $$values ('cancelado'::text,0.00::numeric)$$,
 'recebível termina cancelado e zerado');

insert into public.pacotes_clinica(id,clinica_id,nome,quantidade_sessoes,valor,validade_dias,ativo)
values('c3000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Pacote F0B',5,500,90,true);
select lives_ok($$
 select public.finance_vender_pacote_v2(
  'c0000000-0000-4000-8000-000000000001',
  (select id from public.clientes where clinica_id='c0000000-0000-4000-8000-000000000001' and email='paciente-f0b@nexawi.test'),
  'c3000000-0000-4000-8000-000000000001','2030-01-10',null,100,'pix','Venda de teste','package-sale-1')
$$,'venda de pacote é atômica');
select is((select count(*) from public.cliente_pacotes where clinica_id='c0000000-0000-4000-8000-000000000001'),1::bigint,'venda cria um pacote do cliente');
select is((select count(*) from public.finance_recebiveis where clinica_id='c0000000-0000-4000-8000-000000000001' and origem_tipo='cliente_pacote'),1::bigint,'venda cria um recebível canônico');
select lives_ok($$
 select public.finance_vender_pacote_v2(
  'c0000000-0000-4000-8000-000000000001',
  (select id from public.clientes where clinica_id='c0000000-0000-4000-8000-000000000001' and email='paciente-f0b@nexawi.test'),
  'c3000000-0000-4000-8000-000000000001','2030-01-10',null,100,'pix','Retry','package-sale-1')
$$,'retry da venda de pacote é idempotente');
select is((select count(*) from public.cliente_pacotes where clinica_id='c0000000-0000-4000-8000-000000000001'),1::bigint,'retry não duplica a venda do pacote');

select * from finish();
rollback;
