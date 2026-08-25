begin;

-- Aggregated BI contract. It is SECURITY INVOKER on purpose: table RLS remains active.
create or replace function public.bi_resumo_clinica(
  p_clinica_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_anterior_inicio timestamptz,
  p_anterior_fim timestamptz,
  p_timezone text default 'America/Bahia',
  p_profissional_id uuid default null,
  p_procedimento_id uuid default null,
  p_categoria text default null,
  p_status text default null,
  p_forma_pagamento text default null,
  p_origem text default null,
  p_canal text default null,
  p_crm_status text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app_private
as $$
declare
  v_result jsonb;
begin
  if p_clinica_id is null
     or p_inicio is null
     or p_fim is null
     or p_anterior_inicio is null
     or p_anterior_fim is null
     or p_fim <= p_inicio
     or p_anterior_fim <= p_anterior_inicio then
    raise exception 'Parâmetros de período inválidos.';
  end if;

  if not app_private.usuario_pode_bi_clinica(p_clinica_id)
     or not app_private.clinica_tem_capability_bi(p_clinica_id) then
    raise exception 'Acesso negado ao BI desta clínica.' using errcode = '42501';
  end if;

  with
  current_appointments as (
    select
      a.id, a.cliente_id, a.profissional_id, a.procedimento_id,
      a.inicio, a.fim, a.status, a.valor, a.valor_pago,
      a.pagamento_status, a.forma_pagamento,
      p.nome as procedimento_nome, p.categoria,
      pr.nome as profissional_nome, pr.comissao_percentual,
      c.nome as cliente_nome,
      extract(epoch from (a.fim - a.inicio)) / 60.0 as minutos
    from public.agendamentos a
    left join public.procedimentos p on p.id = a.procedimento_id and p.clinica_id = a.clinica_id
    left join public.profissionais pr on pr.id = a.profissional_id and pr.clinica_id = a.clinica_id
    left join public.clientes c on c.id = a.cliente_id and c.clinica_id = a.clinica_id
    where a.clinica_id = p_clinica_id
      and a.inicio >= p_inicio and a.inicio < p_fim
      and (p_profissional_id is null or a.profissional_id = p_profissional_id)
      and (p_procedimento_id is null or a.procedimento_id = p_procedimento_id)
      and (p_categoria is null or p.categoria = p_categoria)
      and (p_status is null or a.status = p_status)
      and (p_forma_pagamento is null or a.forma_pagamento = p_forma_pagamento)
  ),
  previous_appointments as (
    select
      a.id, a.cliente_id, a.profissional_id, a.procedimento_id,
      a.inicio, a.fim, a.status, a.valor, a.valor_pago,
      a.pagamento_status, a.forma_pagamento,
      p.nome as procedimento_nome, p.categoria,
      pr.nome as profissional_nome, pr.comissao_percentual,
      extract(epoch from (a.fim - a.inicio)) / 60.0 as minutos
    from public.agendamentos a
    left join public.procedimentos p on p.id = a.procedimento_id and p.clinica_id = a.clinica_id
    left join public.profissionais pr on pr.id = a.profissional_id and pr.clinica_id = a.clinica_id
    where a.clinica_id = p_clinica_id
      and a.inicio >= p_anterior_inicio and a.inicio < p_anterior_fim
      and (p_profissional_id is null or a.profissional_id = p_profissional_id)
      and (p_procedimento_id is null or a.procedimento_id = p_procedimento_id)
      and (p_categoria is null or p.categoria = p_categoria)
      and (p_status is null or a.status = p_status)
      and (p_forma_pagamento is null or a.forma_pagamento = p_forma_pagamento)
  ),
  current_billable as (
    select * from current_appointments
    where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'
  ),
  previous_billable as (
    select * from previous_appointments
    where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'
  ),
  current_external_payments as (
    select pc.*
    from public.pagamentos_clinica pc
    where pc.clinica_id = p_clinica_id
      and pc.agendamento_id is null
      and coalesce(pc.data_pagamento, pc.created_at) >= p_inicio
      and coalesce(pc.data_pagamento, pc.created_at) < p_fim
      and pc.status = 'pago'
      and (p_forma_pagamento is null or pc.forma_pagamento = p_forma_pagamento)
  ),
  previous_external_payments as (
    select pc.*
    from public.pagamentos_clinica pc
    where pc.clinica_id = p_clinica_id
      and pc.agendamento_id is null
      and coalesce(pc.data_pagamento, pc.created_at) >= p_anterior_inicio
      and coalesce(pc.data_pagamento, pc.created_at) < p_anterior_fim
      and pc.status = 'pago'
      and (p_forma_pagamento is null or pc.forma_pagamento = p_forma_pagamento)
  ),
  current_crm as (
    select * from public.crm_oportunidades crm
    where crm.clinica_id = p_clinica_id
      and crm.created_at >= p_inicio and crm.created_at < p_fim
      and (p_origem is null or crm.origem = p_origem or crm.source = p_origem)
      and (p_canal is null or crm.medium = p_canal)
      and (p_crm_status is null or crm.status = p_crm_status)
  ),
  previous_crm as (
    select * from public.crm_oportunidades crm
    where crm.clinica_id = p_clinica_id
      and crm.created_at >= p_anterior_inicio and crm.created_at < p_anterior_fim
      and (p_origem is null or crm.origem = p_origem or crm.source = p_origem)
      and (p_canal is null or crm.medium = p_canal)
      and (p_crm_status is null or crm.status = p_crm_status)
  ),
  current_orders as (
    select * from public.pedidos_clinica o
    where o.clinica_id = p_clinica_id
      and o.created_at >= p_inicio and o.created_at < p_fim
  ),
  previous_orders as (
    select * from public.pedidos_clinica o
    where o.clinica_id = p_clinica_id
      and o.created_at >= p_anterior_inicio and o.created_at < p_anterior_fim
  ),
  current_summary as (
    select
      coalesce((select sum(valor) from current_billable), 0)::numeric as previsto,
      (
        coalesce((select sum(valor_pago) from current_billable), 0)
        + coalesce((select sum(valor_pago) from current_external_payments), 0)
      )::numeric as recebido,
      coalesce((select count(*) from current_appointments), 0)::integer as atendimentos,
      coalesce((select count(*) from current_appointments where status = 'concluido'), 0)::integer as concluidos,
      coalesce((select count(*) from current_appointments where status = 'confirmado'), 0)::integer as confirmados,
      coalesce((select count(*) from current_appointments where status = 'faltou'), 0)::integer as faltas,
      coalesce((select count(*) from current_appointments where status = 'cancelado'), 0)::integer as cancelamentos,
      coalesce((select count(*) from current_billable where pagamento_status = 'parcial'), 0)::integer as pagamentos_parciais,
      coalesce((select sum(valor_pago * coalesce(comissao_percentual, 0) / 100) from current_billable), 0)::numeric as comissoes,
      coalesce((select sum(minutos) from current_billable), 0)::numeric as minutos_ocupados,
      coalesce((select count(*) from public.clientes c where c.clinica_id = p_clinica_id and c.created_at >= p_inicio and c.created_at < p_fim), 0)::integer as clientes_novos,
      coalesce((select count(*) from current_crm), 0)::integer as leads,
      coalesce((select count(*) from current_crm where status = 'convertido'), 0)::integer as convertidos,
      coalesce((select sum(valor_estimado) from current_crm where status not in ('convertido', 'perdido')), 0)::numeric as pipeline,
      coalesce((select avg(extract(epoch from (updated_at - created_at)) / 86400.0) from current_crm where status = 'convertido'), 0)::numeric as dias_ate_conversao,
      coalesce((select count(*) from public.crm_oportunidades crm where crm.clinica_id = p_clinica_id and crm.status not in ('convertido', 'perdido') and crm.proxima_acao_em < least(p_fim, now())), 0)::integer as followups_vencidos,
      coalesce((select count(*) from public.crm_oportunidades crm where crm.clinica_id = p_clinica_id and crm.status not in ('convertido', 'perdido') and crm.proxima_acao_em >= least(p_fim, now())), 0)::integer as followups_futuros,
      coalesce((select count(*) from current_orders), 0)::integer as pedidos,
      coalesce((select count(*) from current_orders where pagamento_status = 'pago'), 0)::integer as pedidos_pagos,
      coalesce((select sum(total) from current_orders where pagamento_status = 'pago'), 0)::numeric as receita_ecommerce
  ),
  previous_summary as (
    select
      coalesce((select sum(valor) from previous_billable), 0)::numeric as previsto,
      (
        coalesce((select sum(valor_pago) from previous_billable), 0)
        + coalesce((select sum(valor_pago) from previous_external_payments), 0)
      )::numeric as recebido,
      coalesce((select count(*) from previous_appointments), 0)::integer as atendimentos,
      coalesce((select count(*) from previous_appointments where status = 'concluido'), 0)::integer as concluidos,
      coalesce((select count(*) from previous_appointments where status = 'confirmado'), 0)::integer as confirmados,
      coalesce((select count(*) from previous_appointments where status = 'faltou'), 0)::integer as faltas,
      coalesce((select count(*) from previous_appointments where status = 'cancelado'), 0)::integer as cancelamentos,
      coalesce((select count(*) from previous_billable where pagamento_status = 'parcial'), 0)::integer as pagamentos_parciais,
      coalesce((select sum(valor_pago * coalesce(comissao_percentual, 0) / 100) from previous_billable), 0)::numeric as comissoes,
      coalesce((select sum(minutos) from previous_billable), 0)::numeric as minutos_ocupados,
      coalesce((select count(*) from public.clientes c where c.clinica_id = p_clinica_id and c.created_at >= p_anterior_inicio and c.created_at < p_anterior_fim), 0)::integer as clientes_novos,
      coalesce((select count(*) from previous_crm), 0)::integer as leads,
      coalesce((select count(*) from previous_crm where status = 'convertido'), 0)::integer as convertidos,
      coalesce((select sum(valor_estimado) from previous_crm where status not in ('convertido', 'perdido')), 0)::numeric as pipeline,
      coalesce((select avg(extract(epoch from (updated_at - created_at)) / 86400.0) from previous_crm where status = 'convertido'), 0)::numeric as dias_ate_conversao,
      coalesce((select count(*) from public.crm_oportunidades crm where crm.clinica_id = p_clinica_id and crm.status not in ('convertido', 'perdido') and crm.proxima_acao_em < p_anterior_fim), 0)::integer as followups_vencidos,
      coalesce((select count(*) from public.crm_oportunidades crm where crm.clinica_id = p_clinica_id and crm.status not in ('convertido', 'perdido') and crm.proxima_acao_em >= p_anterior_fim), 0)::integer as followups_futuros,
      coalesce((select count(*) from previous_orders), 0)::integer as pedidos,
      coalesce((select count(*) from previous_orders where pagamento_status = 'pago'), 0)::integer as pedidos_pagos,
      coalesce((select sum(total) from previous_orders where pagamento_status = 'pago'), 0)::numeric as receita_ecommerce
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'inicio', p_inicio, 'fim', p_fim,
      'anterior_inicio', p_anterior_inicio, 'anterior_fim', p_anterior_fim,
      'timezone', p_timezone
    ),
    'atual', (
      select to_jsonb(s) || jsonb_build_object(
        'pendente', greatest(s.previsto - s.recebido, 0),
        'ticket_medio', case when s.atendimentos > 0 then s.recebido / s.atendimentos else 0 end,
        'taxa_conclusao', case when s.atendimentos > 0 then (s.concluidos::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_no_show', case when s.atendimentos > 0 then (s.faltas::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_cancelamento', case when s.atendimentos > 0 then (s.cancelamentos::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_conversao', case when s.leads > 0 then (s.convertidos::numeric / s.leads) * 100 else 0 end,
        'ticket_ecommerce', case when s.pedidos_pagos > 0 then s.receita_ecommerce / s.pedidos_pagos else 0 end
      ) from current_summary s
    ),
    'anterior', (
      select to_jsonb(s) || jsonb_build_object(
        'pendente', greatest(s.previsto - s.recebido, 0),
        'ticket_medio', case when s.atendimentos > 0 then s.recebido / s.atendimentos else 0 end,
        'taxa_conclusao', case when s.atendimentos > 0 then (s.concluidos::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_no_show', case when s.atendimentos > 0 then (s.faltas::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_cancelamento', case when s.atendimentos > 0 then (s.cancelamentos::numeric / s.atendimentos) * 100 else 0 end,
        'taxa_conversao', case when s.leads > 0 then (s.convertidos::numeric / s.leads) * 100 else 0 end,
        'ticket_ecommerce', case when s.pedidos_pagos > 0 then s.receita_ecommerce / s.pedidos_pagos else 0 end
      ) from previous_summary s
    ),
    'timeline', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.data)
      from (
        select
          (a.inicio at time zone p_timezone)::date as data,
          count(*)::integer as atendimentos,
          coalesce(sum(a.valor) filter (where a.status not in ('cancelado', 'faltou') and a.pagamento_status is distinct from 'cancelado'), 0)::numeric as previsto,
          coalesce(sum(a.valor_pago) filter (where a.status not in ('cancelado', 'faltou') and a.pagamento_status is distinct from 'cancelado'), 0)::numeric as recebido
        from current_appointments a
        group by (a.inicio at time zone p_timezone)::date
      ) row_data
    ), '[]'::jsonb),
    'receita_forma_pagamento', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.recebido desc)
      from (
        select coalesce(forma_pagamento, 'não informada') as forma,
          sum(recebido)::numeric as recebido,
          count(*)::integer as registros
        from (
          select forma_pagamento, valor_pago as recebido from current_billable where valor_pago > 0
          union all
          select forma_pagamento, valor_pago as recebido from current_external_payments where valor_pago > 0
        ) payments
        group by coalesce(forma_pagamento, 'não informada')
      ) row_data
    ), '[]'::jsonb),
    'agenda_status', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.quantidade desc)
      from (
        select status, count(*)::integer as quantidade
        from current_appointments group by status
      ) row_data
    ), '[]'::jsonb),
    'agenda_horarios', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.quantidade desc)
      from (
        select extract(hour from inicio at time zone p_timezone)::integer as hora, count(*)::integer as quantidade
        from current_appointments group by extract(hour from inicio at time zone p_timezone)
        order by quantidade desc limit 12
      ) row_data
    ), '[]'::jsonb),
    'agenda_dias_semana', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.quantidade desc)
      from (
        select extract(isodow from inicio at time zone p_timezone)::integer as dia, count(*)::integer as quantidade
        from current_appointments group by extract(isodow from inicio at time zone p_timezone)
      ) row_data
    ), '[]'::jsonb),
    'funil_crm', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.ordem)
      from (
        select stages.status, stages.nome, stages.ordem,
          coalesce(count(crm.id), 0)::integer as quantidade,
          coalesce(sum(crm.valor_estimado), 0)::numeric as valor
        from (values
          ('lead', 'Lead', 1),
          ('avaliacao_marcada', 'Avaliação marcada', 2),
          ('em_negociacao', 'Em negociação', 3),
          ('convertido', 'Convertido', 4),
          ('perdido', 'Perdido', 5)
        ) stages(status, nome, ordem)
        left join current_crm crm on crm.status = stages.status
        group by stages.status, stages.nome, stages.ordem
      ) row_data
    ), '[]'::jsonb),
    'origens_crm', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.leads desc)
      from (
        select coalesce(source, origem, 'não informada') as origem,
          count(*)::integer as leads,
          count(*) filter (where status = 'convertido')::integer as convertidos,
          coalesce(sum(valor_estimado), 0)::numeric as valor
        from current_crm
        group by coalesce(source, origem, 'não informada')
        order by leads desc limit 12
      ) row_data
    ), '[]'::jsonb),
    'procedimentos', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.recebido desc)
      from (
        select procedimento_id as id, coalesce(procedimento_nome, 'Sem procedimento') as nome,
          coalesce(categoria, 'Sem categoria') as categoria,
          count(*) filter (where status = 'concluido')::integer as quantidade,
          count(distinct cliente_id) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado')::integer as clientes_unicos,
          coalesce(sum(valor) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'), 0)::numeric as previsto,
          coalesce(sum(valor_pago) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'), 0)::numeric as recebido,
          case
            when count(*) filter (where status = 'concluido') > 0
              then coalesce(sum(valor_pago) filter (where status = 'concluido' and pagamento_status is distinct from 'cancelado'), 0)
                / count(*) filter (where status = 'concluido')
            else 0
          end::numeric as ticket_medio,
          count(*) filter (where status = 'faltou')::integer as faltas,
          count(*) filter (where status = 'cancelado')::integer as cancelamentos
        from current_appointments
        group by procedimento_id, procedimento_nome, categoria
        order by recebido desc limit 20
      ) row_data
    ), '[]'::jsonb),
    'profissionais', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.recebido desc)
      from (
        select profissional_id as id, coalesce(profissional_nome, 'Sem profissional') as nome,
          count(*)::integer as atendimentos,
          count(distinct cliente_id)::integer as clientes_unicos,
          coalesce(sum(valor) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'), 0)::numeric as previsto,
          coalesce(sum(valor_pago) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'), 0)::numeric as recebido,
          coalesce(sum(valor_pago * coalesce(comissao_percentual, 0) / 100) filter (where status not in ('cancelado', 'faltou') and pagamento_status is distinct from 'cancelado'), 0)::numeric as repasse,
          count(*) filter (where status = 'faltou')::integer as faltas,
          count(*) filter (where status = 'cancelado')::integer as cancelamentos,
          coalesce(sum(minutos) filter (where status not in ('cancelado', 'faltou')), 0)::numeric as minutos_ocupados
        from current_appointments
        group by profissional_id, profissional_nome
        order by recebido desc limit 20
      ) row_data
    ), '[]'::jsonb),
    'pacientes', jsonb_build_object(
      'total', (select count(*) from public.clientes c where c.clinica_id = p_clinica_id),
      'ativos', (select count(*) from public.clientes c where c.clinica_id = p_clinica_id and c.status = 'ativo'),
      'inativos', (select count(*) from public.clientes c where c.clinica_id = p_clinica_id and c.status = 'inativo'),
      'novos', (select clientes_novos from current_summary),
      'recorrentes', (
        select count(*) from (
          select cliente_id from current_billable where cliente_id is not null
          group by cliente_id having count(*) >= 2
        ) recurring
      ),
      'sem_retorno_90', (
        select count(*) from (
          select c.id
          from public.clientes c
          left join public.agendamentos a on a.cliente_id = c.id and a.clinica_id = c.clinica_id
            and a.status not in ('cancelado', 'faltou')
          where c.clinica_id = p_clinica_id
          group by c.id
          having max(a.inicio) is null or max(a.inicio) < (p_fim - interval '90 days')
        ) inactive_clients
      )
    ),
    'pacientes_top', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.recebido desc)
      from (
        select cliente_id as id, coalesce(cliente_nome, 'Cliente não informado') as nome,
          count(*)::integer as atendimentos,
          sum(valor_pago)::numeric as recebido,
          avg(valor_pago)::numeric as ticket_medio
        from current_billable
        where cliente_id is not null
        group by cliente_id, cliente_nome
        order by recebido desc limit 20
      ) row_data
    ), '[]'::jsonb),
    'pacotes', jsonb_build_object(
      'vendidos', (
        select count(*) from public.cliente_pacotes cp
        where cp.clinica_id = p_clinica_id and cp.created_at >= p_inicio and cp.created_at < p_fim and cp.status <> 'cancelado'
      ),
      'valor_vendido', (
        select coalesce(sum(cp.valor_total), 0) from public.cliente_pacotes cp
        where cp.clinica_id = p_clinica_id and cp.created_at >= p_inicio and cp.created_at < p_fim and cp.status <> 'cancelado'
      ),
      'sessoes_vendidas', (
        select coalesce(sum(cp.sessoes_total), 0) from public.cliente_pacotes cp
        where cp.clinica_id = p_clinica_id and cp.created_at >= p_inicio and cp.created_at < p_fim and cp.status <> 'cancelado'
      ),
      'sessoes_utilizadas', (
        select coalesce(sum(cp.sessoes_utilizadas), 0) from public.cliente_pacotes cp
        where cp.clinica_id = p_clinica_id and cp.status in ('ativo', 'finalizado')
      ),
      'sessoes_restantes', (
        select coalesce(sum(cp.sessoes_total - cp.sessoes_utilizadas), 0) from public.cliente_pacotes cp
        where cp.clinica_id = p_clinica_id and cp.status = 'ativo'
      )
    ),
    'estoque', jsonb_build_object(
      'skus', (select count(*) from public.produtos_clinica p where p.clinica_id = p_clinica_id and p.ativo),
      'valor_custo', (select coalesce(sum(p.custo * p.estoque_atual), 0) from public.produtos_clinica p where p.clinica_id = p_clinica_id and p.ativo),
      'estoque_baixo', (select count(*) from public.produtos_clinica p where p.clinica_id = p_clinica_id and p.ativo and p.estoque_atual > 0 and p.estoque_atual <= p.estoque_minimo),
      'estoque_zerado', (select count(*) from public.produtos_clinica p where p.clinica_id = p_clinica_id and p.ativo and p.estoque_atual = 0),
      'publicados', (select count(*) from public.produtos_clinica p where p.clinica_id = p_clinica_id and p.ativo and p.publicado_site)
    ),
    'produtos_vendidos', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.receita desc)
      from (
        select i.produto_id as id, i.nome_produto as nome,
          sum(i.quantidade)::numeric as unidades,
          sum(i.total)::numeric as receita
        from public.pedido_itens_clinica i
        join current_orders o on o.id = i.pedido_id and o.pagamento_status = 'pago'
        group by i.produto_id, i.nome_produto
        order by receita desc limit 15
      ) row_data
    ), '[]'::jsonb),
    'ecommerce', jsonb_build_object(
      'pedidos', (select pedidos from current_summary),
      'pagos', (select pedidos_pagos from current_summary),
      'receita', (select receita_ecommerce from current_summary),
      'pendentes', (select count(*) from current_orders where pagamento_status in ('pendente', 'pagar_na_retirada')),
      'cancelados', (select count(*) from current_orders where status = 'cancelado'),
      'estornados', (select count(*) from current_orders where status = 'estornado' or pagamento_status = 'estornado'),
      'carrinhos_abandonados', (
        select count(*) from public.carrinhos_abandonados_clinica c
        where c.clinica_id = p_clinica_id and c.created_at >= p_inicio and c.created_at < p_fim and c.status = 'ativo'
      ),
      'carrinhos_recuperados', (
        select count(*) from public.carrinhos_abandonados_clinica c
        where c.clinica_id = p_clinica_id and c.created_at >= p_inicio and c.created_at < p_fim and c.status in ('recuperado', 'convertido')
      ),
      'cupons_usados', (select count(*) from current_orders where cupom_id is not null)
    ),
    'eventos', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.quantidade desc)
      from (
        select event_name, count(*)::integer as quantidade
        from public.eventos_analiticos e
        where e.clinica_id = p_clinica_id and e.occurred_at >= p_inicio and e.occurred_at < p_fim
        group by event_name
      ) row_data
    ), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.periodo_inicio)
      from (
        select id, tipo, referencia, periodo_inicio, periodo_fim, valor_meta, profissional_id, metadata
        from public.metas_clinica m
        where m.clinica_id = p_clinica_id
          and m.periodo_fim >= (p_inicio at time zone p_timezone)::date
          and m.periodo_inicio <= (p_fim at time zone p_timezone)::date
        order by periodo_inicio
      ) row_data
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.bi_resumo_clinica(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.bi_resumo_clinica(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, text, text) to authenticated;

comment on function public.bi_resumo_clinica(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, text, text)
  is 'Contrato agregado e multi-tenant do BI. Valida acesso, respeita RLS e não retorna prontuário nem dados clínicos sensíveis.';

create or replace function public.bi_detalhes_clinica(
  p_clinica_id uuid,
  p_tipo text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_timezone text default 'America/Bahia',
  p_limite integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public, app_private, pg_temp
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_limit integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not app_private.usuario_pode_bi_clinica(p_clinica_id)
     or not app_private.clinica_tem_capability_bi(p_clinica_id) then
    raise exception 'Acesso negado ao BI desta clínica.' using errcode = '42501';
  end if;

  if p_tipo in ('no_show', 'cancelamentos') then
    select count(*) into v_total
    from public.agendamentos a
    where a.clinica_id = p_clinica_id
      and a.inicio >= p_inicio and a.inicio < p_fim
      and a.status = case when p_tipo = 'no_show' then 'faltou' else 'cancelado' end;

    select coalesce(jsonb_agg(to_jsonb(result_row) order by result_row.inicio desc), '[]'::jsonb) into v_rows
    from (
      select a.id, a.inicio, a.status, a.valor, a.valor_pago, a.pagamento_status,
        coalesce(c.nome, 'Cliente não informado') as cliente,
        coalesce(pr.nome, 'Profissional não informado') as profissional,
        coalesce(p.nome, 'Procedimento não informado') as procedimento
      from public.agendamentos a
      left join public.clientes c on c.id = a.cliente_id and c.clinica_id = a.clinica_id
      left join public.profissionais pr on pr.id = a.profissional_id and pr.clinica_id = a.clinica_id
      left join public.procedimentos p on p.id = a.procedimento_id and p.clinica_id = a.clinica_id
      where a.clinica_id = p_clinica_id
        and a.inicio >= p_inicio and a.inicio < p_fim
        and a.status = case when p_tipo = 'no_show' then 'faltou' else 'cancelado' end
      order by a.inicio desc
      limit v_limit offset v_offset
    ) result_row;
  elsif p_tipo = 'leads_perdidos' then
    select count(*) into v_total
    from public.crm_oportunidades crm
    where crm.clinica_id = p_clinica_id and crm.status = 'perdido'
      and crm.created_at >= p_inicio and crm.created_at < p_fim;

    select coalesce(jsonb_agg(to_jsonb(result_row) order by result_row.created_at desc), '[]'::jsonb) into v_rows
    from (
      select crm.id, crm.nome, crm.telefone, crm.email, crm.origem, crm.source,
        crm.valor_estimado, crm.observacoes, crm.created_at
      from public.crm_oportunidades crm
      where crm.clinica_id = p_clinica_id and crm.status = 'perdido'
        and crm.created_at >= p_inicio and crm.created_at < p_fim
      order by crm.created_at desc
      limit v_limit offset v_offset
    ) result_row;
  elsif p_tipo = 'sem_retorno' then
    with clientes_sem_retorno as (
      select c.id, c.nome, c.telefone, c.email, max(a.inicio) as ultimo_atendimento
      from public.clientes c
      left join public.agendamentos a on a.cliente_id = c.id and a.clinica_id = c.clinica_id
        and a.status not in ('cancelado', 'faltou')
      where c.clinica_id = p_clinica_id
      group by c.id, c.nome, c.telefone, c.email
      having max(a.inicio) is null or max(a.inicio) < (p_fim - interval '90 days')
    )
    select count(*) into v_total from clientes_sem_retorno;

    with clientes_sem_retorno as (
      select c.id, c.nome, c.telefone, c.email, max(a.inicio) as ultimo_atendimento
      from public.clientes c
      left join public.agendamentos a on a.cliente_id = c.id and a.clinica_id = c.clinica_id
        and a.status not in ('cancelado', 'faltou')
      where c.clinica_id = p_clinica_id
      group by c.id, c.nome, c.telefone, c.email
      having max(a.inicio) is null or max(a.inicio) < (p_fim - interval '90 days')
    )
    select coalesce(jsonb_agg(to_jsonb(result_row) order by result_row.ultimo_atendimento asc nulls first), '[]'::jsonb) into v_rows
    from (
      select * from clientes_sem_retorno
      order by ultimo_atendimento asc nulls first
      limit v_limit offset v_offset
    ) result_row;
  else
    raise exception 'Tipo de detalhamento inválido.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'tipo', p_tipo,
    'total', v_total,
    'limite', v_limit,
    'offset', v_offset,
    'timezone', p_timezone,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.bi_detalhes_clinica(uuid, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.bi_detalhes_clinica(uuid, text, timestamptz, timestamptz, text, integer, integer) to authenticated;

comment on function public.bi_detalhes_clinica(uuid, text, timestamptz, timestamptz, text, integer, integer)
  is 'Drill-down paginado do BI para proprietários e administradores da clínica.';

commit;
