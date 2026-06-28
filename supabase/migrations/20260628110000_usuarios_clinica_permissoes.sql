alter table public.usuarios_clinica
  add column if not exists permissoes jsonb not null default '{}'::jsonb;

