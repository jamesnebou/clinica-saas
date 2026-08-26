begin;

-- Backfill conservador e idempotente. Valores inferidos ficam marcados em metadata.
insert into public.finance_recebiveis(
  clinica_id,cliente_id,profissional_id,procedimento_id,agendamento_id,categoria_id,centro_custo_id,
  descricao,origem_tipo,origem_id,valor_original,valor_recebido,emissao,competencia,vencimento,status,forma_pagamento,provider,provider_reference,metadata
)
select a.clinica_id,a.cliente_id,a.profissional_id,a.procedimento_id,a.id,cat.id,cc.id,
  coalesce(p.nome,'Atendimento'), 'agendamento',a.id::text,a.valor,
  least(a.valor,case when a.pagamento_status='cancelado' then 0 else coalesce(a.valor_pago,0) end),
  a.created_at::date,date_trunc('month',a.inicio)::date,a.inicio::date,
  case when a.status in ('cancelado','faltou') or a.pagamento_status='cancelado' then 'cancelado'
       when coalesce(a.valor_pago,0)>=a.valor and a.valor>0 then 'pago' when coalesce(a.valor_pago,0)>0 then 'parcial' else 'aberto' end,
  a.forma_pagamento,spa.pagamento_gateway,
  coalesce(spa.pagamento_external_id,spa.asaas_payment_id),
  jsonb_build_object('backfill',true,'fonte','agendamentos','inferido',true)
from public.agendamentos a
left join public.procedimentos p on p.id=a.procedimento_id and p.clinica_id=a.clinica_id
join public.finance_categorias cat on cat.clinica_id=a.clinica_id and cat.codigo='REC_SERVICOS'
left join public.finance_centros_custo cc on cc.clinica_id=a.clinica_id and cc.codigo='CLINICA'
left join public.site_agendamentos_publicos spa on spa.agendamento_id=a.id and spa.clinica_id=a.clinica_id
on conflict (clinica_id,origem_tipo,origem_id) do nothing;

insert into public.finance_recebiveis(
  clinica_id,cliente_id,cliente_pacote_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,
  valor_original,valor_recebido,emissao,competencia,vencimento,status,forma_pagamento,metadata
)
select cp.clinica_id,cp.cliente_id,cp.id,cat.id,cc.id,'Pacote: '||cp.nome_pacote,'cliente_pacote',cp.id::text,
  cp.valor_total,least(cp.valor_total,coalesce(pg.valor_pago,0)),cp.data_compra,date_trunc('month',cp.data_compra)::date,cp.data_compra,
  case when cp.status='cancelado' or pg.status='cancelado' then 'cancelado' when coalesce(pg.valor_pago,0)>=cp.valor_total and cp.valor_total>0 then 'pago' when coalesce(pg.valor_pago,0)>0 then 'parcial' else 'aberto' end,
  pg.forma_pagamento,jsonb_build_object('backfill',true,'fonte','cliente_pacotes','pagamento_legado_id',pg.id,'inferido',true)
from public.cliente_pacotes cp
join public.finance_categorias cat on cat.clinica_id=cp.clinica_id and cat.codigo='REC_PACOTES'
left join public.finance_centros_custo cc on cc.clinica_id=cp.clinica_id and cc.codigo='CLINICA'
left join lateral (select x.* from public.pagamentos_clinica x where x.clinica_id=cp.clinica_id and x.observacoes like '%cliente_pacote_id:'||cp.id::text||'%' order by x.created_at desc limit 1) pg on true
on conflict (clinica_id,origem_tipo,origem_id) do nothing;

insert into public.finance_recebiveis(
  clinica_id,cliente_id,pedido_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,valor_recebido,
  emissao,competencia,vencimento,status,forma_pagamento,provider,provider_reference,metadata
)
select pe.clinica_id,pe.cliente_id,pe.id,cat.id,cc.id,'Pedido #'||pe.numero,'ecommerce',pe.id::text,pe.total,
  case when pe.pagamento_status='pago' then pe.total else 0 end,pe.created_at::date,date_trunc('month',coalesce(pe.pago_em,pe.created_at))::date,
  pe.created_at::date,case when pe.status in ('cancelado','estornado') or pe.pagamento_status in ('cancelado','estornado') then 'cancelado' when pe.pagamento_status='pago' then 'pago' else 'aberto' end,
  pe.forma_pagamento,pe.pagamento_gateway,coalesce(pe.pagamento_external_id,pe.asaas_payment_id),
  jsonb_build_object('backfill',true,'fonte','pedidos_clinica','inferido',true)
from public.pedidos_clinica pe
join public.finance_categorias cat on cat.clinica_id=pe.clinica_id and cat.codigo='REC_PRODUTOS'
left join public.finance_centros_custo cc on cc.clinica_id=pe.clinica_id and cc.codigo='CLINICA'
on conflict (clinica_id,origem_tipo,origem_id) do nothing;

insert into public.finance_recebiveis(
  clinica_id,cliente_id,profissional_id,categoria_id,centro_custo_id,descricao,origem_tipo,origem_id,valor_original,valor_recebido,
  emissao,competencia,vencimento,status,forma_pagamento,metadata
)
select pg.clinica_id,pg.cliente_id,pg.profissional_id,cat.id,cc.id,coalesce(pg.descricao,'Recebimento legado'),'pagamento_legado',pg.id::text,
  pg.valor,case when pg.status='cancelado' then 0 else least(pg.valor,pg.valor_pago) end,pg.created_at::date,
  date_trunc('month',coalesce(pg.data_pagamento,pg.created_at))::date,coalesce(pg.data_vencimento,pg.created_at::date),
  case when pg.status='cancelado' then 'cancelado' when pg.valor_pago>=pg.valor and pg.valor>0 then 'pago' when pg.valor_pago>0 then 'parcial' else 'aberto' end,
  pg.forma_pagamento,jsonb_build_object('backfill',true,'fonte','pagamentos_clinica','inferido',true)
from public.pagamentos_clinica pg
join public.finance_categorias cat on cat.clinica_id=pg.clinica_id and cat.codigo='REC_SERVICOS'
left join public.finance_centros_custo cc on cc.clinica_id=pg.clinica_id and cc.codigo='CLINICA'
where pg.agendamento_id is null and coalesce(pg.observacoes,'') not like '%cliente_pacote_id:%'
on conflict (clinica_id,origem_tipo,origem_id) do nothing;

-- Liquidações históricas representam apenas valores explicitamente pagos no legado.
insert into public.finance_liquidacoes(clinica_id,recebivel_id,conta_financeira_id,tipo,valor_bruto,valor_liquido,forma_pagamento,data_liquidacao,
  provider,provider_reference,idempotency_key,conciliado,metadata)
select r.clinica_id,r.id,ct.id,'recebimento',r.valor_recebido,r.valor_recebido,r.forma_pagamento,
  coalesce(a.data_pagamento,pe.pago_em,pg.data_pagamento,r.created_at),r.provider,r.provider_reference,'backfill:recebivel:'||r.id::text,
  r.provider_reference is not null,jsonb_build_object('backfill',true,'inferido',true)
from public.finance_recebiveis r
join public.finance_contas ct on ct.clinica_id=r.clinica_id and ct.padrao and ct.ativa
left join public.agendamentos a on r.origem_tipo='agendamento' and a.id=r.agendamento_id
left join public.pedidos_clinica pe on r.origem_tipo='ecommerce' and pe.id=r.pedido_id
left join public.pagamentos_clinica pg on r.origem_tipo='pagamento_legado' and pg.id::text=r.origem_id
where r.valor_recebido>0
on conflict (clinica_id,idempotency_key) do nothing;

insert into public.finance_movimentos(clinica_id,conta_financeira_id,categoria_id,centro_custo_id,liquidacao_id,tipo,origem_tipo,origem_id,
  descricao,valor_bruto,valor_liquido,data_movimento,competencia,provider,provider_reference,conciliado,metadata)
select l.clinica_id,l.conta_financeira_id,r.categoria_id,r.centro_custo_id,l.id,'entrada','liquidacao',l.id::text,r.descricao,
  l.valor_bruto,l.valor_liquido,l.data_liquidacao,date_trunc('month',l.data_liquidacao)::date,l.provider,l.provider_reference,l.conciliado,
  jsonb_build_object('backfill',true,'inferido',true)
from public.finance_liquidacoes l join public.finance_recebiveis r on r.id=l.recebivel_id and r.clinica_id=l.clinica_id
where l.idempotency_key like 'backfill:%'
on conflict (clinica_id,origem_tipo,origem_id,tipo) do nothing;

-- Competência só é reconhecida quando o fato gerador é conhecido.
insert into public.finance_competencias(clinica_id,categoria_id,centro_custo_id,recebivel_id,origem_tipo,origem_id,descricao,tipo,competencia,valor,metadata)
select r.clinica_id,r.categoria_id,r.centro_custo_id,r.id,'agendamento',r.origem_id,r.descricao,'receita',date_trunc('month',a.inicio)::date,r.valor_total,
  jsonb_build_object('backfill',true,'fato_gerador','atendimento_concluido')
from public.finance_recebiveis r join public.agendamentos a on a.id=r.agendamento_id and a.clinica_id=r.clinica_id
where r.origem_tipo='agendamento' and a.status='concluido' and r.status<>'cancelado'
on conflict (clinica_id,origem_tipo,origem_id,tipo) do nothing;

insert into public.finance_competencias(clinica_id,categoria_id,centro_custo_id,recebivel_id,origem_tipo,origem_id,descricao,tipo,competencia,valor,metadata)
select r.clinica_id,r.categoria_id,r.centro_custo_id,r.id,'ecommerce',r.origem_id,r.descricao,'receita',date_trunc('month',pe.pago_em)::date,r.valor_total,
  jsonb_build_object('backfill',true,'fato_gerador','pedido_pago')
from public.finance_recebiveis r join public.pedidos_clinica pe on pe.id=r.pedido_id and pe.clinica_id=r.clinica_id
where r.origem_tipo='ecommerce' and pe.pagamento_status='pago' and pe.pago_em is not null
on conflict (clinica_id,origem_tipo,origem_id,tipo) do nothing;

commit;
