-- Gateways de pagamento individuais por clínica.
-- As credenciais e identificadores pertencem sempre ao tenant da clínica.

alter table public.clinica_integracoes
  add column if not exists pagamento_gateway text,
  add column if not exists infinitepay_ativo boolean not null default false,
  add column if not exists infinitepay_handle text,
  add column if not exists infinitepay_configuracao_publica jsonb not null default '{}'::jsonb,
  add column if not exists infinitepay_ultimo_sync_em timestamptz,
  add column if not exists infinitepay_ultimo_erro text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clinica_integracoes_pagamento_gateway_check'
      and conrelid = 'public.clinica_integracoes'::regclass
  ) then
    alter table public.clinica_integracoes
      add constraint clinica_integracoes_pagamento_gateway_check
      check (pagamento_gateway is null or pagamento_gateway in ('asaas', 'infinitepay'));
  end if;
end
$$;

update public.clinica_integracoes
set pagamento_gateway = 'asaas'
where pagamento_gateway is null and asaas_ativo = true;

alter table public.site_agendamentos_publicos
  add column if not exists pagamento_gateway text,
  add column if not exists pagamento_external_id text,
  add column if not exists pagamento_transaction_id text,
  add column if not exists pagamento_receipt_url text;

update public.site_agendamentos_publicos
set pagamento_gateway = 'asaas',
    pagamento_external_id = asaas_payment_id
where asaas_payment_id is not null
  and pagamento_gateway is null;

create unique index if not exists site_agendamentos_publicos_gateway_external_idx
  on public.site_agendamentos_publicos (pagamento_gateway, pagamento_external_id)
  where pagamento_gateway is not null and pagamento_external_id is not null;

alter table public.pedidos_clinica
  add column if not exists pagamento_gateway text,
  add column if not exists pagamento_external_id text,
  add column if not exists pagamento_transaction_id text,
  add column if not exists pagamento_receipt_url text;

update public.pedidos_clinica
set pagamento_gateway = 'asaas',
    pagamento_external_id = asaas_payment_id
where asaas_payment_id is not null
  and pagamento_gateway is null;

create unique index if not exists pedidos_clinica_gateway_external_idx
  on public.pedidos_clinica (pagamento_gateway, pagamento_external_id)
  where pagamento_gateway is not null and pagamento_external_id is not null;

comment on column public.clinica_integracoes.pagamento_gateway is
  'Gateway principal escolhido pela clínica para checkouts públicos.';
comment on column public.clinica_integracoes.infinitepay_handle is
  'InfiniteTag pública da conta InfinitePay pertencente à clínica.';
comment on column public.site_agendamentos_publicos.pagamento_external_id is
  'Identificador idempotente da cobrança no gateway selecionado.';
comment on column public.pedidos_clinica.pagamento_external_id is
  'Identificador idempotente da cobrança no gateway selecionado.';
