create table if not exists public.clinica_tutoriais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao_curta text,
  descricao text,
  categoria text not null default 'Primeiros passos',
  video_url text not null,
  thumbnail_url text,
  duracao_minutos integer not null default 1 check (duracao_minutos > 0),
  ordem integer not null default 0 check (ordem >= 0),
  passos jsonb not null default '[]'::jsonb check (jsonb_typeof(passos) = 'array'),
  destaque boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinica_tutoriais_ativo_ordem_idx
  on public.clinica_tutoriais (ativo, destaque desc, ordem, created_at);

alter table public.clinica_tutoriais enable row level security;

revoke all on table public.clinica_tutoriais from anon, authenticated;
grant all on table public.clinica_tutoriais to service_role;

comment on table public.clinica_tutoriais is
  'Central de vídeos e guias de uso do SaaS de clínicas, gerenciada pelo administrador interno.';

comment on column public.clinica_tutoriais.passos is
  'Lista JSON de passos curtos exibidos junto ao vídeo.';
