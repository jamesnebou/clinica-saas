-- Adds client medical record fields and before/after photo registry.

alter table public.clientes
  add column if not exists observacoes_clinicas text,
  add column if not exists anamnese jsonb not null default '{}'::jsonb,
  add column if not exists alergias text,
  add column if not exists contraindicacoes text,
  add column if not exists medicamentos_uso text,
  add column if not exists procedimentos_previos text,
  add column if not exists retorno_recomendado_em date,
  add column if not exists termo_consentimento_aceito boolean not null default false,
  add column if not exists termo_consentimento_aceito_em timestamptz,
  add column if not exists termo_consentimento_observacao text;

create table if not exists public.cliente_fotos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'evolucao' check (tipo in ('antes', 'depois', 'evolucao', 'documento')),
  titulo text,
  url text not null,
  observacoes text,
  data_foto date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cliente_fotos_cliente_data on public.cliente_fotos(cliente_id, data_foto desc);
create index if not exists idx_cliente_fotos_clinica on public.cliente_fotos(clinica_id);

drop trigger if exists set_updated_at_cliente_fotos on public.cliente_fotos;
create trigger set_updated_at_cliente_fotos before update on public.cliente_fotos
for each row execute function app_private.set_updated_at();

alter table public.cliente_fotos enable row level security;

drop policy if exists "cliente_fotos_crud_membros" on public.cliente_fotos;
create policy "cliente_fotos_crud_membros" on public.cliente_fotos
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));
