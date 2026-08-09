begin;

create table if not exists public.clinica_marketing_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,
  email text,
  clinica_nome text,
  profissionais_qtd integer not null default 1 check (profissionais_qtd between 1 and 500),
  agendamentos_mes integer check (agendamentos_mes is null or agendamentos_mes >= 0),
  plano_interesse text not null default 'nao_sei' check (plano_interesse in ('starter','growth','premium','nao_sei')),
  origem text not null default 'site',
  status text not null default 'novo' check (status in ('novo','contatado','qualificado','convertido','perdido')),
  observacoes text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  session_id text, pagina text, referrer text, ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinica_marketing_leads_status_idx on public.clinica_marketing_leads(status, created_at desc);
create index if not exists clinica_marketing_leads_whatsapp_idx on public.clinica_marketing_leads(whatsapp);
create index if not exists clinica_marketing_leads_campaign_idx on public.clinica_marketing_leads(utm_campaign, created_at desc);
create index if not exists clinica_marketing_leads_ip_idx on public.clinica_marketing_leads(ip_hash, created_at desc);

drop trigger if exists set_updated_at_clinica_marketing_leads on public.clinica_marketing_leads;
create trigger set_updated_at_clinica_marketing_leads before update on public.clinica_marketing_leads
for each row execute function app_private.set_updated_at();

create table if not exists public.clinica_marketing_eventos (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text,
  lead_id uuid references public.clinica_marketing_leads(id) on delete set null,
  pagina text, referrer text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clinica_marketing_eventos_name_idx on public.clinica_marketing_eventos(event_name, created_at desc);
create index if not exists clinica_marketing_eventos_session_idx on public.clinica_marketing_eventos(session_id, created_at);
create index if not exists clinica_marketing_eventos_campaign_idx on public.clinica_marketing_eventos(utm_campaign, created_at desc);

alter table public.clinica_marketing_leads enable row level security;
alter table public.clinica_marketing_eventos enable row level security;
revoke all on public.clinica_marketing_leads from anon, authenticated;
revoke all on public.clinica_marketing_eventos from anon, authenticated;
grant all on public.clinica_marketing_leads to service_role;
grant all on public.clinica_marketing_eventos to service_role;

commit;
