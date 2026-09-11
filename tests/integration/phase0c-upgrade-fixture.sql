begin;
set local request.jwt.claim.role = 'service_role';

insert into public.clinicas(id, nome, slug, status)
values ('e0000000-0000-4000-8000-000000000001', 'Upgrade F0C', 'upgrade-f0c', 'ativa');

insert into public.clientes(
  id, clinica_id, nome, email, observacoes_clinicas, anamnese, alergias
) values (
  'e1000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'Paciente Upgrade', 'upgrade@nexawi.test', 'Registro legado',
  '{"tipo_sanguineo":"O+"}'::jsonb, 'Dipirona'
);

insert into public.profissionais(id, clinica_id, nome, ativo)
values ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Profissional Upgrade', true);

insert into public.procedimentos(id, clinica_id, nome, preco, ativo)
values ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Procedimento Upgrade', 100, true);

insert into public.agendamentos(
  id, clinica_id, cliente_id, profissional_id, procedimento_id, procedimento_ids,
  inicio, fim, status, valor, valor_pago, pagamento_status, forma_pagamento
) values (
  'e4000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  array['e3000000-0000-4000-8000-000000000001'::uuid],
  '2031-01-10 12:00+00', '2031-01-10 13:00+00', 'agendado', 100, 40, 'parcial', 'pix'
);

insert into public.finance_recebiveis(
  id, clinica_id, cliente_id, profissional_id, procedimento_id, agendamento_id,
  descricao, origem_tipo, origem_id, valor_original, valor_recebido,
  competencia, vencimento, status, forma_pagamento, provider, provider_reference
) values (
  'e6000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'Recebivel Upgrade', 'agendamento', 'e4000000-0000-4000-8000-000000000001',
  100, 0, '2031-01-01', '2031-01-10', 'aberto', 'pix', 'fixture', 'upgrade-payment'
);

insert into public.finance_recebivel_parcelas(
  id, clinica_id, recebivel_id, numero, vencimento, valor
) values (
  'e7000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001', 1, '2031-01-10', 100
);

select public.finance_liquidar_recebivel(
  'e0000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001',
  40, (
    select id
    from public.finance_contas
    where clinica_id = 'e0000000-0000-4000-8000-000000000001'
      and padrao
    order by created_at, id
    limit 1
  ), 'pix',
  '2031-01-01 12:00+00', 0, 'fixture', 'upgrade-payment',
  'upgrade-liquidation', '{"fixture":true}'::jsonb
);

insert into public.pagamentos_clinica(
  id, clinica_id, cliente_id, agendamento_id, profissional_id,
  descricao, valor, valor_pago, status, forma_pagamento, data_pagamento
) values (
  'e8000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'Espelho Upgrade', 100, 40, 'parcial', 'pix', '2031-01-01 12:00+00'
);

commit;
