begin;

-- Multi-segment registry. This migration is additive and keeps every current clinic working.
create table if not exists public.segmentos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segmentos_slug_check check (slug ~ '^[a-z0-9_]+$')
);

insert into public.segmentos (slug, nome, descricao, ordem, metadata)
values
  ('estetica', 'Estética', 'Clínicas e profissionais de estética.', 10, '{"terminologia":{"cliente":"Cliente","clientes":"Clientes","procedimento":"Procedimento","procedimentos":"Procedimentos","profissional":"Profissional","profissionais":"Profissionais"}}'::jsonb),
  ('fisioterapia', 'Fisioterapia', 'Clínicas e consultórios de fisioterapia.', 20, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Atendimento","procedimentos":"Atendimentos","profissional":"Fisioterapeuta","profissionais":"Fisioterapeutas"}}'::jsonb),
  ('odontologia', 'Odontologia', 'Clínicas e consultórios odontológicos.', 30, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Tratamento","procedimentos":"Tratamentos","profissional":"Dentista","profissionais":"Dentistas"}}'::jsonb),
  ('medicina', 'Medicina / Consultório', 'Clínicas médicas e consultórios.', 40, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Consulta","procedimentos":"Consultas","profissional":"Profissional","profissionais":"Profissionais"}}'::jsonb),
  ('psicologia', 'Psicologia', 'Clínicas e consultórios de psicologia.', 50, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Sessão","procedimentos":"Sessões","profissional":"Psicólogo","profissionais":"Psicólogos"}}'::jsonb),
  ('nutricao', 'Nutrição', 'Clínicas e consultórios de nutrição.', 60, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Consulta","procedimentos":"Consultas","profissional":"Nutricionista","profissionais":"Nutricionistas"}}'::jsonb),
  ('pilates', 'Pilates', 'Estúdios e clínicas de pilates.', 70, '{"terminologia":{"cliente":"Aluno","clientes":"Alunos","procedimento":"Aula","procedimentos":"Aulas","profissional":"Instrutor","profissionais":"Instrutores"}}'::jsonb),
  ('multidisciplinar', 'Multidisciplinar', 'Operações com múltiplas especialidades.', 80, '{"terminologia":{"cliente":"Paciente","clientes":"Pacientes","procedimento":"Atendimento","procedimentos":"Atendimentos","profissional":"Profissional","profissionais":"Profissionais"}}'::jsonb)
on conflict (slug) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  ordem = excluded.ordem,
  metadata = public.segmentos.metadata || excluded.metadata,
  updated_at = now();

-- BI is a core capability for the initial segment catalog. Keeping this marker in
-- the database lets RPC authorization enforce the same segment rule as the app.
update public.segmentos
set metadata = jsonb_set(
  metadata,
  '{capabilities}',
  coalesce(metadata -> 'capabilities', '[]'::jsonb) || '["bi"]'::jsonb,
  true
)
where slug in ('estetica', 'fisioterapia', 'odontologia', 'medicina', 'psicologia', 'nutricao', 'pilates', 'multidisciplinar')
  and not (coalesce(metadata -> 'capabilities', '[]'::jsonb) ? 'bi');

create table if not exists public.clinica_segmentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  segmento_id uuid not null references public.segmentos(id) on delete restrict,
  principal boolean not null default false,
  configuracao jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (clinica_id, segmento_id)
);

create unique index if not exists clinica_segmentos_principal_unico_idx
  on public.clinica_segmentos(clinica_id)
  where principal = true;
create index if not exists clinica_segmentos_segmento_idx
  on public.clinica_segmentos(segmento_id, clinica_id);

-- Existing clinics receive the legacy-safe default only when they have no segment relation.
insert into public.clinica_segmentos (clinica_id, segmento_id, principal)
select c.id, s.id, true
from public.clinicas c
join public.segmentos s on s.slug = 'estetica'
where not exists (
  select 1 from public.clinica_segmentos cs where cs.clinica_id = c.id
)
on conflict (clinica_id, segmento_id) do nothing;

create table if not exists public.clinica_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  capability text not null,
  habilitada boolean not null,
  motivo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, capability),
  constraint clinica_capability_overrides_capability_check check (capability ~ '^[a-z0-9_]+$')
);

create table if not exists public.metas_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  tipo text not null,
  referencia text,
  periodo_inicio date not null,
  periodo_fim date not null,
  valor_meta numeric(16,2) not null check (valor_meta >= 0),
  profissional_id uuid references public.profissionais(id) on delete cascade,
  unidade_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metas_clinica_periodo_check check (periodo_fim >= periodo_inicio)
);

create index if not exists metas_clinica_periodo_idx
  on public.metas_clinica(clinica_id, tipo, periodo_inicio, periodo_fim);
create index if not exists metas_clinica_profissional_idx
  on public.metas_clinica(clinica_id, profissional_id, periodo_inicio)
  where profissional_id is not null;

create table if not exists public.eventos_analiticos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  session_id text,
  actor_id uuid,
  contato_id uuid references public.clientes(id) on delete set null,
  event_name text not null,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  referrer text,
  landing_page text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint eventos_analiticos_event_name_check check (event_name ~ '^[a-z0-9_]+$')
);

create index if not exists eventos_analiticos_periodo_idx
  on public.eventos_analiticos(clinica_id, occurred_at desc);
create index if not exists eventos_analiticos_funil_idx
  on public.eventos_analiticos(clinica_id, event_name, occurred_at desc);
create index if not exists eventos_analiticos_session_idx
  on public.eventos_analiticos(clinica_id, session_id, occurred_at)
  where session_id is not null;
create index if not exists eventos_analiticos_atribuicao_idx
  on public.eventos_analiticos(clinica_id, source, medium, campaign, occurred_at desc);
create unique index if not exists eventos_analiticos_idempotencia_idx
  on public.eventos_analiticos(clinica_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.auditoria_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  actor_id uuid,
  acao text not null,
  entidade_tipo text not null,
  entidade_id text,
  metadata jsonb not null default '{}'::jsonb,
  ocorrido_em timestamptz not null default now(),
  constraint auditoria_clinica_acao_check check (acao ~ '^[a-z0-9_.]+$'),
  constraint auditoria_clinica_entidade_check check (entidade_tipo ~ '^[a-z0-9_]+$')
);

create index if not exists auditoria_clinica_periodo_idx
  on public.auditoria_clinica(clinica_id, ocorrido_em desc);
create index if not exists auditoria_clinica_entidade_idx
  on public.auditoria_clinica(clinica_id, entidade_tipo, entidade_id, ocorrido_em desc);

-- Attribution is additive. The legacy origem column remains the operational source of truth.
alter table public.crm_oportunidades
  add column if not exists source text,
  add column if not exists medium text,
  add column if not exists campaign text,
  add column if not exists content text,
  add column if not exists term text,
  add column if not exists referrer text,
  add column if not exists landing_page text,
  add column if not exists utm jsonb not null default '{}'::jsonb,
  add column if not exists identificador_externo text;

create index if not exists crm_oportunidades_atribuicao_idx
  on public.crm_oportunidades(clinica_id, source, medium, campaign, created_at desc);
create index if not exists crm_oportunidades_identificador_externo_idx
  on public.crm_oportunidades(clinica_id, identificador_externo)
  where identificador_externo is not null;

drop trigger if exists set_updated_at_segmentos on public.segmentos;
create trigger set_updated_at_segmentos before update on public.segmentos
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_clinica_capability_overrides on public.clinica_capability_overrides;
create trigger set_updated_at_clinica_capability_overrides before update on public.clinica_capability_overrides
for each row execute function app_private.set_updated_at();

drop trigger if exists set_updated_at_metas_clinica on public.metas_clinica;
create trigger set_updated_at_metas_clinica before update on public.metas_clinica
for each row execute function app_private.set_updated_at();

create or replace function app_private.usuario_pode_bi_clinica(p_clinica_id uuid)
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
      and (
        uc.papel in ('owner', 'admin')
        or coalesce(uc.permissoes -> 'secoes', '[]'::jsonb) ? 'bi'
      )
  );
$$;

create or replace function app_private.clinica_tem_capability_bi(p_clinica_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.clinica_segmentos cs
      join public.segmentos s on s.id = cs.segmento_id and s.ativo = true
      where cs.clinica_id = p_clinica_id
        and coalesce(s.metadata -> 'capabilities', '[]'::jsonb) ? 'bi'
    )
    and coalesce(
      (
        select cco.habilitada
        from public.clinica_capability_overrides cco
        where cco.clinica_id = p_clinica_id and cco.capability = 'bi'
      ),
      (
        select case
          when jsonb_typeof(ps.metadata -> 'capabilities') = 'array'
            and jsonb_array_length(ps.metadata -> 'capabilities') > 0
            then ps.metadata -> 'capabilities' ? 'bi'
          else true
        end
        from public.clinicas c
        left join public.planos_sistema ps on ps.slug = c.plano
        where c.id = p_clinica_id
      ),
      true
    );
$$;

grant execute on function app_private.usuario_pode_bi_clinica(uuid) to authenticated;
grant execute on function app_private.clinica_tem_capability_bi(uuid) to authenticated;

alter table public.segmentos enable row level security;
alter table public.clinica_segmentos enable row level security;
alter table public.clinica_capability_overrides enable row level security;
alter table public.metas_clinica enable row level security;
alter table public.eventos_analiticos enable row level security;
alter table public.auditoria_clinica enable row level security;

drop policy if exists segmentos_select_authenticated on public.segmentos;
create policy segmentos_select_authenticated on public.segmentos
  for select to authenticated using (ativo = true);

drop policy if exists clinica_segmentos_select_membros on public.clinica_segmentos;
create policy clinica_segmentos_select_membros on public.clinica_segmentos
  for select to authenticated
  using (app_private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists clinica_segmentos_insert_admin on public.clinica_segmentos;
create policy clinica_segmentos_insert_admin on public.clinica_segmentos
  for insert to authenticated
  with check (app_private.usuario_admin_clinica(clinica_id));
drop policy if exists clinica_segmentos_update_admin on public.clinica_segmentos;
create policy clinica_segmentos_update_admin on public.clinica_segmentos
  for update to authenticated
  using (app_private.usuario_admin_clinica(clinica_id))
  with check (app_private.usuario_admin_clinica(clinica_id));
drop policy if exists clinica_segmentos_delete_admin on public.clinica_segmentos;
create policy clinica_segmentos_delete_admin on public.clinica_segmentos
  for delete to authenticated
  using (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists clinica_capabilities_select_membros on public.clinica_capability_overrides;
create policy clinica_capabilities_select_membros on public.clinica_capability_overrides
  for select to authenticated
  using (app_private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists clinica_capabilities_crud_admin on public.clinica_capability_overrides;
create policy clinica_capabilities_crud_admin on public.clinica_capability_overrides
  for all to authenticated
  using (app_private.usuario_admin_clinica(clinica_id))
  with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists metas_clinica_select_bi on public.metas_clinica;
create policy metas_clinica_select_bi on public.metas_clinica
  for select to authenticated
  using (app_private.usuario_pode_bi_clinica(clinica_id));
drop policy if exists metas_clinica_crud_admin on public.metas_clinica;
create policy metas_clinica_crud_admin on public.metas_clinica
  for all to authenticated
  using (app_private.usuario_admin_clinica(clinica_id))
  with check (app_private.usuario_admin_clinica(clinica_id));

drop policy if exists eventos_analiticos_select_bi on public.eventos_analiticos;
create policy eventos_analiticos_select_bi on public.eventos_analiticos
  for select to authenticated
  using (app_private.usuario_pode_bi_clinica(clinica_id));

drop policy if exists auditoria_clinica_select_admin on public.auditoria_clinica;
create policy auditoria_clinica_select_admin on public.auditoria_clinica
  for select to authenticated
  using (app_private.usuario_admin_clinica(clinica_id));
drop policy if exists auditoria_clinica_insert_bi on public.auditoria_clinica;
create policy auditoria_clinica_insert_bi on public.auditoria_clinica
  for insert to authenticated
  with check (
    app_private.usuario_pode_bi_clinica(clinica_id)
    and actor_id = auth.uid()
  );

grant select on public.segmentos to authenticated;
grant select, insert, update, delete on public.clinica_segmentos to authenticated;
grant select, insert, update, delete on public.clinica_capability_overrides to authenticated;
grant select, insert, update, delete on public.metas_clinica to authenticated;
grant select on public.eventos_analiticos to authenticated;
grant select, insert on public.auditoria_clinica to authenticated;

grant all privileges on public.segmentos, public.clinica_segmentos,
  public.clinica_capability_overrides, public.metas_clinica, public.eventos_analiticos,
  public.auditoria_clinica
  to service_role;

comment on table public.segmentos is 'Registry central dos segmentos atendidos pela plataforma.';
comment on table public.clinica_segmentos is 'Segmentos de atuação da clínica; no máximo um principal por clínica.';
comment on table public.clinica_capability_overrides is 'Overrides explícitos por clínica, separados de segmento e plano comercial.';
comment on table public.metas_clinica is 'Metas mensuráveis por clínica, período e opcionalmente profissional/unidade.';
comment on table public.eventos_analiticos is 'Eventos first-party mínimos para funis e atribuição, sem payload clínico sensível.';
comment on table public.auditoria_clinica is 'Trilha imutável de ações administrativas, sem segredos ou conteúdo clínico sensível.';

commit;
