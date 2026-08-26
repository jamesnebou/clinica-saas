begin;

do $$ declare v_clinic record; v_pipeline uuid; begin
  for v_clinic in select id from public.clinicas loop
    v_pipeline:=public.crm_ensure_default_pipeline(v_clinic.id);
    with ranked as (
      select id,row_number() over(partition by clinica_id,status order by created_at,id) as position
      from public.crm_oportunidades where clinica_id=v_clinic.id
    )
    update public.crm_oportunidades o set
      pipeline_id=coalesce(o.pipeline_id,v_pipeline),
      stage_id=coalesce(o.stage_id,(select s.id from public.crm_pipeline_stages s where s.pipeline_id=v_pipeline and s.semantic_key=case o.status when 'avaliacao_marcada' then 'evaluation_scheduled' when 'em_negociacao' then 'negotiation' when 'convertido' then 'won' when 'perdido' then 'lost' else 'new' end limit 1)),
      titulo=coalesce(nullif(o.titulo,''),case when o.observacoes is not null then left(o.observacoes,100) else 'Interesse em atendimento' end),
      sort_order=case when o.sort_order=1000 then 1000+ranked.position*1000 else o.sort_order end,
      won_at=case when o.status='convertido' then coalesce(o.won_at,o.convertido_em,o.updated_at) else o.won_at end,
      lost_at=case when o.status='perdido' then coalesce(o.lost_at,o.updated_at) else o.lost_at end,
      valor_fechado=case when o.status='convertido' then coalesce(o.valor_fechado,o.valor_estimado) else o.valor_fechado end
    from ranked
    where o.id=ranked.id and o.clinica_id=v_clinic.id and (o.pipeline_id is null or o.stage_id is null or o.titulo is null);
  end loop;
end $$;

insert into public.crm_opportunity_events(clinica_id,opportunity_id,event_type,data,occurred_at)
select o.clinica_id,o.id,'legacy_backfilled',jsonb_build_object('legacy_status',o.status,'pipeline_id',o.pipeline_id,'stage_id',o.stage_id),o.updated_at
from public.crm_oportunidades o
where not exists(select 1 from public.crm_opportunity_events e where e.clinica_id=o.clinica_id and e.opportunity_id=o.id and e.event_type='legacy_backfilled');

alter table public.crm_oportunidades alter column pipeline_id set not null;
alter table public.crm_oportunidades alter column stage_id set not null;
alter table public.crm_oportunidades alter column titulo set not null;

commit;
