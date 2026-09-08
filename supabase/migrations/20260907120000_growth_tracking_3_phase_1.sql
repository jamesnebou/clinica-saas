begin;

alter table if exists public.clinica_marketing_leads
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists consent jsonb not null default '{}'::jsonb;

alter table if exists public.clinica_marketing_eventos
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists consent jsonb not null default '{}'::jsonb;

alter table if exists public.saas_marketing_attribution
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists consent jsonb not null default '{}'::jsonb;

create index if not exists clinica_marketing_leads_google_click_idx
  on public.clinica_marketing_leads(gclid, created_at desc)
  where gclid is not null;

create index if not exists saas_marketing_attribution_google_click_idx
  on public.saas_marketing_attribution(gclid, created_at desc)
  where gclid is not null;

create table if not exists public.google_offline_conversion_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('CompleteRegistration','Subscribe','Purchase','MQL')),
  event_id text not null,
  clinica_id uuid references public.clinicas(id) on delete set null,
  marketing_lead_id uuid references public.clinica_marketing_leads(id) on delete set null,
  source_type text not null default 'system',
  source_id text,
  payload jsonb not null,
  status text not null default 'ready' check (status in ('ready','exported','ignored','failed')),
  exported_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_name, event_id)
);

create index if not exists google_offline_conversion_events_status_idx
  on public.google_offline_conversion_events(status, created_at)
  where status in ('ready','failed');
create index if not exists google_offline_conversion_events_clinic_idx
  on public.google_offline_conversion_events(clinica_id, created_at desc)
  where clinica_id is not null;

alter table public.google_offline_conversion_events enable row level security;
revoke all on public.google_offline_conversion_events from public, anon, authenticated;
grant all on public.google_offline_conversion_events to service_role;

drop trigger if exists set_updated_at_google_offline_conversion_events on public.google_offline_conversion_events;
create trigger set_updated_at_google_offline_conversion_events
before update on public.google_offline_conversion_events
for each row execute function app_private.set_updated_at();

notify pgrst, 'reload schema';

commit;
