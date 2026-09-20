-- Optional, consent-gated imports; no existing clinical records are modified.
create table public.whatsapp_coexistence_imports (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null,
  authorized_by uuid references auth.users(id) on delete set null,
  authorized_at timestamptz not null default now(),
  consent_version text not null,
  contacts_authorized boolean not null check (contacts_authorized),
  history_authorized boolean not null check (history_authorized),
  requests jsonb not null default '{}'::jsonb,
  unique (connection_id, phone_number_id)
);
create index whatsapp_coexistence_imports_clinic_idx on public.whatsapp_coexistence_imports(clinica_id);

create table public.whatsapp_imported_contacts (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  import_id uuid not null references public.whatsapp_coexistence_imports(id) on delete cascade,
  phone_normalized text not null,
  full_name text,
  removed boolean not null default false,
  source_timestamp bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, phone_normalized)
);
create index whatsapp_imported_contacts_clinic_idx on public.whatsapp_imported_contacts(clinica_id);
alter table public.whatsapp_coexistence_imports enable row level security;
alter table public.whatsapp_imported_contacts enable row level security;
create policy whatsapp_coexistence_imports_select on public.whatsapp_coexistence_imports
  for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));
create policy whatsapp_imported_contacts_select on public.whatsapp_imported_contacts
  for select to authenticated using (app_private.usuario_admin_clinica(clinica_id));
revoke all on public.whatsapp_coexistence_imports, public.whatsapp_imported_contacts from anon, authenticated;
grant select on public.whatsapp_coexistence_imports, public.whatsapp_imported_contacts to authenticated;
grant all on public.whatsapp_coexistence_imports, public.whatsapp_imported_contacts to service_role;
