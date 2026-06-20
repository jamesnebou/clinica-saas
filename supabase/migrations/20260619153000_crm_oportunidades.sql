-- Clinic CRM pipeline for leads and opportunities.

create table if not exists public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  origem text not null default 'whatsapp' check (origem in ('instagram', 'indicacao', 'google', 'trafego_pago', 'whatsapp', 'site', 'outro')),
  status text not null default 'lead' check (status in ('lead', 'avaliacao_marcada', 'em_negociacao', 'convertido', 'perdido')),
  valor_estimado numeric(12,2) not null default 0 check (valor_estimado >= 0),
  proxima_acao_em date,
  proxima_acao text,
  observacoes text,
  perdido_motivo text,
  convertido_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_oportunidades_clinica_status on public.crm_oportunidades(clinica_id, status);
create index if not exists idx_crm_oportunidades_clinica_proxima_acao on public.crm_oportunidades(clinica_id, proxima_acao_em);
create index if not exists idx_crm_oportunidades_cliente on public.crm_oportunidades(cliente_id);

drop trigger if exists set_updated_at_crm_oportunidades on public.crm_oportunidades;
create trigger set_updated_at_crm_oportunidades before update on public.crm_oportunidades
for each row execute function app_private.set_updated_at();

alter table public.crm_oportunidades enable row level security;

drop policy if exists "crm_oportunidades_crud_membros" on public.crm_oportunidades;
create policy "crm_oportunidades_crud_membros" on public.crm_oportunidades
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));
