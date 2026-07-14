-- Initial schema for Clinica SaaS MVP.
-- Apply this migration in the Supabase SQL editor or via Supabase CLI.

create schema if not exists app_private;

create extension if not exists pgcrypto;

create table if not exists public.clinicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique not null,
  documento text,
  telefone text,
  email text,
  cidade text,
  estado text,
  endereco text,
  status text not null default 'ativa' check (status in ('ativa', 'inativa', 'bloqueada', 'cancelada')),
  plano text not null default 'starter',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuarios_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nome text,
  email text not null,
  papel text not null default 'recepcao' check (papel in ('owner', 'admin', 'recepcao', 'profissional', 'financeiro')),
  ativo boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, email)
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  cpf text,
  data_nascimento date,
  endereco text,
  origem text,
  status text not null default 'ativo' check (status in ('lead', 'ativo', 'inativo', 'bloqueado')),
  observacoes text,
  consentimento_lgpd boolean not null default false,
  data_consentimento_lgpd timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profissionais (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  especialidade text,
  comissao_percentual numeric(5,2) not null default 0 check (comissao_percentual >= 0 and comissao_percentual <= 100),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procedimentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  categoria text,
  descricao text,
  duracao_minutos integer not null default 60 check (duracao_minutos > 0),
  preco numeric(12,2) not null default 0 check (preco >= 0),
  ativo boolean not null default true,
  cuidados_antes text,
  cuidados_depois text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  profissional_id uuid references public.profissionais(id) on delete set null,
  procedimento_id uuid references public.procedimentos(id) on delete set null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'faltou', 'cancelado')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim > inicio)
);

create index if not exists idx_usuarios_clinica_user_id on public.usuarios_clinica(user_id);
create index if not exists idx_usuarios_clinica_email on public.usuarios_clinica(lower(email));
create index if not exists idx_clientes_clinica_nome on public.clientes(clinica_id, nome);
create index if not exists idx_profissionais_clinica_nome on public.profissionais(clinica_id, nome);
create index if not exists idx_procedimentos_clinica_nome on public.procedimentos(clinica_id, nome);
create index if not exists idx_agendamentos_clinica_inicio on public.agendamentos(clinica_id, inicio);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_clinicas on public.clinicas;
create trigger set_updated_at_clinicas before update on public.clinicas
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_usuarios_clinica on public.usuarios_clinica;
create trigger set_updated_at_usuarios_clinica before update on public.usuarios_clinica
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_clientes on public.clientes;
create trigger set_updated_at_clientes before update on public.clientes
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_profissionais on public.profissionais;
create trigger set_updated_at_profissionais before update on public.profissionais
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_procedimentos on public.procedimentos;
create trigger set_updated_at_procedimentos before update on public.procedimentos
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_agendamentos on public.agendamentos;
create trigger set_updated_at_agendamentos before update on public.agendamentos
for each row execute function app_private.set_updated_at();

create or replace function app_private.usuario_tem_acesso_clinica(p_clinica_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios_clinica uc
    where uc.clinica_id = p_clinica_id
      and uc.ativo = true
      and (
        uc.user_id = auth.uid()
        or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

create or replace function app_private.usuario_admin_clinica(p_clinica_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios_clinica uc
    where uc.clinica_id = p_clinica_id
      and uc.ativo = true
      and uc.papel in ('owner', 'admin')
      and (
        uc.user_id = auth.uid()
        or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.usuario_tem_acesso_clinica(uuid) to authenticated;
grant execute on function app_private.usuario_admin_clinica(uuid) to authenticated;

alter table public.clinicas enable row level security;
alter table public.usuarios_clinica enable row level security;
alter table public.clientes enable row level security;
alter table public.profissionais enable row level security;
alter table public.procedimentos enable row level security;
alter table public.agendamentos enable row level security;

drop policy if exists "clinicas_select_membros" on public.clinicas;
create policy "clinicas_select_membros" on public.clinicas
for select to authenticated
using (app_private.usuario_tem_acesso_clinica(id));

drop policy if exists "clinicas_update_admin" on public.clinicas;
create policy "clinicas_update_admin" on public.clinicas
for update to authenticated
using (app_private.usuario_admin_clinica(id))
with check (app_private.usuario_admin_clinica(id));

drop policy if exists "usuarios_select_membros" on public.usuarios_clinica;
create policy "usuarios_select_membros" on public.usuarios_clinica
for select to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "usuarios_insert_admin" on public.usuarios_clinica;
create policy "usuarios_insert_admin" on public.usuarios_clinica
for insert to authenticated
with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "usuarios_update_admin" on public.usuarios_clinica;
create policy "usuarios_update_admin" on public.usuarios_clinica
for update to authenticated
using (app_private.usuario_admin_clinica(clinica_id))
with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "usuarios_delete_admin" on public.usuarios_clinica;
create policy "usuarios_delete_admin" on public.usuarios_clinica
for delete to authenticated
using (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists "clientes_crud_membros" on public.clientes;
create policy "clientes_crud_membros" on public.clientes
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "profissionais_crud_membros" on public.profissionais;
create policy "profissionais_crud_membros" on public.profissionais
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "procedimentos_crud_membros" on public.procedimentos;
create policy "procedimentos_crud_membros" on public.procedimentos
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists "agendamentos_crud_membros" on public.agendamentos;
create policy "agendamentos_crud_membros" on public.agendamentos
for all to authenticated
using (app_private.usuario_tem_acesso_clinica(clinica_id))
with check (app_private.usuario_tem_acesso_clinica(clinica_id));
