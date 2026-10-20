begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.clinicas(id, nome, slug, status)
values ('e0000000-0000-4000-8000-000000000001', 'Competencia Fixture', 'competencia-fixture', 'ativa');
insert into public.profissionais(id, clinica_id, nome, ativo)
values ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Profissional', true);
insert into public.procedimentos(id, clinica_id, nome, preco, ativo)
values ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Procedimento', 100, true);

select lives_ok($$
  select public.agenda_criar_agendamento_atomico_v2(
    'e0000000-0000-4000-8000-000000000001', null,
    'e1000000-0000-4000-8000-000000000001',
    array['e2000000-0000-4000-8000-000000000001'::uuid],
    '2030-01-10 12:00+00', '2030-01-10 13:00+00', 100,
    'teste', 'competencia-booking-1',
    '{"nome":"Paciente","email":"competencia@nexawi.test","valor_sinal":50}'::jsonb)
$$, 'agenda cria recebivel sem antecipar receita');

select is((select count(*) from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'agendamento e sinal nao criam competencia');

update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001';
select is((select count(*) from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'
             and origem_tipo = 'agendamento' and tipo = 'receita' and not estornada),
          1::bigint, 'conclusao reconhece receita uma vez');
select is((select competencia from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'
             and origem_tipo = 'agendamento'),
          '2030-01-01'::date, 'DRE usa mes do atendimento');

update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001';
select is((select count(*) from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          1::bigint, 'repeticao e idempotente');

update public.agendamentos
   set inicio = '2030-02-10 12:00+00', fim = '2030-02-10 13:00+00'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001';
select is((select competencia from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'
             and origem_tipo = 'agendamento'),
          '2030-02-01'::date, 'remarcacao de concluido atualiza competencia');

update public.agendamentos set status = 'agendado'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001';
select is((select estornada from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'
             and origem_tipo = 'agendamento'),
          true, 'reversao do fato gerador estorna competencia');

select is((select count(*) from public.finance_recebiveis
           where clinica_id = 'e0000000-0000-4000-8000-000000000001'
             and origem_tipo = 'agendamento'),
          1::bigint, 'agendamento com sinal conserva um unico recebivel');

select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000001',
  array['e2000000-0000-4000-8000-000000000001'::uuid],
  '2030-08-16 12:00+00', '2030-08-16 13:00+00', 100,
  'sem sinal', 'competencia-no-signal', null
);
select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'criacao sem sinal nao antecipa recebivel');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'agendamento nao concluido nao gera competencia');

insert into public.usuarios_clinica(clinica_id, email, papel, ativo)
values ('e0000000-0000-4000-8000-000000000001', 'recepcao.finance.test@nexawi.test', 'recepcao', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"recepcao.finance.test@nexawi.test"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(app_private.usuario_pode_secao_clinica('e0000000-0000-4000-8000-000000000001', 'agenda'),
          'recepcao tem acesso a Agenda');
select ok(not app_private.finance_usuario_pode_gerir('e0000000-0000-4000-8000-000000000001'),
          'recepcao nao tem acesso ao Financeiro');
update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001'
   and inicio = '2030-08-16 12:00+00';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          1::bigint, 'conclusao sem sinal cria exatamente um recebivel');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'
            and c.tipo = 'receita' and not c.estornada),
          1::bigint, 'conclusao sem sinal cria exatamente uma competencia');
select ok((select r.clinica_id = a.clinica_id and r.cliente_id is not distinct from a.cliente_id
                  and r.profissional_id = a.profissional_id and r.procedimento_id = a.procedimento_id
                  and r.agendamento_id = a.id and r.origem_tipo = 'agendamento'
                  and r.origem_id = a.id::text
             from public.finance_recebiveis r join public.agendamentos a
               on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
            where a.inicio = '2030-08-16 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'recebivel canonico preserva tenant e vinculos do atendimento');
select is((select r.valor_total from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          100::numeric, 'recebivel tem valor integral do atendimento');
select ok((select r.valor_recebido = 0 and r.status = 'aberto'
                  and r.competencia = '2030-08-01'::date and r.vencimento = '2030-08-16'::date
             from public.finance_recebiveis r join public.agendamentos a
               on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
            where a.inicio = '2030-08-16 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'sem sinal permanece aberto e nao depende de pagamento');
select ok((select cat.codigo = 'REC_SERVICOS' and cc.codigo = 'CLINICA'
             from public.finance_recebiveis r
             join public.finance_categorias cat on cat.clinica_id = r.clinica_id and cat.id = r.categoria_id
             left join public.finance_centros_custo cc on cc.clinica_id = r.clinica_id and cc.id = r.centro_custo_id
             join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
            where a.inicio = '2030-08-16 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'categoria e centro de custo canonicos');
select ok((select c.clinica_id = a.clinica_id and c.recebivel_id = r.id
                  and c.categoria_id = r.categoria_id and c.origem_tipo = 'agendamento'
                  and c.origem_id = a.id::text and c.tipo = 'receita'
             from public.finance_competencias c
             join public.agendamentos a on a.clinica_id = c.clinica_id and a.id::text = c.origem_id
             join public.finance_recebiveis r on r.clinica_id = c.clinica_id and r.id = c.recebivel_id
            where a.inicio = '2030-08-16 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'competencia preserva categoria, recebivel e origem');
select is((select c.competencia from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          '2030-08-01'::date, 'atendimento de agosto fica em agosto, nao no mes da conclusao');
select is((select c.valor from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          100::numeric, 'competencia reconhece valor integral mesmo sem pagamento');

update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-16 12:00+00';
update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-16 12:00+00';
select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          1::bigint, 'repeticao logica nao duplica recebivel');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          1::bigint, 'repeticao logica nao duplica competencia');

select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000001', array['e2000000-0000-4000-8000-000000000001'::uuid],
  '2030-08-17 12:00+00', '2030-08-17 13:00+00', 100, 'cancelado', 'competencia-cancelled', null
);
update public.agendamentos set status = 'cancelado'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-17 12:00+00';
select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-17 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'cancelado antes de concluir nao cria recebivel');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-17 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'cancelado nao cria competencia');

select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000001', array['e2000000-0000-4000-8000-000000000001'::uuid],
  '2030-08-18 12:00+00', '2030-08-18 13:00+00', 100, 'faltou', 'competencia-no-show', null
);
update public.agendamentos set status = 'faltou'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-18 12:00+00';
select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-18 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'faltou nao cria recebivel');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-18 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'faltou nao cria competencia');

select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000001', array['e2000000-0000-4000-8000-000000000001'::uuid],
  '2030-08-19 12:00+00', '2030-08-19 13:00+00', 0, 'gratuito', 'competencia-free', null
);
update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-19 12:00+00';
select is((select count(*) from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-19 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'atendimento gratuito nao cria obrigacao');
select is((select count(*) from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-19 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          0::bigint, 'atendimento gratuito nao inventa receita');

select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000001', array['e2000000-0000-4000-8000-000000000001'::uuid],
  '2030-09-21 12:00+00', '2030-09-21 13:00+00', 100, 'legado parcial', 'competencia-legacy-paid', null
);
update public.agendamentos
   set valor_pago = 30, pagamento_status = 'parcial', status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-09-21 12:00+00';
select ok((select r.valor_recebido = 30 and r.status = 'parcial'
                  and r.metadata->>'legacy_paid_inferred' = 'true'
                  and not exists (select 1 from public.finance_liquidacoes l
                                   where l.clinica_id = r.clinica_id and l.recebivel_id = r.id)
             from public.finance_recebiveis r
             join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
            where a.inicio = '2030-09-21 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'pagamento legado parcial e preservado sem criar liquidacao');
select ok((select c.valor = 100 and c.competencia = '2030-09-01'::date
             from public.finance_competencias c
             join public.agendamentos a on a.clinica_id = c.clinica_id and a.id::text = c.origem_id
            where a.inicio = '2030-09-21 12:00+00'
              and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'pagamento parcial nao reduz receita de competencia');

insert into public.clinicas(id, nome, slug, status)
values ('e0000000-0000-4000-8000-000000000002', 'Competencia Fixture B', 'competencia-fixture-b', 'ativa');
insert into public.profissionais(id, clinica_id, nome, ativo)
values ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'Profissional B', true);
insert into public.procedimentos(id, clinica_id, nome, preco, ativo)
values ('e2000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'Procedimento B', 80, true);
select public.agenda_criar_agendamento_atomico_v2(
  'e0000000-0000-4000-8000-000000000002', null,
  'e1000000-0000-4000-8000-000000000002', array['e2000000-0000-4000-8000-000000000002'::uuid],
  '2030-08-20 12:00+00', '2030-08-20 13:00+00', 80, 'tenant B', 'competencia-tenant-b', null
);
update public.agendamentos set status = 'concluido'
 where clinica_id = 'e0000000-0000-4000-8000-000000000002' and inicio = '2030-08-20 12:00+00';
select is((select count(*) from public.finance_recebiveis
           where clinica_id = 'e0000000-0000-4000-8000-000000000002' and origem_tipo = 'agendamento'),
          1::bigint, 'tenant B tem seu proprio recebivel');
select is((select count(*) from public.finance_competencias
           where clinica_id = 'e0000000-0000-4000-8000-000000000002' and origem_tipo = 'agendamento'),
          1::bigint, 'tenant B tem sua propria competencia');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"recepcao.finance.test@nexawi.test"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.agendamentos set status = 'cancelado'
 where clinica_id = 'e0000000-0000-4000-8000-000000000002' and inicio = '2030-08-20 12:00+00';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select status from public.agendamentos
           where clinica_id = 'e0000000-0000-4000-8000-000000000002' and inicio = '2030-08-20 12:00+00'),
          'concluido'::text, 'usuario do tenant A nao altera atendimento do B');

update public.agendamentos set status = 'cancelado'
 where clinica_id = 'e0000000-0000-4000-8000-000000000001' and inicio = '2030-08-16 12:00+00';
select is((select c.estornada from public.finance_competencias c
           join public.agendamentos a on a.clinica_id = c.clinica_id and c.origem_id = a.id::text
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          true, 'reversao apos conclusao estorna apenas competencia');
select is((select r.status from public.finance_recebiveis r
           join public.agendamentos a on a.clinica_id = r.clinica_id and a.id = r.agendamento_id
          where a.inicio = '2030-08-16 12:00+00' and a.clinica_id = 'e0000000-0000-4000-8000-000000000001'),
          'aberto'::text, 'reversao de status nao cancela recebivel nem estorna caixa implicitamente');

select * from finish();
rollback;
