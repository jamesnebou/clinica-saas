create table if not exists public.app_configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_app_configuracoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_app_configuracoes on public.app_configuracoes;
create trigger set_updated_at_app_configuracoes
before update on public.app_configuracoes
for each row execute function public.set_app_configuracoes_updated_at();

alter table public.app_configuracoes enable row level security;
