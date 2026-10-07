-- Run only on staging after the generic P0-04 migration, or on a disposable local database.
-- Never run against production. Every fixture is rolled back.
begin;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
('99999999-9999-4999-8999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p004-owner@example.invalid','');

insert into public.clinicas (id,nome,slug,plano,plan_entitlements_mode,plan_entitlements_version) values
('11111111-1111-4111-8111-111111111101','P004 Starter','p004-starter-test','starter','catalog_v1',1),
('11111111-1111-4111-8111-111111111102','P004 Growth','p004-growth-test','growth','catalog_v1',1),
('11111111-1111-4111-8111-111111111103','P004 Premium','p004-premium-test','premium','catalog_v1',1),
('11111111-1111-4111-8111-111111111104','P004 Lifetime','p004-lifetime-test','starter','unlimited_lifetime',1),
('11111111-1111-4111-8111-111111111105','P004 Demo','p004-demo-test','starter','internal_full_access',1),
('11111111-1111-4111-8111-111111111106','P004 Legacy Plan','p004-legacy-plan-test','Ilimitado','catalog_v1',1),
('11111111-1111-4111-8111-111111111107','P004 Other Tenant','p004-other-test','premium','catalog_v1',1),
('11111111-1111-4111-8111-111111111108','P004 Missing Mode','p004-missing-mode-test','growth',null,1),
('11111111-1111-4111-8111-111111111109','P004 Missing Version','p004-missing-version-test','growth','catalog_v1',null);

do $$
declare v_mode_rejected boolean := false; v_version_rejected boolean := false;
begin
  begin
    insert into public.clinicas (id,nome,slug,plano,plan_entitlements_mode,plan_entitlements_version)
    values ('11111111-1111-4111-8111-111111111110','P004 Bad Mode','p004-bad-mode-test','growth','invalid_mode',1);
  exception when check_violation then v_mode_rejected := true; end;
  begin
    insert into public.clinicas (id,nome,slug,plano,plan_entitlements_mode,plan_entitlements_version)
    values ('11111111-1111-4111-8111-111111111111','P004 Bad Version','p004-bad-version-test','growth','catalog_v1',2);
  exception when check_violation then v_version_rejected := true; end;
  if not v_mode_rejected or not v_version_rejected then
    raise exception 'Invalid entitlement mode or version was accepted';
  end if;
end;
$$;
insert into public.usuarios_clinica (clinica_id,email,papel,ativo) values
('11111111-1111-4111-8111-111111111101','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111102','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111103','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111104','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111105','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111106','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111107','p004-other@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111108','p004-owner@example.invalid','owner',true),
('11111111-1111-4111-8111-111111111109','p004-owner@example.invalid','owner',true);
insert into public.clinica_dominios(id,clinica_id,dominio) values
('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111101','p004-starter-existing.example.org'),
('22222222-2222-4222-8222-222222222207','11111111-1111-4111-8111-111111111107','p004-other-tenant.example.org');
insert into public.finance_conciliacoes(id,clinica_id,provider,provider_reference,status) values
('33333333-3333-4333-8333-333333333301','11111111-1111-4111-8111-111111111101','p004','starter','pendente');
insert into public.finance_pagaveis(clinica_id,descricao,origem_tipo,origem_id,valor_original) values
('11111111-1111-4111-8111-111111111101','P004 hidden payable','manual','p004-starter-hidden',10);
insert into public.finance_contas(id,clinica_id,nome,tipo) values
('66666666-6666-4666-8666-666666666601','11111111-1111-4111-8111-111111111101','P004 Caixa','caixa');
insert into public.finance_categorias(id,clinica_id,nome,codigo,tipo,grupo_dre) values
('44444444-4444-4444-8444-444444444401','11111111-1111-4111-8111-111111111101','P004 Receita','P004_RECEITA_STARTER','receita','receita_bruta'),
('44444444-4444-4444-8444-444444444402','11111111-1111-4111-8111-111111111102','P004 Despesa','P004_DESPESA','despesa','despesas_operacionais'),
('44444444-4444-4444-8444-444444444403','11111111-1111-4111-8111-111111111103','P004 Receita','P004_RECEITA','receita','receita_bruta');
insert into public.finance_competencias(id,clinica_id,categoria_id,origem_tipo,origem_id,descricao,tipo,competencia,valor) values
('55555555-5555-4555-8555-555555555501','11111111-1111-4111-8111-111111111101','44444444-4444-4444-8444-444444444401','p004','starter','P004 receita','receita',current_date,10),
('55555555-5555-4555-8555-555555555502','11111111-1111-4111-8111-111111111102','44444444-4444-4444-8444-444444444402','p004','growth','P004 despesa','despesa',date_trunc('month',current_date)::date,10),
('55555555-5555-4555-8555-555555555503','11111111-1111-4111-8111-111111111103','44444444-4444-4444-8444-444444444403','p004','premium','P004 receita','receita',current_date,10);
insert into public.finance_orcamentos(clinica_id,categoria_id,competencia,valor_planejado) values
('11111111-1111-4111-8111-111111111102','44444444-4444-4444-8444-444444444402',date_trunc('month',current_date)::date,20);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated","email":"p004-owner@example.invalid"}', true);

do $$
declare v_denied boolean; v_rows integer; v_summary jsonb; v_receivable public.finance_recebiveis;
begin
  if app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111101','custom_domain')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111101','finance_advanced')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111101','finance_dre') then
    raise exception 'Starter gained protected capability'; end if;
  v_denied := false;
  begin
    insert into public.clinica_dominios(clinica_id,dominio)
    values ('11111111-1111-4111-8111-111111111101','p004-starter-new.example.org');
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Starter inserted a domain'; end if;
  update public.clinica_dominios set observacoes='bypass'
  where id='22222222-2222-4222-8222-222222222201';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Starter updated a domain'; end if;
  update public.clinica_dominios set observacoes='cross-tenant'
  where id='22222222-2222-4222-8222-222222222207';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Tenant A updated tenant B domain'; end if;
  v_denied := false;
  begin
    perform public.finance_resumo_clinica(
      '11111111-1111-4111-8111-111111111107',current_date,current_date);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Tenant A read tenant B financial summary'; end if;
  delete from public.clinica_dominios where id='22222222-2222-4222-8222-222222222201';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Starter admin could not remove stale domain'; end if;
  select count(*) into v_rows from public.finance_pagaveis
  where origem_id='p004-starter-hidden';
  if v_rows <> 0 then raise exception 'Starter read advanced payables'; end if;
  select count(*) into v_rows from public.finance_conciliacoes
  where id='33333333-3333-4333-8333-333333333301';
  if v_rows <> 0 then raise exception 'Starter read reconciliation source'; end if;
  select count(*) into v_rows from public.finance_contas
  where id='66666666-6666-4666-8666-666666666601';
  if v_rows <> 1 then raise exception 'Starter could not read receipt account'; end if;
  v_denied := false;
  begin
    perform public.finance_criar_pagavel(
      '11111111-1111-4111-8111-111111111101','P004','manual','p004-payable',10,
      current_date,'44444444-4444-4444-8444-444444444401');
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Starter called advanced payable RPC'; end if;
  v_denied := false;
  begin
    perform public.finance_conciliar_liquidacao('33333333-3333-4333-8333-333333333301');
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Starter called P0-03 reconciliation RPC'; end if;
  select count(*) into v_rows from public.finance_competencias
  where clinica_id='11111111-1111-4111-8111-111111111101';
  if v_rows <> 0 then raise exception 'Starter read DRE facts'; end if;
  v_summary := public.finance_resumo_clinica(
    '11111111-1111-4111-8111-111111111101',current_date,current_date);
  if not (v_summary ? 'receber') or v_summary ? 'pagar' or v_summary ? 'caixa'
    or v_summary ? 'comissoes' or v_summary ? 'conciliacao' or v_summary ? 'dre' then
    raise exception 'Starter summary leaked advanced fields'; end if;
  select count(*) into v_rows from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname ilike '%dre%'
    and has_function_privilege('authenticated',p.oid,'EXECUTE');
  if v_rows <> 0 then raise exception 'Authenticated DRE RPC exists'; end if;
  select * into v_receivable from public.finance_criar_recebivel_parcelado(
    '11111111-1111-4111-8111-111111111101','P004 basic','manual','p004-basic',10,current_date,1
  );
  if v_receivable.id is null then raise exception 'Starter basic receivable failed'; end if;
  select count(*) into v_rows from public.finance_recebiveis where id=v_receivable.id;
  if v_rows <> 1 then raise exception 'Starter could not read basic receivable'; end if;
  v_denied := false;
  begin
    update public.finance_recebiveis
    set cliente_pacote_id = '77777777-7777-4777-8777-777777777701'
    where id = v_receivable.id;
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Starter linked basic receivable to package'; end if;
  perform public.finance_liquidar_recebivel(
    p_clinica_id => '11111111-1111-4111-8111-111111111101',
    p_recebivel_id => v_receivable.id, p_valor => 10,
    p_conta_id => '66666666-6666-4666-8666-666666666601', p_forma_pagamento => 'pix',
    p_idempotency_key => 'p004-basic-settlement');
  select count(*) into v_rows from public.finance_recebiveis
  where id=v_receivable.id and status='pago' and valor_recebido=10;
  if v_rows <> 1 then raise exception 'Starter basic settlement failed'; end if;
  if not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111102','custom_domain')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111102','finance_advanced')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111102','finance_dre') then
    raise exception 'Growth entitlement matrix failed'; end if;
  insert into public.clinica_dominios(clinica_id,dominio)
  values ('11111111-1111-4111-8111-111111111102','p004-growth.example.org');
  update public.clinica_dominios set observacoes='growth-update'
  where clinica_id='11111111-1111-4111-8111-111111111102' and dominio='p004-growth.example.org';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Growth could not update own domain'; end if;
  insert into public.finance_pagaveis(clinica_id,descricao,origem_tipo,origem_id,valor_original)
  values ('11111111-1111-4111-8111-111111111102','P004','manual','p004-growth',10);
  select count(*) into v_rows from public.finance_orcamentos
  where clinica_id='11111111-1111-4111-8111-111111111102'
    and competencia=date_trunc('month',current_date)::date;
  if v_rows <> 1 then raise exception 'Growth could not read its budget'; end if;
  select count(*) into v_rows from public.finance_competencias
  where clinica_id='11111111-1111-4111-8111-111111111102';
  if v_rows <> 0 then raise exception 'Growth read DRE facts'; end if;
  v_summary := public.finance_resumo_clinica(
    '11111111-1111-4111-8111-111111111102',current_date,current_date);
  if not (v_summary ? 'receber') or not (v_summary ? 'pagar') or not (v_summary ? 'caixa') then
    raise exception 'Growth summary lost advanced fields'; end if;
  if not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111103','custom_domain')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111103','finance_advanced')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111103','finance_dre') then
    raise exception 'Premium entitlement matrix failed'; end if;
  insert into public.clinica_dominios(clinica_id,dominio)
  values ('11111111-1111-4111-8111-111111111103','p004-premium.example.org');
  update public.clinica_dominios set observacoes='premium-update'
  where clinica_id='11111111-1111-4111-8111-111111111103' and dominio='p004-premium.example.org';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Premium could not update own domain'; end if;
  select count(*) into v_rows from public.finance_competencias
  where clinica_id='11111111-1111-4111-8111-111111111103';
  if v_rows <> 1 then raise exception 'Premium DRE denied'; end if;
  v_summary := public.finance_resumo_clinica(
    '11111111-1111-4111-8111-111111111103',current_date,current_date);
  if not (v_summary ? 'pagar') or not (v_summary ? 'caixa') then
    raise exception 'Premium summary lost advanced fields'; end if;
  if not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111104','custom_domain')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111104','finance_advanced')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111104','finance_dre')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111105','custom_domain')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111105','finance_advanced')
    or not app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111105','finance_dre') then
    raise exception 'Special full access missing'; end if;
  if app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111106','finance_advanced')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111108','finance_advanced')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111109','finance_dre')
    or app_private.clinic_has_entitlement('11111111-1111-4111-8111-111111111107','finance_dre') then
    raise exception 'Legacy plan, invalid state or foreign tenant granted access'; end if;
end;
$$;

set local role service_role;
do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.finance_competencias
  where clinica_id='11111111-1111-4111-8111-111111111102'
    and competencia=date_trunc('month',current_date)::date and estornada=false;
  if v_rows <> 1 then raise exception 'Growth budget comparison lost its internal fact source'; end if;
end;
$$;

rollback;
