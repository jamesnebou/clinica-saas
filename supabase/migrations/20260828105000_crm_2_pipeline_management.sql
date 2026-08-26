begin;

create or replace function public.crm_create_pipeline(
  p_clinica_id uuid,
  p_nome text,
  p_make_default boolean default false
) returns public.crm_pipelines
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_pipeline public.crm_pipelines;
  v_default boolean;
  v_order integer;
begin
  perform app_private.crm_require_access(p_clinica_id);
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Informe o nome do pipeline.' using errcode = '22023';
  end if;

  select coalesce(max(ordem), 0) + 10 into v_order
  from public.crm_pipelines where clinica_id = p_clinica_id;
  v_default := p_make_default or not exists (
    select 1 from public.crm_pipelines where clinica_id = p_clinica_id and ativo and padrao
  );
  if v_default then
    update public.crm_pipelines set padrao = false, updated_at = now()
    where clinica_id = p_clinica_id and padrao;
  end if;

  insert into public.crm_pipelines (clinica_id, nome, ativo, padrao, ordem, created_by)
  values (p_clinica_id, btrim(p_nome), true, v_default, v_order, auth.uid())
  returning * into v_pipeline;

  insert into public.crm_pipeline_stages
    (clinica_id, pipeline_id, nome, slug, ordem, cor, probabilidade, tipo, semantic_key)
  values
    (p_clinica_id, v_pipeline.id, 'Novo lead', 'novo-lead', 10, '#2563eb', 10, 'open', 'new'),
    (p_clinica_id, v_pipeline.id, 'Contato realizado', 'contato-realizado', 20, '#7c3aed', 25, 'open', 'contacted'),
    (p_clinica_id, v_pipeline.id, 'Qualificado', 'qualificado', 30, '#0891b2', 40, 'open', 'qualified'),
    (p_clinica_id, v_pipeline.id, 'Avaliação marcada', 'avaliacao-marcada', 40, '#d97706', 60, 'open', 'evaluation_scheduled'),
    (p_clinica_id, v_pipeline.id, 'Em negociação', 'em-negociacao', 50, '#db2777', 80, 'open', 'negotiation'),
    (p_clinica_id, v_pipeline.id, 'Ganho', 'ganho', 60, '#059669', 100, 'won', 'won'),
    (p_clinica_id, v_pipeline.id, 'Perdido', 'perdido', 70, '#dc2626', 0, 'lost', 'lost');

  return v_pipeline;
end;
$$;

create or replace function public.crm_set_default_pipeline(
  p_clinica_id uuid,
  p_pipeline_id uuid
) returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.crm_require_access(p_clinica_id);
  if not exists (
    select 1 from public.crm_pipelines
    where clinica_id = p_clinica_id and id = p_pipeline_id and ativo
  ) then
    raise exception 'Pipeline inválido.' using errcode = '23503';
  end if;
  update public.crm_pipelines set padrao = false, updated_at = now()
  where clinica_id = p_clinica_id and ativo and padrao;
  update public.crm_pipelines set padrao = true, updated_at = now()
  where clinica_id = p_clinica_id and id = p_pipeline_id and ativo;
end;
$$;

revoke all on function public.crm_create_pipeline(uuid,text,boolean) from public;
revoke all on function public.crm_set_default_pipeline(uuid,uuid) from public;
grant execute on function public.crm_create_pipeline(uuid,text,boolean) to authenticated, service_role;
grant execute on function public.crm_set_default_pipeline(uuid,uuid) to authenticated, service_role;

commit;
