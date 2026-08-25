begin;

-- Official, multi-tenant WhatsApp Cloud API foundation.
-- This migration is additive. Historical migrations must remain immutable.

create or replace function app_private.normalize_whatsapp_phone(value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(value, '[^0-9]', '', 'g') as digits
  ), international as (
    select case when digits like '00%' then substr(digits, 3) else digits end as digits
    from cleaned
  )
  select case when length(digits) in (10, 11) then '55' || digits else digits end
  from international;
$$;

alter table public.clientes
  add column if not exists telefone_whatsapp text
  generated always as (app_private.normalize_whatsapp_phone(telefone)) stored;

create index if not exists clientes_clinica_telefone_whatsapp_idx
  on public.clientes(clinica_id, telefone_whatsapp)
  where telefone_whatsapp is not null and telefone_whatsapp <> '';

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid,
  provider text not null default 'meta_cloud' check (provider in ('meta_cloud')),
  is_primary boolean not null default true,
  meta_business_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  connection_status text not null default 'disconnected' check (connection_status in ('disconnected','connecting','connected','degraded','blocked','error')),
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started','authorizing','authorized','waba_found','phone_found','phone_registered','webhook_subscribed','templates_syncing','ready','error')),
  billing_mode text not null default 'client_direct' check (billing_mode in ('client_direct','nexawi_credit_line')),
  connection_mode text not null default 'cloud_only' check (connection_mode in ('cloud_only','coexistence')),
  quality_rating text,
  messaging_limit text,
  last_health_check_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, phone_number_id)
);

create unique index if not exists whatsapp_connections_phone_number_uidx on public.whatsapp_connections(phone_number_id) where phone_number_id is not null;
create unique index if not exists whatsapp_connections_primary_uidx on public.whatsapp_connections(clinica_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_primary;
create index if not exists whatsapp_connections_waba_idx on public.whatsapp_connections(waba_id);

create table if not exists public.whatsapp_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','completed','expired','failed')),
  expires_at timestamptz not null,
  used_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_onboarding_clinic_idx on public.whatsapp_onboarding_sessions(clinica_id, created_at desc);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  waba_id text not null,
  meta_template_id text,
  name text not null,
  language text not null default 'pt_BR',
  category text,
  status text not null default 'PENDING' check (status in ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED','IN_APPEAL','PENDING_DELETION','DELETED','LIMIT_EXCEEDED')),
  components jsonb not null default '[]'::jsonb,
  purpose text not null check (purpose in ('booking_created','booking_payment_pending','payment_expiring','payment_confirmed','payment_expired','appointment_reminder_24h','appointment_reminder_3h','booking_cancelled','booking_rescheduled')),
  rejection_reason text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, name, language),
  unique (connection_id, purpose, language)
);
create index if not exists whatsapp_templates_clinic_status_idx on public.whatsapp_templates(clinica_id, status);

create table if not exists public.whatsapp_automation_settings (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  enabled boolean not null default false,
  privacy_mode text not null default 'discreto' check (privacy_mode in ('discreto','detalhado')),
  booking_created_enabled boolean not null default true,
  payment_pending_enabled boolean not null default true,
  payment_confirmed_enabled boolean not null default true,
  payment_expiring_enabled boolean not null default true,
  payment_expired_enabled boolean not null default true,
  reminder_24h_enabled boolean not null default true,
  reminder_3h_enabled boolean not null default true,
  booking_cancelled_enabled boolean not null default true,
  booking_rescheduled_enabled boolean not null default true,
  payment_expiring_minutes integer not null default 60 check (payment_expiring_minutes between 5 and 10080),
  payment_expiration_minutes integer not null default 1440 check (payment_expiration_minutes between 15 and 43200),
  reminder_24h_minutes integer not null default 1440 check (reminder_24h_minutes between 60 and 10080),
  reminder_3h_minutes integer not null default 180 check (reminder_3h_minutes between 15 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id)
);

create table if not exists public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  phone_normalized text not null,
  whatsapp_transactional_opt_in boolean not null default false,
  whatsapp_marketing_opt_in boolean not null default false,
  opt_in_source text,
  opt_in_at timestamptz,
  opt_out_at timestamptz,
  text_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, phone_normalized)
);
create index if not exists communication_preferences_client_idx on public.communication_preferences(clinica_id, cliente_id);

create table if not exists public.domain_outbox_events (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  event_name text not null check (event_name in ('booking.created','booking.confirmed','booking.cancelled','booking.rescheduled','payment.pending','payment.confirmed','payment.expiring','payment.expired','appointment.reminder_24h','appointment.reminder_3h')),
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','processed','retry','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists domain_outbox_claim_idx on public.domain_outbox_events(status, available_at, occurred_at);
create index if not exists domain_outbox_clinic_idx on public.domain_outbox_events(clinica_id, occurred_at desc);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  event_id uuid not null references public.domain_outbox_events(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  recipient text not null,
  template_purpose text not null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','retry','sent','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, channel, recipient, template_purpose, scheduled_at)
);
create index if not exists notification_jobs_claim_idx on public.notification_jobs(status, scheduled_at) where status in ('pending','retry');
create index if not exists notification_jobs_clinic_idx on public.notification_jobs(clinica_id, created_at desc);
create index if not exists notification_jobs_event_idx on public.notification_jobs(event_id);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  crm_oportunidade_id uuid references public.crm_oportunidades(id) on delete set null,
  direction text not null check (direction in ('outbound','inbound')),
  message_type text not null,
  template_name text,
  template_category text,
  recipient_phone text,
  sender_phone text,
  meta_message_id text,
  status text not null check (status in ('queued','submitted','sent','delivered','read','failed','received')),
  trigger text,
  domain_event_id uuid references public.domain_outbox_events(id) on delete set null,
  job_id uuid references public.notification_jobs(id) on delete set null,
  content jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  pricing_category text,
  pricing_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  received_at timestamptz
);
create unique index if not exists whatsapp_messages_meta_id_uidx on public.whatsapp_messages(meta_message_id) where meta_message_id is not null;
create unique index if not exists whatsapp_messages_job_uidx on public.whatsapp_messages(job_id);
create index if not exists whatsapp_messages_clinic_created_idx on public.whatsapp_messages(clinica_id, created_at desc);
create index if not exists whatsapp_messages_booking_idx on public.whatsapp_messages(clinica_id, agendamento_id);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  clinica_id uuid references public.clinicas(id) on delete cascade,
  deduplication_key text not null unique,
  object_type text,
  event_type text,
  phone_number_id text,
  waba_id text,
  meta_message_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists whatsapp_webhook_events_connection_idx on public.whatsapp_webhook_events(connection_id, received_at desc);
create index if not exists whatsapp_webhook_events_status_idx on public.whatsapp_webhook_events(status, received_at);

create table if not exists public.whatsapp_interaction_tokens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  action text not null check (action in ('confirm','reschedule','cancel','payment')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_interaction_booking_idx on public.whatsapp_interaction_tokens(clinica_id, agendamento_id);

insert into public.whatsapp_automation_settings (clinica_id)
select id from public.clinicas on conflict (clinica_id) do nothing;

create or replace function app_private.create_whatsapp_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.whatsapp_automation_settings (clinica_id) values (new.id)
  on conflict (clinica_id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_whatsapp_defaults_on_clinic on public.clinicas;
create trigger create_whatsapp_defaults_on_clinic after insert on public.clinicas
for each row execute function app_private.create_whatsapp_defaults();

do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_connections','whatsapp_onboarding_sessions','whatsapp_templates','whatsapp_automation_settings','communication_preferences','notification_jobs']
  loop
    execute format('drop trigger if exists set_updated_at_%I on public.%I', table_name, table_name);
    execute format('create trigger set_updated_at_%I before update on public.%I for each row execute function app_private.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.claim_domain_outbox_events(p_worker text, p_limit integer default 25)
returns setof public.domain_outbox_events language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select id from public.domain_outbox_events
    where status in ('pending','retry') and available_at <= now()
      and (locked_at is null or locked_at < now() - interval '10 minutes')
    order by occurred_at asc for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  )
  update public.domain_outbox_events e
  set status='processing', locked_at=now(), locked_by=left(p_worker,120), attempts=e.attempts+1
  from candidates c where e.id=c.id returning e.*;
end;
$$;

create or replace function public.claim_notification_jobs(p_worker text, p_limit integer default 25)
returns setof public.notification_jobs language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select id from public.notification_jobs
    where status in ('pending','retry') and scheduled_at <= now()
      and attempt_count < max_attempts
      and (locked_at is null or locked_at < now() - interval '10 minutes')
    order by scheduled_at asc for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  )
  update public.notification_jobs j
  set status='processing', locked_at=now(), locked_by=left(p_worker,120), attempt_count=j.attempt_count+1, updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end;
$$;

revoke all on function public.claim_domain_outbox_events(text,integer) from public, anon, authenticated;
revoke all on function public.claim_notification_jobs(text,integer) from public, anon, authenticated;
grant execute on function public.claim_domain_outbox_events(text,integer) to service_role;
grant execute on function public.claim_notification_jobs(text,integer) to service_role;
revoke all on function app_private.normalize_whatsapp_phone(text) from public, anon;
grant execute on function app_private.normalize_whatsapp_phone(text) to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_connections','whatsapp_onboarding_sessions','whatsapp_templates','whatsapp_automation_settings','communication_preferences','domain_outbox_events','notification_jobs','whatsapp_messages','whatsapp_webhook_events','whatsapp_interaction_tokens']
  loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

drop policy if exists whatsapp_connections_select_members on public.whatsapp_connections;
drop policy if exists whatsapp_connections_manage_admin on public.whatsapp_connections;
drop policy if exists whatsapp_onboarding_admin on public.whatsapp_onboarding_sessions;
drop policy if exists whatsapp_templates_select_members on public.whatsapp_templates;
drop policy if exists whatsapp_templates_manage_admin on public.whatsapp_templates;
drop policy if exists whatsapp_automations_select_members on public.whatsapp_automation_settings;
drop policy if exists whatsapp_automations_manage_admin on public.whatsapp_automation_settings;
drop policy if exists communication_preferences_select_members on public.communication_preferences;
drop policy if exists communication_preferences_manage_members on public.communication_preferences;
drop policy if exists domain_outbox_select_admin on public.domain_outbox_events;
drop policy if exists notification_jobs_select_admin on public.notification_jobs;
drop policy if exists whatsapp_messages_select_members on public.whatsapp_messages;
drop policy if exists whatsapp_webhook_events_select_admin on public.whatsapp_webhook_events;
drop policy if exists whatsapp_interactions_select_admin on public.whatsapp_interaction_tokens;

create policy whatsapp_connections_select_members on public.whatsapp_connections for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy whatsapp_connections_manage_admin on public.whatsapp_connections for all to authenticated using (app_private.usuario_admin_clinica(clinica_id)) with check (app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_onboarding_admin on public.whatsapp_onboarding_sessions for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_templates_select_members on public.whatsapp_templates for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy whatsapp_templates_manage_admin on public.whatsapp_templates for all to authenticated using (app_private.usuario_admin_clinica(clinica_id)) with check (app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_automations_select_members on public.whatsapp_automation_settings for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy whatsapp_automations_manage_admin on public.whatsapp_automation_settings for all to authenticated using (app_private.usuario_admin_clinica(clinica_id)) with check (app_private.usuario_admin_clinica(clinica_id));
create policy communication_preferences_select_members on public.communication_preferences for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy communication_preferences_manage_members on public.communication_preferences for all to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id)) with check (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy domain_outbox_select_admin on public.domain_outbox_events for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));
create policy notification_jobs_select_admin on public.notification_jobs for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_messages_select_members on public.whatsapp_messages for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id));
create policy whatsapp_webhook_events_select_admin on public.whatsapp_webhook_events for select to authenticated using (clinica_id is not null and app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_interactions_select_admin on public.whatsapp_interaction_tokens for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));

grant select, insert, update, delete on public.whatsapp_connections, public.whatsapp_templates, public.whatsapp_automation_settings, public.communication_preferences to authenticated;
grant select on public.whatsapp_onboarding_sessions, public.domain_outbox_events, public.notification_jobs, public.whatsapp_messages, public.whatsapp_webhook_events, public.whatsapp_interaction_tokens to authenticated;

update public.segmentos
set metadata = jsonb_set(metadata, '{capabilities}', coalesce(metadata->'capabilities','[]'::jsonb) || '["whatsapp"]'::jsonb, true), updated_at=now()
where not (coalesce(metadata->'capabilities','[]'::jsonb) ? 'whatsapp');

update public.planos_sistema
set metadata = jsonb_set(metadata, '{capabilities}', coalesce(metadata->'capabilities','[]'::jsonb) || '["whatsapp"]'::jsonb, true), updated_at=now()
where jsonb_typeof(metadata->'capabilities') = 'array'
  and jsonb_array_length(metadata->'capabilities') > 0
  and not (metadata->'capabilities' ? 'whatsapp');

comment on table public.domain_outbox_events is 'Durable transactional outbox. Analytics events are never used as a delivery queue.';
comment on table public.whatsapp_webhook_events is 'Minimal, deduplicated WhatsApp webhook envelope. Full sensitive payloads must not be persisted.';

commit;
