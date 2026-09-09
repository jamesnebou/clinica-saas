begin;

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
  v_rows jsonb;
  v_column_list text;
  v_select_list text;
  v_expected_count bigint;
  v_actual_count bigint;
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
  if p_clinica_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('clinica-demo:' || p_clinica_id::text, 0));

  select snapshot
  into v_snapshot
  from public.clinica_demo_snapshots
  where clinica_id = p_clinica_id
  for update;

  if v_snapshot is null then
    return false;
  end if;

  select *
  into v_clinic
  from jsonb_populate_record(null::public.clinicas, v_snapshot -> 'clinicas');

  if v_clinic.id is distinct from p_clinica_id then
    raise exception 'Snapshot pertence a outra clinica.' using errcode = '42501';
  end if;

  foreach v_table in array v_insert_order loop
    v_rows := coalesce(v_snapshot -> v_table, '[]'::jsonb);

    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'Snapshot invalido para %.', v_table using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_rows) row_data
      where jsonb_typeof(row_data) <> 'object'
         or coalesce(row_data ->> 'clinica_id', '') <> p_clinica_id::text
    ) then
      raise exception 'Snapshot contem dados de outro tenant em %.', v_table using errcode = '42501';
    end if;
  end loop;

  foreach v_table in array v_delete_order loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I where clinica_id = $1', v_table)
      using p_clinica_id;
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
    if to_regclass(format('public.%I', v_table)) is not null and v_snapshot ? v_table then
      v_rows := coalesce(v_snapshot -> v_table, '[]'::jsonb);
      v_expected_count := jsonb_array_length(v_rows);

      if v_expected_count > 0 then
        select
          string_agg(quote_ident(attribute.attname), ', ' order by attribute.attnum),
          string_agg('source_row.' || quote_ident(attribute.attname), ', ' order by attribute.attnum)
        into v_column_list, v_select_list
        from pg_attribute attribute
        where attribute.attrelid = to_regclass(format('public.%I', v_table))
          and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attgenerated = ''
          and attribute.attidentity <> 'a'
          and exists (
            select 1
            from jsonb_array_elements(v_rows) row_data
            where row_data ? attribute.attname
          );

        if coalesce(v_column_list, '') = '' then
          raise exception 'Nenhuma coluna restauravel encontrada para %.', v_table using errcode = '22023';
        end if;

        execute format(
          'insert into public.%1$I (%2$s) select %3$s from jsonb_populate_recordset(null::public.%1$I, $1) source_row',
          v_table,
          v_column_list,
          v_select_list
        ) using v_rows;
      end if;

      execute format('select count(*) from public.%I where clinica_id = $1', v_table)
      into v_actual_count
      using p_clinica_id;

      if v_actual_count <> v_expected_count then
        raise exception 'Restore incompleto em %: esperado %, encontrado %.',
          v_table, v_expected_count, v_actual_count using errcode = '23514';
      end if;
    end if;
  end loop;

  update public.clinica_demo_snapshots
  set restaurado_em = now(), updated_at = now()
  where clinica_id = p_clinica_id;

  return true;
end;
$$;

revoke all on function public.restore_clinica_demo_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.restore_clinica_demo_snapshot(uuid) to service_role;

comment on function public.restore_clinica_demo_snapshot(uuid) is
  'Restaura o snapshot da Demo com colunas explicitas, excluindo generated e identity always.';

commit;
