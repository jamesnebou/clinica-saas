begin;

alter table public.clinica_marketing_leads
  add column if not exists fbclid text,
  add column if not exists fbc text,
  add column if not exists fbp text,
  add column if not exists first_touch jsonb not null default '{}'::jsonb,
  add column if not exists last_touch jsonb not null default '{}'::jsonb,
  add column if not exists segmento_interesse text,
  add column if not exists meta_lead_event_id text,
  add column if not exists registered_clinica_id uuid references public.clinicas(id) on delete set null,
  add column if not exists registered_at timestamptz;

create index if not exists clinica_marketing_leads_registered_clinic_idx
  on public.clinica_marketing_leads(registered_clinica_id)
  where registered_clinica_id is not null;
create index if not exists clinica_marketing_leads_meta_event_idx
  on public.clinica_marketing_leads(meta_lead_event_id)
  where meta_lead_event_id is not null;

create table if not exists public.saas_marketing_attribution (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade,
  marketing_lead_id uuid references public.clinica_marketing_leads(id) on delete set null,
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  fbc text,
  fbp text,
  segmento_interesse text,
  landing_page text,
  referrer text,
  registration_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_marketing_attribution_campaign_idx
  on public.saas_marketing_attribution(utm_campaign, created_at desc);
create index if not exists saas_marketing_attribution_lead_idx
  on public.saas_marketing_attribution(marketing_lead_id)
  where marketing_lead_id is not null;

create table if not exists public.meta_conversion_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('ViewContent','Lead','Schedule','CompleteRegistration','Subscribe','Purchase')),
  event_id text not null,
  clinica_id uuid references public.clinicas(id) on delete set null,
  marketing_lead_id uuid references public.clinica_marketing_leads(id) on delete set null,
  source_type text not null default 'system',
  source_id text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','retry','sent','dead')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  meta_trace_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_name, event_id)
);

create index if not exists meta_conversion_events_pending_idx
  on public.meta_conversion_events(status, next_attempt_at, created_at)
  where status in ('pending','retry','processing');
create index if not exists meta_conversion_events_clinic_idx
  on public.meta_conversion_events(clinica_id, created_at desc)
  where clinica_id is not null;
create index if not exists meta_conversion_events_lead_idx
  on public.meta_conversion_events(marketing_lead_id, created_at desc)
  where marketing_lead_id is not null;

alter table public.saas_marketing_attribution enable row level security;
alter table public.meta_conversion_events enable row level security;
revoke all on public.saas_marketing_attribution from anon, authenticated;
revoke all on public.meta_conversion_events from anon, authenticated;
grant all on public.saas_marketing_attribution to service_role;
grant all on public.meta_conversion_events to service_role;

drop trigger if exists set_updated_at_saas_marketing_attribution on public.saas_marketing_attribution;
create trigger set_updated_at_saas_marketing_attribution
before update on public.saas_marketing_attribution
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_meta_conversion_events on public.meta_conversion_events;
create trigger set_updated_at_meta_conversion_events
before update on public.meta_conversion_events
for each row execute function app_private.set_updated_at();

create or replace function public.claim_meta_conversion_events(p_limit integer default 25)
returns setof public.meta_conversion_events
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select item.id
    from public.meta_conversion_events item
    where (
      item.status in ('pending','retry')
      and item.next_attempt_at <= now()
    ) or (
      item.status = 'processing'
      and item.processing_started_at < now() - interval '10 minutes'
    )
    order by item.next_attempt_at asc, item.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.meta_conversion_events item
  set status = 'processing',
      attempts = item.attempts + 1,
      processing_started_at = now(),
      updated_at = now()
  from candidates
  where item.id = candidates.id
  returning item.*;
end;
$$;

revoke all on function public.claim_meta_conversion_events(integer) from public, anon, authenticated;
grant execute on function public.claim_meta_conversion_events(integer) to service_role;

notify pgrst, 'reload schema';

commit;
