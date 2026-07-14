-- Credenciais Asaas individuais por clínica, criptografadas pela aplicação.

alter table public.clinica_integracoes
  add column if not exists asaas_ambiente text not null default 'sandbox' check (asaas_ambiente in ('sandbox', 'producao')),
  add column if not exists asaas_configuracao_publica jsonb not null default '{}'::jsonb,
  add column if not exists asaas_segredos_criptografados text,
  add column if not exists asaas_webhook_url text,
  add column if not exists asaas_ultimo_sync_em timestamptz,
  add column if not exists asaas_ultimo_erro text;

alter table public.clinica_integracoes
  alter column asaas_base_url set default 'https://api-sandbox.asaas.com/v3';

comment on column public.clinica_integracoes.asaas_segredos_criptografados is
  'API key e token do webhook Asaas protegidos com AES-256-GCM pela aplicação.';
comment on column public.clinica_integracoes.asaas_api_key is
  'Legado: mantido apenas para migração; novas conexões limpam este campo.';
comment on column public.clinica_integracoes.asaas_webhook_token is
  'Legado: mantido apenas para migração; novas conexões limpam este campo.';
