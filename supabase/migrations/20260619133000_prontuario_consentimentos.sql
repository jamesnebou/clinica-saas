-- Stronger medical record controls: consent records and photo governance.

create or replace function app_private.usuario_prontuario_clinica(p_clinica_id uuid)
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
      and uc.papel in ('owner', 'admin', 'profissional')
      and (
        uc.user_id = auth.uid()
        or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

grant execute on function app_private.usuario_prontuario_clinica(uuid) to authenticated;

alter table public.clientes
  add column if not exists termo_consentimento_versao text,
  add column if not exists termo_consentimento_registrado_por uuid references auth.users(id) on delete set null;

create table if not exists public.cliente_consentimentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'procedimento' check (tipo in ('procedimento', 'imagem', 'lgpd', 'anamnese', 'outro')),
  titulo text not null,
  versao text not null default 'v1',
  texto text not null,
  aceito boolean not null default true,
  aceito_em timestamptz not null default now(),
  aceito_por_nome text,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cliente_consentimentos_cliente on public.cliente_consentimentos(cliente_id, aceito_em desc);
create index if not exists idx_cliente_consentimentos_clinica on public.cliente_consentimentos(clinica_id, created_at desc);

drop trigger if exists set_updated_at_cliente_consentimentos on public.cliente_consentimentos;
create trigger set_updated_at_cliente_consentimentos before update on public.cliente_consentimentos
for each row execute function app_private.set_updated_at();

alter table public.cliente_fotos
  add column if not exists autorizacao_uso_imagem boolean not null default false,
  add column if not exists visibilidade text not null default 'restrito' check (visibilidade in ('restrito', 'interno', 'marketing')),
  add column if not exists consentimento_id uuid references public.cliente_consentimentos(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.cliente_consentimentos enable row level security;

drop policy if exists "cliente_consentimentos_prontuario" on public.cliente_consentimentos;
create policy "cliente_consentimentos_prontuario" on public.cliente_consentimentos
for all to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id))
with check (app_private.usuario_prontuario_clinica(clinica_id));

drop policy if exists "cliente_fotos_crud_membros" on public.cliente_fotos;
drop policy if exists "cliente_fotos_prontuario" on public.cliente_fotos;
create policy "cliente_fotos_prontuario" on public.cliente_fotos
for all to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id))
with check (app_private.usuario_prontuario_clinica(clinica_id));
