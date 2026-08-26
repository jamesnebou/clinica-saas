begin;

-- Corrige a inferencia da constraint parcial de eventos_analiticos. A chave de
-- idempotencia e unica por clinica, nao globalmente.
create or replace function app_private.crm_emit_event(
  p_clinica_id uuid,
  p_opportunity_id uuid,
  p_event_type text,
  p_data jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_id uuid;
  v_key text;
begin
  insert into public.crm_opportunity_events(
    clinica_id,
    opportunity_id,
    event_type,
    actor_id,
    data
  ) values (
    p_clinica_id,
    p_opportunity_id,
    p_event_type,
    auth.uid(),
    coalesce(p_data,'{}'::jsonb)
  )
  returning id into v_id;

  v_key:=coalesce(
    nullif(p_idempotency_key,''),
    'crm:'||p_event_type||':'||p_opportunity_id||':'||v_id
  );

  insert into public.domain_outbox_events(
    clinica_id,
    event_name,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key,
    consumer,
    occurred_at
  ) values (
    p_clinica_id,
    'crm.'||replace(p_event_type,'_','.'),
    'crm_opportunity',
    p_opportunity_id,
    coalesce(p_data,'{}'::jsonb),
    v_key,
    'automation',
    now()
  )
  on conflict (idempotency_key) do nothing;

  insert into public.eventos_analiticos(
    clinica_id,
    actor_id,
    event_name,
    idempotency_key,
    metadata
  ) values (
    p_clinica_id,
    auth.uid(),
    'crm_'||replace(p_event_type,'.','_'),
    v_key,
    coalesce(p_data,'{}'::jsonb)
  )
  on conflict (clinica_id,idempotency_key)
  where idempotency_key is not null
  do nothing;

  return v_id;
end
$$;

commit;
