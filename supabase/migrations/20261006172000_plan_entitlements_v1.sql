-- Generic P0-04 schema and enforcement. Special production tenants are classified separately.
begin;

alter table public.clinicas
  add column plan_entitlements_mode text default 'catalog_v1',
  add column plan_entitlements_version integer default 1;

alter table public.clinicas
  add constraint clinicas_plan_entitlements_mode_check
    check (plan_entitlements_mode in ('catalog_v1', 'unlimited_lifetime', 'internal_full_access') or plan_entitlements_mode is null),
  add constraint clinicas_plan_entitlements_version_check
    check (plan_entitlements_version = 1 or plan_entitlements_version is null);

-- Known commercial plans retain their catalog. Unknown/legacy rows fail closed.
update public.clinicas
set plan_entitlements_mode = null
where plano is null or plano not in ('starter', 'growth', 'premium');

create or replace function app_private.prevent_clinic_plan_self_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role', nullif(current_setting('request.jwt.claim.role', true), ''),
    case when auth.uid() is null then current_user else 'authenticated' end)
    not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' then
      raise exception 'Commercial entitlements are managed by the platform' using errcode = '42501';
    end if;
    if new.plano is distinct from old.plano
      or new.plan_entitlements_mode is distinct from old.plan_entitlements_mode
      or new.plan_entitlements_version is distinct from old.plan_entitlements_version then
      raise exception 'Commercial entitlements are managed by the platform' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger prevent_clinic_plan_self_assignment
before insert or update on public.clinicas
for each row execute function app_private.prevent_clinic_plan_self_assignment();

create or replace function app_private.clinic_has_entitlement(p_clinica_id uuid, p_capability text)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.clinicas c
    where c.id = p_clinica_id
      and c.plan_entitlements_version = 1
      and p_capability in ('custom_domain', 'finance_advanced', 'finance_dre')
      and (
        c.plan_entitlements_mode in ('unlimited_lifetime', 'internal_full_access')
        or (c.plan_entitlements_mode = 'catalog_v1' and (
          (p_capability in ('custom_domain', 'finance_advanced') and c.plano in ('growth', 'premium'))
          or (p_capability = 'finance_dre' and c.plano = 'premium')
        ))
      )
  );
$$;

revoke all on function app_private.clinic_has_entitlement(uuid, text) from public, anon;
grant execute on function app_private.clinic_has_entitlement(uuid, text) to authenticated;

drop policy if exists "clinica_dominios_crud_admin" on public.clinica_dominios;
create policy "clinica_dominios_select_admin" on public.clinica_dominios
for select to authenticated
using (app_private.usuario_admin_clinica(clinica_id));
create policy "clinica_dominios_insert_entitled" on public.clinica_dominios
for insert to authenticated
with check (app_private.usuario_admin_clinica(clinica_id) and app_private.clinic_has_entitlement(clinica_id, 'custom_domain'));
create policy "clinica_dominios_update_entitled" on public.clinica_dominios
for update to authenticated
using (app_private.usuario_admin_clinica(clinica_id) and app_private.clinic_has_entitlement(clinica_id, 'custom_domain'))
with check (app_private.usuario_admin_clinica(clinica_id) and app_private.clinic_has_entitlement(clinica_id, 'custom_domain'));
-- Let an administrator remove a stale domain after downgrade.
create policy "clinica_dominios_delete_admin" on public.clinica_dominios
for delete to authenticated
using (app_private.usuario_admin_clinica(clinica_id));

-- These relations are only read by advanced screens. Existing permissive tenant
-- policies remain in force; the restrictive policy adds the plan requirement.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'finance_pagaveis', 'finance_pagavel_parcelas', 'finance_conciliacoes',
    'finance_liquidacoes', 'finance_liquidacao_parcelas', 'finance_movimentos',
    'finance_transferencias', 'finance_comissao_regras', 'finance_comissoes',
    'finance_comissao_pagamentos', 'finance_comissao_pagamento_itens',
    'finance_configuracoes', 'finance_categorias', 'finance_centros_custo',
    'finance_fornecedores', 'finance_recorrencias', 'finance_orcamentos',
    'pacotes_clinica', 'cliente_pacotes'
  ] loop
    execute format(
      'create policy p0_04_finance_advanced on public.%I as restrictive for all to authenticated '
      || 'using (app_private.clinic_has_entitlement(clinica_id, ''finance_advanced'')) '
      || 'with check (app_private.clinic_has_entitlement(clinica_id, ''finance_advanced''))',
      v_table
    );
  end loop;
end;
$$;

-- Starter may list accounts to register a basic receipt, but not manage accounts.
create policy p0_04_finance_accounts_insert on public.finance_contas
as restrictive for insert to authenticated
with check (app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));
create policy p0_04_finance_accounts_update on public.finance_contas
as restrictive for update to authenticated
using (app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'))
with check (app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));
create policy p0_04_finance_accounts_delete on public.finance_contas
as restrictive for delete to authenticated
using (app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));

-- Raw accrual facts are the DRE source. Growth's budget comparison is fetched
-- only by a tenant-and-entitlement-checked server path after this change.
create policy p0_04_finance_dre on public.finance_competencias
as restrictive for all to authenticated
using (app_private.clinic_has_entitlement(clinica_id, 'finance_dre'))
with check (app_private.clinic_has_entitlement(clinica_id, 'finance_dre'));

-- Direct installment mutations have no application callsite. Basic one-part
-- receipts still use the existing SECURITY DEFINER RPC and remain available.
revoke insert, update, delete on public.finance_recebivel_parcelas from authenticated;

-- Basic receivables remain writable, but direct package linkage is advanced.
create policy p0_04_receivable_package_insert on public.finance_recebiveis
as restrictive for insert to authenticated
with check (cliente_pacote_id is null or app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));
create policy p0_04_receivable_package_update on public.finance_recebiveis
as restrictive for update to authenticated
using (cliente_pacote_id is null or app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'))
with check (cliente_pacote_id is null or app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));
create policy p0_04_receivable_package_delete on public.finance_recebiveis
as restrictive for delete to authenticated
using (cliente_pacote_id is null or app_private.clinic_has_entitlement(clinica_id, 'finance_advanced'));

create function app_private.assert_finance_entitlement(p_clinica_id uuid, p_capability text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_role text := coalesce(auth.jwt()->>'role', nullif(current_setting('request.jwt.claim.role', true), ''),
  case when auth.uid() is null then current_user else 'authenticated' end);
begin
  -- Trusted workers may process an existing clinic independently of its plan.
  if v_role in ('service_role', 'postgres', 'supabase_admin') then return; end if;
  if not app_private.finance_usuario_pode_gerir(p_clinica_id)
    or not app_private.clinic_has_entitlement(p_clinica_id, p_capability) then
    raise exception 'Finance entitlement required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function app_private.assert_finance_entitlement(uuid, text) from public, anon, authenticated;

-- The basic receivable path calls this RPC with one installment. Keep that path;
-- require advanced entitlement only for actual installment plans.
alter function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb)
rename to finance_criar_recebivel_parcelado_p004_impl;
revoke all on function public.finance_criar_recebivel_parcelado_p004_impl(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb)
from public, anon, authenticated;
create function public.finance_criar_recebivel_parcelado(
  p_clinica_id uuid, p_descricao text, p_origem_tipo text, p_origem_id text,
  p_valor numeric, p_primeiro_vencimento date, p_parcelas integer default 1,
  p_categoria_codigo text default 'REC_SERVICOS', p_cliente_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.finance_recebiveis language plpgsql security definer set search_path = '' as $$
begin
  if p_parcelas > 1 then
    perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  end if;
  return public.finance_criar_recebivel_parcelado_p004_impl(
    p_clinica_id,p_descricao,p_origem_tipo,p_origem_id,p_valor,p_primeiro_vencimento,
    p_parcelas,p_categoria_codigo,p_cliente_id,p_metadata
  );
end;
$$;
revoke all on function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb)
from public, anon;
grant execute on function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb)
to authenticated, service_role;

-- Basic users receive only the receivables portion of the shared summary.
alter function public.finance_resumo_clinica(uuid,date,date) rename to finance_resumo_clinica_p004_impl;
revoke all on function public.finance_resumo_clinica_p004_impl(uuid,date,date) from public, anon, authenticated;
create function public.finance_resumo_clinica(p_clinica_id uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := public.finance_resumo_clinica_p004_impl(p_clinica_id,p_inicio,p_fim);
  if app_private.clinic_has_entitlement(p_clinica_id, 'finance_advanced') then
    return v_result;
  end if;
  return v_result - 'pagar' - 'caixa' - 'comissoes' - 'conciliacao';
end;
$$;
revoke all on function public.finance_resumo_clinica(uuid,date,date) from public, anon;
grant execute on function public.finance_resumo_clinica(uuid,date,date) to authenticated, service_role;

-- P0-03 implementation, including its locks, checks and audit, is untouched.
alter function public.finance_conciliar_liquidacao(uuid) rename to finance_conciliar_liquidacao_p004_impl;
revoke all on function public.finance_conciliar_liquidacao_p004_impl(uuid) from public, anon, authenticated;
create function public.finance_conciliar_liquidacao(p_conciliacao_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_clinica_id uuid;
begin
  select c.clinica_id into v_clinica_id
  from public.finance_conciliacoes c where c.id = p_conciliacao_id;
  perform app_private.assert_finance_entitlement(v_clinica_id, 'finance_advanced');
  return public.finance_conciliar_liquidacao_p004_impl(p_conciliacao_id);
end;
$$;
revoke all on function public.finance_conciliar_liquidacao(uuid) from public, anon;
grant execute on function public.finance_conciliar_liquidacao(uuid) to authenticated, service_role;

alter function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb)
rename to finance_criar_pagavel_p004_impl;
revoke all on function public.finance_criar_pagavel_p004_impl(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb)
from public, anon, authenticated;
create function public.finance_criar_pagavel(
  p_clinica_id uuid, p_descricao text, p_origem_tipo text, p_origem_id text,
  p_valor numeric, p_primeiro_vencimento date, p_categoria_id uuid,
  p_centro_custo_id uuid default null, p_fornecedor_id uuid default null,
  p_competencia date default null, p_parcelas integer default 1,
  p_metadata jsonb default '{}'::jsonb
) returns public.finance_pagaveis language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  return public.finance_criar_pagavel_p004_impl(
    p_clinica_id,p_descricao,p_origem_tipo,p_origem_id,p_valor,p_primeiro_vencimento,
    p_categoria_id,p_centro_custo_id,p_fornecedor_id,p_competencia,p_parcelas,p_metadata
  );
end;
$$;
revoke all on function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb)
from public, anon;
grant execute on function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb)
to authenticated, service_role;

alter function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb)
rename to finance_liquidar_pagavel_p004_impl;
revoke all on function public.finance_liquidar_pagavel_p004_impl(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb)
from public, anon, authenticated;
create function public.finance_liquidar_pagavel(
  p_clinica_id uuid, p_pagavel_id uuid, p_valor numeric, p_conta_id uuid,
  p_forma_pagamento text, p_data_liquidacao timestamptz, p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  return public.finance_liquidar_pagavel_p004_impl(
    p_clinica_id,p_pagavel_id,p_valor,p_conta_id,p_forma_pagamento,
    p_data_liquidacao,p_idempotency_key,p_metadata
  );
end;
$$;
revoke all on function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb)
from public, anon;
grant execute on function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb)
to authenticated, service_role;

alter function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text)
rename to finance_transferir_p004_impl;
revoke all on function public.finance_transferir_p004_impl(uuid,uuid,uuid,numeric,timestamptz,text,text)
from public, anon, authenticated;
create function public.finance_transferir(
  p_clinica_id uuid, p_conta_origem_id uuid, p_conta_destino_id uuid,
  p_valor numeric, p_data timestamptz, p_descricao text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  return public.finance_transferir_p004_impl(
    p_clinica_id,p_conta_origem_id,p_conta_destino_id,p_valor,p_data,
    p_descricao,p_idempotency_key
  );
end;
$$;
revoke all on function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text)
from public, anon;
grant execute on function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text)
to authenticated, service_role;

alter function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date)
rename to finance_reconhecer_sessao_pacote_p004_impl;
revoke all on function public.finance_reconhecer_sessao_pacote_p004_impl(uuid,uuid,integer,date)
from public, anon, authenticated;
create function public.finance_reconhecer_sessao_pacote(
  p_clinica_id uuid, p_cliente_pacote_id uuid, p_sessao integer,
  p_competencia date default current_date
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  return public.finance_reconhecer_sessao_pacote_p004_impl(
    p_clinica_id,p_cliente_pacote_id,p_sessao,p_competencia
  );
end;
$$;
revoke all on function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date)
from public, anon;
grant execute on function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date)
to authenticated, service_role;

alter function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text)
rename to finance_pagar_comissoes_p004_impl;
revoke all on function public.finance_pagar_comissoes_p004_impl(uuid,uuid[],uuid,text,timestamptz,text)
from public, anon, authenticated;
create function public.finance_pagar_comissoes(
  p_clinica_id uuid, p_comissao_ids uuid[], p_conta_id uuid default null,
  p_forma_pagamento text default 'pix', p_data_pagamento timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  return public.finance_pagar_comissoes_p004_impl(
    p_clinica_id,p_comissao_ids,p_conta_id,p_forma_pagamento,p_data_pagamento,p_idempotency_key
  );
end;
$$;
revoke all on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text)
from public, anon;
grant execute on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text)
to authenticated, service_role;

-- Only the service-role Server Action calls package sale; no browser RPC is needed.
revoke execute on function public.finance_vender_pacote_v2(uuid,uuid,uuid,date,date,numeric,text,text,text)
from authenticated;

-- A reversal may concern a basic receipt or an advanced payable.
alter function public.finance_estornar_liquidacao(uuid,uuid,text,text)
rename to finance_estornar_liquidacao_p004_impl;
revoke all on function public.finance_estornar_liquidacao_p004_impl(uuid,uuid,text,text)
from public, anon, authenticated;
create function public.finance_estornar_liquidacao(
  p_clinica_id uuid, p_liquidacao_id uuid, p_motivo text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.finance_liquidacoes l
    where l.clinica_id = p_clinica_id and l.id = p_liquidacao_id and l.pagavel_id is not null
  ) then
    perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  end if;
  return public.finance_estornar_liquidacao_p004_impl(
    p_clinica_id,p_liquidacao_id,p_motivo,p_idempotency_key
  );
end;
$$;
revoke all on function public.finance_estornar_liquidacao(uuid,uuid,text,text) from public, anon;
grant execute on function public.finance_estornar_liquidacao(uuid,uuid,text,text)
to authenticated, service_role;

-- Direct creation of a package-linked receivable is advanced; ordinary
-- appointment/manual receivables remain part of the basic workflow.
alter function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
rename to finance_criar_recebivel_p004_impl;
revoke all on function public.finance_criar_recebivel_p004_impl(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
from public, anon, authenticated;
create function public.finance_criar_recebivel(
  p_clinica_id uuid, p_descricao text, p_origem_tipo text, p_origem_id text,
  p_valor numeric, p_vencimento date default null, p_competencia date default null,
  p_cliente_id uuid default null, p_profissional_id uuid default null,
  p_procedimento_id uuid default null, p_agendamento_id uuid default null,
  p_pedido_id uuid default null, p_cliente_pacote_id uuid default null,
  p_categoria_codigo text default 'REC_SERVICOS', p_centro_custo_codigo text default 'CLINICA',
  p_provider text default null, p_provider_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.finance_recebiveis language plpgsql security definer set search_path = '' as $$
begin
  if p_cliente_pacote_id is not null then
    perform app_private.assert_finance_entitlement(p_clinica_id, 'finance_advanced');
  end if;
  return public.finance_criar_recebivel_p004_impl(
    p_clinica_id,p_descricao,p_origem_tipo,p_origem_id,p_valor,p_vencimento,
    p_competencia,p_cliente_id,p_profissional_id,p_procedimento_id,p_agendamento_id,
    p_pedido_id,p_cliente_pacote_id,p_categoria_codigo,p_centro_custo_codigo,
    p_provider,p_provider_reference,p_metadata
  );
end;
$$;
revoke all on function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
from public, anon;
grant execute on function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
to authenticated, service_role;

-- These canonical payment entrypoints are called only with service_role by
-- Agenda, gateways and workers. Keep their service-role grants unchanged.
revoke execute on function public.finance_cancelar_recebivel_origem(uuid,text,text,text) from authenticated;
revoke execute on function public.finance_registrar_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,text,text,timestamptz,text,jsonb) from authenticated;
revoke execute on function public.finance_definir_pagamento_agendamento_v2(uuid,uuid,numeric,numeric,text,timestamptz,text,jsonb) from authenticated;
revoke execute on function public.finance_cancelar_pagamento_agendamento_v2(uuid,uuid,text) from authenticated;

commit;
