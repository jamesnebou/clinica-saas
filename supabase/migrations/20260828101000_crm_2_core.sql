begin;

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  padrao boolean not null default false,
  ordem integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id)
);
create unique index if not exists crm_pipeline_padrao_idx on public.crm_pipelines(clinica_id) where padrao and ativo;
create index if not exists crm_pipelines_ordem_idx on public.crm_pipelines(clinica_id,ativo,ordem);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  pipeline_id uuid not null,
  nome text not null,
  slug text not null,
  ordem integer not null default 0,
  cor text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  probabilidade numeric(5,2) not null default 0 check (probabilidade between 0 and 100),
  tipo text not null default 'open' check (tipo in ('open','won','lost')),
  semantic_key text check (semantic_key is null or semantic_key in ('new','contacted','qualified','evaluation_scheduled','negotiation','won','lost')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  unique (pipeline_id,slug),
  foreign key (clinica_id,pipeline_id) references public.crm_pipelines(clinica_id,id) on delete cascade
);
create unique index if not exists crm_stage_semantic_idx on public.crm_pipeline_stages(pipeline_id,semantic_key) where semantic_key is not null and ativo;
create index if not exists crm_stages_ordem_idx on public.crm_pipeline_stages(clinica_id,pipeline_id,ativo,ordem);

create table if not exists public.crm_lost_reasons (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  unique (clinica_id,nome)
);

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  cor text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  unique (clinica_id,nome)
);

alter table public.crm_oportunidades
  add column if not exists pipeline_id uuid,
  add column if not exists stage_id uuid,
  add column if not exists titulo text,
  add column if not exists procedimento_id uuid,
  add column if not exists responsavel_id uuid,
  add column if not exists temperatura text not null default 'morno',
  add column if not exists score integer not null default 50,
  add column if not exists sort_order numeric(20,8) not null default 1000,
  add column if not exists probabilidade_override numeric(5,2),
  add column if not exists valor_fechado numeric(14,2),
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_reason_id uuid,
  add column if not exists first_response_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists next_activity_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_clinica_id_id_key') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_clinica_id_id_key unique (clinica_id,id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_temperatura_check') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_temperatura_check check (temperatura in ('frio','morno','quente'));
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_score_check') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_score_check check (score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_probabilidade_check') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_probabilidade_check check (probabilidade_override is null or probabilidade_override between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_pipeline_fkey') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_pipeline_fkey foreign key (clinica_id,pipeline_id) references public.crm_pipelines(clinica_id,id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_stage_fkey') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_stage_fkey foreign key (clinica_id,stage_id) references public.crm_pipeline_stages(clinica_id,id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_oportunidades_lost_reason_fkey') then
    alter table public.crm_oportunidades add constraint crm_oportunidades_lost_reason_fkey foreign key (clinica_id,lost_reason_id) references public.crm_lost_reasons(clinica_id,id) on delete restrict;
  end if;
end $$;

create index if not exists crm_opportunities_board_idx on public.crm_oportunidades(clinica_id,pipeline_id,stage_id,sort_order);
create index if not exists crm_opportunities_owner_idx on public.crm_oportunidades(clinica_id,responsavel_id,stage_id);
create index if not exists crm_opportunities_contact_idx on public.crm_oportunidades(clinica_id,cliente_id,created_at desc);
create index if not exists crm_opportunities_activity_idx on public.crm_oportunidades(clinica_id,next_activity_at) where stage_id is not null;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  opportunity_id uuid not null,
  cliente_id uuid,
  owner_id uuid,
  tipo text not null check (tipo in ('ligacao','whatsapp','email','reuniao','avaliacao','follow_up','tarefa','nota','outro')),
  titulo text not null,
  descricao text,
  due_at timestamptz,
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  foreign key (clinica_id,opportunity_id) references public.crm_oportunidades(clinica_id,id) on delete cascade
);
create index if not exists crm_activities_due_idx on public.crm_activities(clinica_id,status,due_at);
create index if not exists crm_activities_opportunity_idx on public.crm_activities(clinica_id,opportunity_id,created_at desc);

create table if not exists public.crm_opportunity_events (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  opportunity_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (clinica_id,id),
  foreign key (clinica_id,opportunity_id) references public.crm_oportunidades(clinica_id,id) on delete cascade
);
create index if not exists crm_events_timeline_idx on public.crm_opportunity_events(clinica_id,opportunity_id,occurred_at desc);

create table if not exists public.crm_opportunity_tags (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  opportunity_id uuid not null,
  tag_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (opportunity_id,tag_id),
  foreign key (clinica_id,opportunity_id) references public.crm_oportunidades(clinica_id,id) on delete cascade,
  foreign key (clinica_id,tag_id) references public.crm_tags(clinica_id,id) on delete cascade
);

create table if not exists public.crm_opportunity_appointments (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  opportunity_id uuid not null,
  agendamento_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (opportunity_id,agendamento_id),
  foreign key (clinica_id,opportunity_id) references public.crm_oportunidades(clinica_id,id) on delete cascade,
  foreign key (clinica_id,agendamento_id) references public.agendamentos(clinica_id,id) on delete cascade
);

create table if not exists public.crm_saved_views (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  filters jsonb not null default '{}'::jsonb,
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id,user_id,nome)
);

alter table public.procedimentos add column if not exists crm_booking_behavior text not null default 'none';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='procedimentos_crm_booking_behavior_check') then
    alter table public.procedimentos add constraint procedimentos_crm_booking_behavior_check check (crm_booking_behavior in ('none','evaluation','opportunity','direct_sale'));
  end if;
end $$;
alter table public.agendamentos add column if not exists crm_oportunidade_id uuid references public.crm_oportunidades(id) on delete set null;
alter table public.site_agendamentos_publicos add column if not exists crm_oportunidade_id uuid references public.crm_oportunidades(id) on delete set null;
create index if not exists agendamentos_crm_opportunity_idx on public.agendamentos(clinica_id,crm_oportunidade_id) where crm_oportunidade_id is not null;

do $$ declare t text; begin
  foreach t in array array['crm_pipelines','crm_pipeline_stages','crm_lost_reasons','crm_tags','crm_activities','crm_saved_views'] loop
    execute format('drop trigger if exists set_updated_at_%I on public.%I',t,t);
    execute format('create trigger set_updated_at_%I before update on public.%I for each row execute function app_private.set_updated_at()',t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['crm_pipelines','crm_pipeline_stages','crm_lost_reasons','crm_tags','crm_activities','crm_opportunity_events','crm_opportunity_tags','crm_opportunity_appointments','crm_saved_views'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I','crm_select_'||t,t);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id))','crm_select_'||t,t);
    execute format('drop policy if exists %I on public.%I','crm_insert_'||t,t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.usuario_tem_acesso_clinica(clinica_id))','crm_insert_'||t,t);
    execute format('drop policy if exists %I on public.%I','crm_update_'||t,t);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id)) with check (app_private.usuario_tem_acesso_clinica(clinica_id))','crm_update_'||t,t);
    execute format('drop policy if exists %I on public.%I','crm_delete_'||t,t);
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.usuario_tem_acesso_clinica(clinica_id))','crm_delete_'||t,t);
  end loop;
end $$;

grant select,insert,update,delete on public.crm_pipelines,public.crm_pipeline_stages,public.crm_lost_reasons,public.crm_tags,
  public.crm_activities,public.crm_opportunity_events,public.crm_opportunity_tags,public.crm_opportunity_appointments,public.crm_saved_views to authenticated;
grant all on public.crm_pipelines,public.crm_pipeline_stages,public.crm_lost_reasons,public.crm_tags,
  public.crm_activities,public.crm_opportunity_events,public.crm_opportunity_tags,public.crm_opportunity_appointments,public.crm_saved_views to service_role;

-- Outbox becomes domain-generic. The WhatsApp worker keeps claiming only its own event families.
alter table public.domain_outbox_events drop constraint if exists domain_outbox_events_event_name_check;
alter table public.domain_outbox_events add constraint domain_outbox_events_event_name_check check (event_name ~ '^[a-z0-9_.-]+$');

commit;
