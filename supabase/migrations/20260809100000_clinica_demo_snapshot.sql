-- Snapshot privado e restauracao atomica da conta demonstrativa.

create table if not exists public.clinica_demo_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references public.clinicas(id) on delete cascade,
  snapshot jsonb not null,
  versao integer not null default 1,
  congelado_em timestamptz not null default now(),
  restaurado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinica_demo_snapshots enable row level security;
revoke all on public.clinica_demo_snapshots from public, anon, authenticated;
grant all privileges on public.clinica_demo_snapshots to service_role;

create or replace function public.capture_clinica_demo_snapshot(p_clinica_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_rows jsonb;
  v_table text;
  v_tables text[] := array[
    'clientes', 'profissionais', 'procedimentos', 'pacotes_clinica',
    'cliente_pacotes', 'produtos_clinica', 'agendamentos',
    'crm_oportunidades', 'clinica_dominios', 'clinica_integracoes',
    'cliente_consentimentos', 'cliente_fotos', 'site_agendamentos_publicos',
    'cupons_clinica', 'pedidos_clinica', 'pedido_itens_clinica',
    'estoque_reservas_clinica', 'estoque_movimentos_clinica',
    'carrinhos_abandonados_clinica', 'pagamentos_clinica',
    'pagamentos_loja_clinica'
  ];
begin
  if p_clinica_id is null then
    raise exception 'Clinica demo nao informada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('clinica-demo:' || p_clinica_id::text, 0));

  if exists (select 1 from public.clinica_demo_snapshots where clinica_id = p_clinica_id) then
    return false;
  end if;

  select jsonb_build_object('clinicas', to_jsonb(c)) into v_snapshot
  from public.clinicas c where c.id = p_clinica_id;

  if v_snapshot is null then
    raise exception 'Clinica demo nao encontrada.';
  end if;

  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from public.%I row_data where clinica_id = $1',
        v_table
      ) using p_clinica_id into v_rows;
      v_snapshot := jsonb_set(v_snapshot, array[v_table], coalesce(v_rows, '[]'::jsonb), true);
    end if;
  end loop;

  insert into public.clinica_demo_snapshots (clinica_id, snapshot)
  values (p_clinica_id, v_snapshot);
  return true;
end;
$$;

create or replace function public.restore_clinica_demo_snapshot(p_clinica_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_clinic public.clinicas%rowtype;
  v_table text;
  v_delete_order text[] := array[
    'estoque_reservas_clinica', 'estoque_movimentos_clinica',
    'pedido_itens_clinica', 'carrinhos_abandonados_clinica',
    'pagamentos_loja_clinica', 'pagamentos_clinica', 'pedidos_clinica',
    'cupons_clinica', 'site_agendamentos_publicos', 'agendamentos',
    'cliente_pacotes', 'cliente_fotos', 'cliente_consentimentos',
    'crm_oportunidades', 'produtos_clinica', 'pacotes_clinica',
    'procedimentos', 'profissionais', 'clientes', 'clinica_dominios',
    'clinica_integracoes'
  ];
  v_insert_order text[] := array[
    'clientes', 'profissionais', 'procedimentos', 'pacotes_clinica',
    'cliente_pacotes', 'produtos_clinica', 'agendamentos',
    'crm_oportunidades', 'clinica_dominios', 'clinica_integracoes',
    'cliente_consentimentos', 'cliente_fotos', 'site_agendamentos_publicos',
    'cupons_clinica', 'pedidos_clinica', 'pedido_itens_clinica',
    'estoque_reservas_clinica', 'estoque_movimentos_clinica',
    'carrinhos_abandonados_clinica', 'pagamentos_clinica',
    'pagamentos_loja_clinica'
  ];
begin
  if p_clinica_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('clinica-demo:' || p_clinica_id::text, 0));

  select snapshot into v_snapshot
  from public.clinica_demo_snapshots
  where clinica_id = p_clinica_id for update;
  if v_snapshot is null then return false; end if;

  select * into v_clinic
  from jsonb_populate_record(null::public.clinicas, v_snapshot -> 'clinicas');

  foreach v_table in array v_delete_order loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where clinica_id = $1', v_table) using p_clinica_id;
    end if;
  end loop;

  update public.clinicas set
    nome = v_clinic.nome, slug = v_clinic.slug, documento = v_clinic.documento,
    telefone = v_clinic.telefone, email = v_clinic.email, cidade = v_clinic.cidade,
    estado = v_clinic.estado, endereco = v_clinic.endereco, status = v_clinic.status,
    plano = v_clinic.plano, metadata = v_clinic.metadata,
    trial_ends_at = v_clinic.trial_ends_at, billing_email = v_clinic.billing_email,
    asaas_customer_id = v_clinic.asaas_customer_id,
    asaas_subscription_id = v_clinic.asaas_subscription_id,
    assinatura_status = v_clinic.assinatura_status,
    proxima_cobranca_em = v_clinic.proxima_cobranca_em,
    bloqueada_em = v_clinic.bloqueada_em,
    bloqueio_motivo = v_clinic.bloqueio_motivo,
    updated_at = now()
  where id = p_clinica_id;

  foreach v_table in array v_insert_order loop
    if to_regclass('public.' || v_table) is not null and v_snapshot ? v_table then
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        v_table, v_table
      ) using coalesce(v_snapshot -> v_table, '[]'::jsonb);
    end if;
  end loop;

  update public.clinica_demo_snapshots
  set restaurado_em = now(), updated_at = now()
  where clinica_id = p_clinica_id;
  return true;
end;
$$;

create or replace function public.rebase_clinica_demo_timeline(p_clinica_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.clinicas
    where id = p_clinica_id and slug = 'demo-nexawi-clinicas'
  ) then return false; end if;

  with ranked as (
    select id, row_number() over (order by inicio, id) as position
    from public.agendamentos where clinica_id = p_clinica_id
  ), slots(position, offset_days, start_at) as (
    values (1,-6,'09:00'::time),(2,-5,'14:00'::time),(3,-4,'10:00'::time),
      (4,-3,'15:00'::time),(5,-2,'11:00'::time),(6,-1,'16:00'::time),
      (7,0,'09:00'::time),(8,0,'11:00'::time),(9,0,'15:00'::time),
      (10,1,'10:00'::time),(11,1,'14:00'::time),(12,2,'09:00'::time),
      (13,3,'16:00'::time),(14,4,'11:00'::time)
  ), resolved as (
    select r.id, (((current_date + s.offset_days) + s.start_at) at time zone 'America/Bahia') as inicio
    from ranked r join slots s using (position)
  )
  update public.agendamentos a set
    inicio = r.inicio,
    fim = r.inicio + (a.fim - a.inicio),
    data_pagamento = case when a.valor_pago > 0 then r.inicio + interval '5 minutes' else null end,
    created_at = least(now() - interval '30 minutes', r.inicio - interval '2 days'),
    updated_at = now()
  from resolved r where a.id = r.id and a.clinica_id = p_clinica_id;

  update public.pagamentos_clinica p set
    data_pagamento = case when p.valor_pago > 0 then a.inicio + interval '5 minutes' else null end,
    data_vencimento = a.inicio::date, updated_at = now()
  from public.agendamentos a
  where p.agendamento_id = a.id and p.clinica_id = p_clinica_id;

  return true;
end;
$$;

revoke all on function public.capture_clinica_demo_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.restore_clinica_demo_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.rebase_clinica_demo_timeline(uuid) from public, anon, authenticated;
grant execute on function public.capture_clinica_demo_snapshot(uuid) to service_role;
grant execute on function public.restore_clinica_demo_snapshot(uuid) to service_role;
grant execute on function public.rebase_clinica_demo_timeline(uuid) to service_role;

comment on table public.clinica_demo_snapshots is
  'Snapshot privado usado para restaurar a conta publica de demonstracao.';
