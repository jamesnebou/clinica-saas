create table if not exists public.clinica_integracoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  asaas_ativo boolean not null default false,
  asaas_api_key text,
  asaas_base_url text not null default 'https://sandbox.asaas.com/api/v3',
  asaas_webhook_token text,
  email_ativo boolean not null default false,
  email_destino text,
  email_remetente text,
  whatsapp_ativo boolean not null default false,
  whatsapp_provider text not null default 'zapi',
  whatsapp_numero_destino text,
  whatsapp_webhook_url text,
  whatsapp_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id)
);

create index if not exists idx_clinica_integracoes_clinica on public.clinica_integracoes(clinica_id);

drop trigger if exists set_updated_at_clinica_integracoes on public.clinica_integracoes;
create trigger set_updated_at_clinica_integracoes before update on public.clinica_integracoes
for each row execute function app_private.set_updated_at();

alter table public.clinica_integracoes enable row level security;

drop policy if exists "clinica_integracoes_select_admin" on public.clinica_integracoes;
create policy "clinica_integracoes_select_admin" on public.clinica_integracoes
for select to authenticated
using (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "clinica_integracoes_insert_admin" on public.clinica_integracoes;
create policy "clinica_integracoes_insert_admin" on public.clinica_integracoes
for insert to authenticated
with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "clinica_integracoes_update_admin" on public.clinica_integracoes;
create policy "clinica_integracoes_update_admin" on public.clinica_integracoes
for update to authenticated
using (app_private.usuario_admin_clinica(clinica_id))
with check (app_private.usuario_admin_clinica(clinica_id));
