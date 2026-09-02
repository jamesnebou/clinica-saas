begin;

create or replace function public.crm_ensure_default_pipeline(p_clinica_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_pipeline uuid;
begin
  perform app_private.crm_require_access(p_clinica_id);

  select id
    into v_pipeline
  from public.crm_pipelines
  where clinica_id = p_clinica_id
    and padrao
    and ativo
  order by created_at
  limit 1;

  if v_pipeline is null then
    insert into public.crm_pipelines(clinica_id, nome, padrao, ordem, created_by)
    values (p_clinica_id, 'Pipeline comercial', true, 0, auth.uid())
    returning id into v_pipeline;
  end if;

  insert into public.crm_pipeline_stages(
    clinica_id, pipeline_id, nome, slug, ordem, cor, probabilidade, tipo, semantic_key
  )
  values
    (p_clinica_id, v_pipeline, 'Novo lead', 'novo-lead', 10, '#38bdf8', 10, 'open', 'new'),
    (p_clinica_id, v_pipeline, 'Contato iniciado', 'contato-iniciado', 20, '#818cf8', 20, 'open', 'contacted'),
    (p_clinica_id, v_pipeline, 'Qualificado', 'qualificado', 30, '#a78bfa', 40, 'open', 'qualified'),
    (p_clinica_id, v_pipeline, 'Avaliação agendada', 'avaliacao-agendada', 40, '#f59e0b', 60, 'open', 'evaluation_scheduled'),
    (p_clinica_id, v_pipeline, 'Em negociação', 'em-negociacao', 50, '#fb7185', 75, 'open', 'negotiation'),
    (p_clinica_id, v_pipeline, 'Ganho', 'ganho', 60, '#10b981', 100, 'won', 'won'),
    (p_clinica_id, v_pipeline, 'Perdido', 'perdido', 70, '#ef4444', 0, 'lost', 'lost')
  on conflict do nothing;

  insert into public.crm_lost_reasons(clinica_id, nome, ordem)
  values
    (p_clinica_id, 'Preço', 10),
    (p_clinica_id, 'Sem retorno', 20),
    (p_clinica_id, 'Escolheu concorrente', 30),
    (p_clinica_id, 'Sem interesse agora', 40),
    (p_clinica_id, 'Contraindicação', 50),
    (p_clinica_id, 'Outro', 60)
  on conflict (clinica_id, nome) do nothing;

  return v_pipeline;
end;
$$;

revoke all on function public.crm_ensure_default_pipeline(uuid) from public, anon;
grant execute on function public.crm_ensure_default_pipeline(uuid) to authenticated, service_role;

commit;
