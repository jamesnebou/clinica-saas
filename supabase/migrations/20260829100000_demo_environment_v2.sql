begin;

create schema if not exists app_private;

create table if not exists app_private.demo_environments (
  clinic_id uuid primary key references public.clinicas(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  login_email text not null,
  clinic_slug text not null,
  segment_slug text,
  dataset_version integer not null check (dataset_version > 0),
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reset_at timestamptz
);

create table if not exists app_private.demo_reset_registry (
  table_name text primary key check (table_name ~ '^[a-z][a-z0-9_]*$'),
  delete_order integer not null unique,
  insert_order integer not null unique,
  required boolean not null default true,
  description text
);

revoke all on app_private.demo_environments from public, anon, authenticated;
revoke all on app_private.demo_reset_registry from public, anon, authenticated;

with registry(table_name, description) as (
  values
    ('finance_comissao_pagamento_itens', 'Itens de pagamentos de comissao'),
    ('finance_comissao_pagamentos', 'Pagamentos de comissao'),
    ('finance_transferencias', 'Transferencias financeiras'),
    ('finance_conciliacoes', 'Conciliacoes financeiras'),
    ('finance_movimentos', 'Movimentos financeiros'),
    ('finance_liquidacao_parcelas', 'Vinculos entre liquidacoes e parcelas'),
    ('finance_comissoes', 'Comissoes provisionadas'),
    ('finance_competencias', 'Competencias financeiras'),
    ('finance_liquidacoes', 'Liquidacoes financeiras'),
    ('finance_recebivel_parcelas', 'Parcelas de recebiveis'),
    ('finance_pagavel_parcelas', 'Parcelas de pagaveis'),
    ('finance_recebiveis', 'Contas a receber'),
    ('finance_pagaveis', 'Contas a pagar'),
    ('finance_recorrencias', 'Recorrencias financeiras'),
    ('finance_orcamentos', 'Orcamentos financeiros'),
    ('finance_comissao_regras', 'Regras de comissao'),
    ('finance_configuracoes', 'Configuracao financeira'),
    ('finance_fornecedores', 'Fornecedores'),
    ('finance_categorias', 'Categorias financeiras'),
    ('finance_centros_custo', 'Centros de custo'),
    ('finance_contas', 'Contas financeiras'),
    ('pagamentos_loja_clinica', 'Pagamentos da loja'),
    ('estoque_reservas_clinica', 'Reservas de estoque'),
    ('estoque_movimentos_clinica', 'Movimentos de estoque'),
    ('pedido_itens_clinica', 'Itens dos pedidos'),
    ('carrinhos_abandonados_clinica', 'Carrinhos abandonados'),
    ('pedidos_clinica', 'Pedidos da loja'),
    ('cupons_clinica', 'Cupons da loja'),
    ('produtos_clinica', 'Produtos da loja'),
    ('crm_opportunity_tags', 'Tags das oportunidades'),
    ('crm_opportunity_appointments', 'Agendamentos das oportunidades'),
    ('crm_activities', 'Atividades do CRM'),
    ('crm_opportunity_events', 'Timeline das oportunidades'),
    ('crm_saved_views', 'Visoes salvas do CRM'),
    ('site_agendamentos_publicos', 'Reservas originadas no site'),
    ('pagamentos_clinica', 'Pagamentos legados mantidos vazios na demo'),
    ('cliente_pacotes', 'Pacotes adquiridos por clientes'),
    ('cliente_fotos', 'Fotos do prontuario'),
    ('cliente_consentimentos', 'Consentimentos do cliente'),
    ('eventos_analiticos', 'Eventos do BI'),
    ('metas_clinica', 'Metas do BI'),
    ('agendamentos', 'Agenda operacional'),
    ('crm_oportunidades', 'Oportunidades canonicas do CRM 2.0'),
    ('crm_tags', 'Tags canonicas do CRM 2.0'),
    ('crm_lost_reasons', 'Motivos de perda do CRM 2.0'),
    ('crm_pipeline_stages', 'Etapas canonicas do CRM 2.0'),
    ('crm_pipelines', 'Pipelines canonicos do CRM 2.0'),
    ('pacotes_clinica', 'Pacotes comerciais'),
    ('procedimentos', 'Procedimentos'),
    ('profissionais', 'Profissionais'),
    ('clientes', 'Clientes')
), ordering as (
  select array[
    'finance_comissao_pagamento_itens',
    'finance_comissao_pagamentos',
    'finance_transferencias',
    'finance_conciliacoes',
    'finance_movimentos',
    'finance_liquidacao_parcelas',
    'finance_comissoes',
    'finance_competencias',
    'finance_liquidacoes',
    'finance_recebivel_parcelas',
    'finance_pagavel_parcelas',
    'finance_recebiveis',
    'finance_pagaveis',
    'finance_recorrencias',
    'finance_orcamentos',
    'finance_comissao_regras',
    'finance_configuracoes',
    'finance_fornecedores',
    'finance_categorias',
    'finance_centros_custo',
    'finance_contas',
    'pagamentos_loja_clinica',
    'estoque_reservas_clinica',
    'estoque_movimentos_clinica',
    'pedido_itens_clinica',
    'carrinhos_abandonados_clinica',
    'pedidos_clinica',
    'cupons_clinica',
    'produtos_clinica',
    'crm_opportunity_tags',
    'crm_opportunity_appointments',
    'crm_activities',
    'crm_opportunity_events',
    'crm_saved_views',
    'site_agendamentos_publicos',
    'pagamentos_clinica',
    'cliente_pacotes',
    'cliente_fotos',
    'cliente_consentimentos',
    'eventos_analiticos',
    'metas_clinica',
    'agendamentos',
    'crm_oportunidades',
    'crm_tags',
    'crm_lost_reasons',
    'crm_pipeline_stages',
    'crm_pipelines',
    'pacotes_clinica',
    'procedimentos',
    'profissionais',
    'clientes'
  ]::text[] as table_names
), numbered as (
  select registry.table_name, registry.description,
    array_position(ordering.table_names, registry.table_name)::integer as position,
    array_length(ordering.table_names, 1)::integer as total
  from registry cross join ordering
)
insert into app_private.demo_reset_registry (
  table_name, delete_order, insert_order, required, description
)
select table_name, position * 10, (total - position + 1) * 10, true, description
from numbered
on conflict (table_name) do update set
  delete_order = excluded.delete_order,
  insert_order = excluded.insert_order,
  required = excluded.required,
  description = excluded.description;

create or replace function app_private.assert_demo_service_role()
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Operacao restrita ao backend da demonstracao.' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.validate_demo_identity_v2(
  p_actor_user_id uuid,
  p_clinic_id uuid,
  p_login_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_login_email, '')));
begin
  perform app_private.assert_demo_service_role();

  if p_actor_user_id is null or p_clinic_id is null or v_email = '' then
    raise exception 'Identidade da demonstracao incompleta.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_actor_user_id
      and lower(coalesce(u.email, '')) = v_email
      and coalesce((u.raw_app_meta_data ->> 'demo_account')::boolean, false) = true
  ) then
    raise exception 'Usuario informado nao e uma conta demo valida.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clinicas c
    where c.id = p_clinic_id
      and lower(coalesce(c.slug, '')) like 'demo-%'
      and lower(coalesce(c.email, '')) = v_email
      and coalesce((c.metadata ->> 'demo')::boolean, false) = true
  ) then
    raise exception 'Clinica informada nao e um tenant demo valido.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.usuarios_clinica membership
    where membership.clinica_id = p_clinic_id
      and membership.user_id = p_actor_user_id
      and lower(coalesce(membership.email, '')) = v_email
      and membership.ativo = true
  ) then
    raise exception 'Vinculo ativo da conta demo nao foi confirmado.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.register_demo_environment_v2(
  p_actor_user_id uuid,
  p_clinic_id uuid,
  p_login_email text,
  p_segment_slug text default null,
  p_dataset_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_login_email, '')));
  v_slug text;
begin
  perform app_private.assert_demo_service_role();
  perform app_private.validate_demo_identity_v2(p_actor_user_id, p_clinic_id, v_email);

  if coalesce(p_dataset_version, 0) <= 0 then
    raise exception 'Versao do dataset demo invalida.' using errcode = '22023';
  end if;

  select lower(c.slug) into strict v_slug
  from public.clinicas c
  where c.id = p_clinic_id;

  insert into app_private.demo_environments (
    clinic_id, auth_user_id, login_email, clinic_slug, segment_slug,
    dataset_version, active, updated_at
  ) values (
    p_clinic_id, p_actor_user_id, v_email, v_slug,
    nullif(lower(trim(coalesce(p_segment_slug, ''))), ''),
    p_dataset_version, true, now()
  )
  on conflict (clinic_id) do update set
    auth_user_id = excluded.auth_user_id,
    login_email = excluded.login_email,
    clinic_slug = excluded.clinic_slug,
    segment_slug = excluded.segment_slug,
    dataset_version = excluded.dataset_version,
    active = true,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'clinicId', p_clinic_id,
    'datasetVersion', p_dataset_version
  );
end;
$$;

create or replace function public.reset_demo_environment_v2(
  p_actor_user_id uuid,
  p_dataset_version integer,
  p_dataset jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_environment app_private.demo_environments%rowtype;
  v_registry app_private.demo_reset_registry%rowtype;
  v_rows jsonb;
  v_tenant_rows jsonb;
  v_unknown_table text;
  v_column_list text;
  v_select_list text;
  v_expected_count bigint;
  v_actual_count bigint;
  v_counts jsonb := '{}'::jsonb;
begin
  perform app_private.assert_demo_service_role();

  select * into v_environment
  from app_private.demo_environments environment
  where environment.auth_user_id = p_actor_user_id
    and environment.active = true
  for update;

  if not found then
    raise exception 'Ambiente demo nao registrado para este usuario.' using errcode = '42501';
  end if;

  perform app_private.validate_demo_identity_v2(
    v_environment.auth_user_id,
    v_environment.clinic_id,
    v_environment.login_email
  );

  if coalesce(p_dataset_version, 0) <> v_environment.dataset_version then
    raise exception 'Versao do dataset demo divergente.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_dataset) <> 'object'
     or jsonb_typeof(p_dataset -> 'tables') <> 'object'
     or coalesce((p_dataset ->> 'version')::integer, 0) <> p_dataset_version
     or coalesce(p_dataset ->> 'clinicId', '') <> v_environment.clinic_id::text then
    raise exception 'Contrato do dataset demo invalido.' using errcode = '22023';
  end if;

  select dataset_table.key into v_unknown_table
  from jsonb_object_keys(p_dataset -> 'tables') dataset_table(key)
  left join app_private.demo_reset_registry registry
    on registry.table_name = dataset_table.key
  where registry.table_name is null
  limit 1;

  if v_unknown_table is not null then
    raise exception 'Tabela nao autorizada no dataset demo: %', v_unknown_table using errcode = '22023';
  end if;

  for v_registry in
    select * from app_private.demo_reset_registry order by delete_order
  loop
    if v_registry.required and not (p_dataset -> 'tables' ? v_registry.table_name) then
      raise exception 'Tabela obrigatoria ausente no dataset demo: %', v_registry.table_name using errcode = '22023';
    end if;

    if to_regclass(format('public.%I', v_registry.table_name)) is null then
      if v_registry.required then
        raise exception 'Tabela obrigatoria ausente no banco: %', v_registry.table_name using errcode = '42P01';
      end if;
      continue;
    end if;

    v_rows := coalesce(p_dataset -> 'tables' -> v_registry.table_name, '[]'::jsonb);
    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'Conteudo invalido para a tabela demo: %', v_registry.table_name using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_rows) row_data
      where jsonb_typeof(row_data) <> 'object'
         or coalesce(row_data ->> 'clinica_id', '') <> v_environment.clinic_id::text
    ) then
      raise exception 'Tentativa de inserir dados fora do tenant demo em %', v_registry.table_name using errcode = '42501';
    end if;
  end loop;

  perform pg_advisory_xact_lock(
    hashtextextended('nexawi-clinicas:demo-reset:' || v_environment.clinic_id::text, 0)
  );

  for v_registry in
    select * from app_private.demo_reset_registry order by delete_order
  loop
    if to_regclass(format('public.%I', v_registry.table_name)) is not null then
      execute format(
        'delete from public.%I where clinica_id = $1',
        v_registry.table_name
      ) using v_environment.clinic_id;
    end if;
  end loop;

  for v_registry in
    select * from app_private.demo_reset_registry order by insert_order
  loop
    v_rows := coalesce(p_dataset -> 'tables' -> v_registry.table_name, '[]'::jsonb);
    v_expected_count := jsonb_array_length(v_rows);

    if v_expected_count > 0 then
      select coalesce(jsonb_agg(
        jsonb_set(row_data, '{clinica_id}', to_jsonb(v_environment.clinic_id::text), true)
      ), '[]'::jsonb)
      into v_tenant_rows
      from jsonb_array_elements(v_rows) row_data;

      select
        string_agg(quote_ident(attribute.attname), ', ' order by attribute.attnum),
        string_agg('source_row.' || quote_ident(attribute.attname), ', ' order by attribute.attnum)
      into v_column_list, v_select_list
      from pg_attribute attribute
      where attribute.attrelid = to_regclass(format('public.%I', v_registry.table_name))
        and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attgenerated = ''
        and attribute.attidentity = ''
        and exists (
          select 1
          from jsonb_array_elements(v_tenant_rows) row_data
          where row_data ? attribute.attname
        );

      if coalesce(v_column_list, '') = '' then
        raise exception 'Nenhuma coluna valida encontrada para %', v_registry.table_name using errcode = '22023';
      end if;

      execute format(
        'insert into public.%1$I (%2$s) select %3$s from jsonb_populate_recordset(null::public.%1$I, $1) source_row',
        v_registry.table_name,
        v_column_list,
        v_select_list
      ) using v_tenant_rows;
    end if;

    execute format(
      'select count(*) from public.%I where clinica_id = $1',
      v_registry.table_name
    ) into v_actual_count using v_environment.clinic_id;

    if v_actual_count <> v_expected_count then
      raise exception 'Validacao pos-reset falhou em %: esperado %, encontrado %',
        v_registry.table_name, v_expected_count, v_actual_count using errcode = '23514';
    end if;

    v_counts := v_counts || jsonb_build_object(v_registry.table_name, v_actual_count);
  end loop;

  update public.clinicas clinic set
    metadata = coalesce(clinic.metadata, '{}'::jsonb) || jsonb_build_object(
      'demo', true,
      'demo_dataset_version', p_dataset_version,
      'demo_last_reset_at', now()
    ),
    updated_at = now()
  where clinic.id = v_environment.clinic_id;

  update app_private.demo_environments set
    last_reset_at = now(),
    updated_at = now()
  where clinic_id = v_environment.clinic_id;

  return jsonb_build_object(
    'ok', true,
    'clinicId', v_environment.clinic_id,
    'datasetVersion', p_dataset_version,
    'counts', v_counts,
    'resetAt', now()
  );
end;
$$;

revoke all on function app_private.assert_demo_service_role() from public, anon, authenticated;
revoke all on function app_private.validate_demo_identity_v2(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.register_demo_environment_v2(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.reset_demo_environment_v2(uuid, integer, jsonb) from public, anon, authenticated;

grant execute on function public.register_demo_environment_v2(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.reset_demo_environment_v2(uuid, integer, jsonb) to service_role;

comment on table app_private.demo_environments is
  'Registro privado dos tenants autorizados a usar o reset deterministico da demonstracao.';
comment on table app_private.demo_reset_registry is
  'Ordem explicita de limpeza e restauracao das entidades mutaveis da demonstracao.';
comment on function public.reset_demo_environment_v2(uuid, integer, jsonb) is
  'Restaura atomicamente apenas o tenant demo validado pelo backend e pela identidade persistida.';

commit;
