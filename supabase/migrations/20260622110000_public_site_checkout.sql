-- Public clinic site, editable presentation and public booking checkout.

alter table public.procedimentos
  add column if not exists publicado_site boolean not null default true,
  add column if not exists sinal_percentual numeric(5,2) not null default 0 check (sinal_percentual >= 0 and sinal_percentual <= 100),
  add column if not exists sinal_valor numeric(12,2) not null default 0 check (sinal_valor >= 0),
  add column if not exists destaque_site boolean not null default false,
  add column if not exists ordem_site integer not null default 0;

create table if not exists public.clinica_dominios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  dominio text not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'verificado', 'ativo', 'erro', 'inativo')),
  verificado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_agendamentos_publicos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  procedimento_id uuid references public.procedimentos(id) on delete set null,
  profissional_id uuid references public.profissionais(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  data_hora timestamptz not null,
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  valor_sinal numeric(12,2) not null default 0 check (valor_sinal >= 0),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('sem_sinal', 'pendente', 'pago', 'cancelado', 'erro')),
  asaas_payment_id text unique,
  invoice_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clinica_dominios_dominio on public.clinica_dominios(lower(dominio));
create index if not exists idx_site_agendamentos_clinica_data on public.site_agendamentos_publicos(clinica_id, data_hora desc);
create index if not exists idx_site_agendamentos_asaas on public.site_agendamentos_publicos(asaas_payment_id);

drop trigger if exists set_updated_at_clinica_dominios on public.clinica_dominios;
create trigger set_updated_at_clinica_dominios before update on public.clinica_dominios
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_site_agendamentos_publicos on public.site_agendamentos_publicos;
create trigger set_updated_at_site_agendamentos_publicos before update on public.site_agendamentos_publicos
for each row execute function app_private.set_updated_at();

alter table public.clinica_dominios enable row level security;
alter table public.site_agendamentos_publicos enable row level security;

drop policy if exists "clinica_dominios_crud_admin" on public.clinica_dominios;
create policy "clinica_dominios_crud_admin" on public.clinica_dominios
for all to authenticated
using (app_private.usuario_admin_clinica(clinica_id))
with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "site_agendamentos_publicos_select_membros" on public.site_agendamentos_publicos;
create policy "site_agendamentos_publicos_select_membros" on public.site_agendamentos_publicos
for select to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id));
