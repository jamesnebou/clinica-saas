-- Storage-backed client photos and basic clinic finance.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cliente-fotos',
  'cliente-fotos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.cliente_fotos
  alter column url drop not null,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists tamanho_bytes bigint;

alter table public.agendamentos
  add column if not exists pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'parcial', 'pago', 'cancelado')),
  add column if not exists forma_pagamento text check (forma_pagamento in ('pix', 'dinheiro', 'cartao', 'boleto', 'outro')),
  add column if not exists valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0),
  add column if not exists data_pagamento timestamptz;

create table if not exists public.pagamentos_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  profissional_id uuid references public.profissionais(id) on delete set null,
  descricao text,
  valor numeric(12,2) not null default 0 check (valor >= 0),
  valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'parcial', 'pago', 'cancelado')),
  forma_pagamento text check (forma_pagamento in ('pix', 'dinheiro', 'cartao', 'boleto', 'outro')),
  data_vencimento date,
  data_pagamento timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pacotes_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  descricao text,
  procedimento_id uuid references public.procedimentos(id) on delete set null,
  quantidade_sessoes integer not null default 1 check (quantidade_sessoes > 0),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  validade_dias integer not null default 90 check (validade_dias > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cliente_pacotes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  pacote_id uuid references public.pacotes_clinica(id) on delete set null,
  nome_pacote text not null,
  sessoes_total integer not null default 1 check (sessoes_total > 0),
  sessoes_utilizadas integer not null default 0 check (sessoes_utilizadas >= 0),
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  status text not null default 'ativo' check (status in ('ativo', 'finalizado', 'cancelado', 'vencido')),
  data_compra date not null default current_date,
  validade_em date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sessoes_utilizadas <= sessoes_total)
);

create index if not exists idx_pagamentos_clinica_periodo on public.pagamentos_clinica(clinica_id, created_at);
create index if not exists idx_pagamentos_clinica_agendamento on public.pagamentos_clinica(agendamento_id);
create index if not exists idx_pacotes_clinica_nome on public.pacotes_clinica(clinica_id, nome);
create index if not exists idx_cliente_pacotes_cliente on public.cliente_pacotes(cliente_id, status);

drop trigger if exists set_updated_at_pagamentos_clinica on public.pagamentos_clinica;
create trigger set_updated_at_pagamentos_clinica before update on public.pagamentos_clinica
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_pacotes_clinica on public.pacotes_clinica;
create trigger set_updated_at_pacotes_clinica before update on public.pacotes_clinica
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_cliente_pacotes on public.cliente_pacotes;
create trigger set_updated_at_cliente_pacotes before update on public.cliente_pacotes
for each row execute function app_private.set_updated_at();

alter table public.pagamentos_clinica enable row level security;
alter table public.pacotes_clinica enable row level security;
alter table public.cliente_pacotes enable row level security;

drop policy if exists "pagamentos_clinica_crud_membros" on public.pagamentos_clinica;
create policy "pagamentos_clinica_crud_membros" on public.pagamentos_clinica
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "pacotes_clinica_crud_membros" on public.pacotes_clinica;
create policy "pacotes_clinica_crud_membros" on public.pacotes_clinica
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "cliente_pacotes_crud_membros" on public.cliente_pacotes;
create policy "cliente_pacotes_crud_membros" on public.cliente_pacotes
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));
