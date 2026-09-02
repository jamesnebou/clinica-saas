begin;

insert into public.planos_sistema (
  slug,
  nome,
  descricao,
  preco_mensal,
  limite_usuarios,
  limite_profissionais,
  limite_clientes,
  limite_agendamentos_mes,
  ativo,
  ordem,
  metadata
)
values (
  'ilimitado',
  'Ilimitado',
  'Plano completo para demonstração e operações sem limites comerciais.',
  0,
  999,
  999,
  999999,
  999999,
  false,
  999,
  jsonb_build_object('capabilities', '[]'::jsonb, 'demo_full_access', true, 'internal_only', true)
)
on conflict (slug) do update set
  limite_usuarios = greatest(public.planos_sistema.limite_usuarios, excluded.limite_usuarios),
  limite_profissionais = greatest(public.planos_sistema.limite_profissionais, excluded.limite_profissionais),
  limite_clientes = greatest(public.planos_sistema.limite_clientes, excluded.limite_clientes),
  limite_agendamentos_mes = greatest(public.planos_sistema.limite_agendamentos_mes, excluded.limite_agendamentos_mes),
  metadata = coalesce(public.planos_sistema.metadata, '{}'::jsonb)
    || jsonb_build_object('capabilities', '[]'::jsonb, 'demo_full_access', true),
  updated_at = now();

update public.clinicas
set plano = 'ilimitado',
    assinatura_status = 'isenta',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('demo_full_access', true),
    updated_at = now()
where slug = 'demo-nexawi-clinicas'
  and coalesce(metadata ->> 'demo', 'false') = 'true';

commit;
