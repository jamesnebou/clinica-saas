begin;

create or replace function app_private.usuario_owner_clinica(p_clinica_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_clinica uc
    where uc.clinica_id = p_clinica_id
      and uc.ativo = true
      and uc.papel = 'owner'
      and uc.user_id = auth.uid()
  );
$$;

revoke all on function app_private.usuario_owner_clinica(uuid) from public, anon;
grant execute on function app_private.usuario_owner_clinica(uuid) to authenticated;

create or replace function app_private.usuario_pode_secao_clinica(
  p_clinica_id uuid,
  p_secao text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or exists (
      select 1
      from public.usuarios_clinica uc
      where uc.clinica_id = p_clinica_id
        and uc.ativo = true
        and (uc.user_id = auth.uid() or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
        and (
          uc.papel = 'owner'
          or case
            when jsonb_typeof(uc.permissoes -> 'secoes') = 'array'
              and jsonb_array_length(uc.permissoes -> 'secoes') > 0
              then (uc.permissoes -> 'secoes') ? p_secao
            when uc.papel = 'admin' then p_secao = any(array[
              'dashboard','agenda','notificacoes','clientes','crm','profissionais','procedimentos','produtos','pedidos','usuarios','configuracoes','financeiro','assinatura','tutoriais','bi','marketing','automacoes','integracoes','whatsapp'
            ])
            when uc.papel = 'recepcao' then p_secao = any(array[
              'dashboard','agenda','notificacoes','clientes','crm','profissionais','procedimentos','produtos','pedidos','tutoriais'
            ])
            when uc.papel = 'financeiro' then p_secao = any(array[
              'dashboard','notificacoes','clientes','crm','pedidos','financeiro','assinatura','tutoriais'
            ])
            when uc.papel = 'profissional' then p_secao = any(array[
              'dashboard','agenda','notificacoes','clientes','crm','procedimentos','produtos','tutoriais'
            ])
            else false
          end
        )
    );
$$;

revoke all on function app_private.usuario_pode_secao_clinica(uuid,text) from public, anon;
grant execute on function app_private.usuario_pode_secao_clinica(uuid,text) to authenticated, service_role;

drop policy if exists "usuarios_select_membros" on public.usuarios_clinica;
create policy "usuarios_select_membros" on public.usuarios_clinica
for select to authenticated
using (
  user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or app_private.usuario_pode_secao_clinica(clinica_id, 'usuarios')
);

drop policy if exists "clientes_crud_membros" on public.clientes;
create policy "clientes_crud_membros" on public.clientes
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'));

drop policy if exists "profissionais_crud_membros" on public.profissionais;
create policy "profissionais_crud_membros" on public.profissionais
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'profissionais'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'profissionais'));

drop policy if exists "procedimentos_crud_membros" on public.procedimentos;
create policy "procedimentos_crud_membros" on public.procedimentos
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'procedimentos'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'procedimentos'));

drop policy if exists "agendamentos_crud_membros" on public.agendamentos;
create policy "agendamentos_crud_membros" on public.agendamentos
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'agenda'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'agenda'));

drop policy if exists "pagamentos_clinica_crud_membros" on public.pagamentos_clinica;
drop policy if exists "pagamentos_clinica_crud_financeiro" on public.pagamentos_clinica;
create policy "pagamentos_clinica_crud_financeiro" on public.pagamentos_clinica
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'));

drop policy if exists "pacotes_clinica_crud_membros" on public.pacotes_clinica;
drop policy if exists "pacotes_clinica_crud_financeiro" on public.pacotes_clinica;
create policy "pacotes_clinica_crud_financeiro" on public.pacotes_clinica
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'));

drop policy if exists "cliente_pacotes_crud_membros" on public.cliente_pacotes;
drop policy if exists "cliente_pacotes_crud_financeiro" on public.cliente_pacotes;
create policy "cliente_pacotes_crud_financeiro" on public.cliente_pacotes
for all to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'financeiro'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agendamentos_intervalo_valido_check'
      and conrelid = 'public.agendamentos'::regclass
  ) then
    alter table public.agendamentos
      add constraint agendamentos_intervalo_valido_check
      check (fim > inicio)
      not valid;
  end if;
end;
$$;

create or replace function app_private.prevent_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profissional_id is null
    or new.status not in ('agendado', 'confirmado', 'em_atendimento') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.clinica_id::text || ':' || new.profissional_id::text, 0)
  );

  if exists (
    select 1
    from public.agendamentos a
    where a.clinica_id = new.clinica_id
      and a.profissional_id = new.profissional_id
      and a.id <> new.id
      and a.status in ('agendado', 'confirmado', 'em_atendimento')
      and a.inicio < new.fim
      and a.fim > new.inicio
  ) then
    raise exception 'O profissional já possui atendimento nesse horário.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_appointment_overlap() from public, anon, authenticated;
drop trigger if exists prevent_appointment_overlap on public.agendamentos;
create trigger prevent_appointment_overlap
before insert or update of clinica_id, profissional_id, inicio, fim, status
on public.agendamentos
for each row execute function app_private.prevent_appointment_overlap();

drop policy if exists "usuarios_insert_admin" on public.usuarios_clinica;
create policy "usuarios_insert_admin" on public.usuarios_clinica
for insert to authenticated
with check (
  case when papel = 'owner'
    then app_private.usuario_owner_clinica(clinica_id)
    else app_private.usuario_admin_clinica(clinica_id)
  end
);

drop policy if exists "usuarios_update_admin" on public.usuarios_clinica;
create policy "usuarios_update_admin" on public.usuarios_clinica
for update to authenticated
using (
  case when papel = 'owner'
    then app_private.usuario_owner_clinica(clinica_id)
    else app_private.usuario_admin_clinica(clinica_id)
  end
)
with check (
  case when papel = 'owner'
    then app_private.usuario_owner_clinica(clinica_id)
    else app_private.usuario_admin_clinica(clinica_id)
  end
);

drop policy if exists "usuarios_delete_admin" on public.usuarios_clinica;
create policy "usuarios_delete_admin" on public.usuarios_clinica
for delete to authenticated
using (
  case when papel = 'owner'
    then app_private.usuario_owner_clinica(clinica_id)
    else app_private.usuario_admin_clinica(clinica_id)
  end
);

create or replace function app_private.crm_require_access(p_clinica_id uuid)
returns void
language plpgsql
security definer
stable
set search_path = public, app_private
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return;
  end if;
  if auth.uid() is null or not app_private.usuario_pode_secao_clinica(p_clinica_id, 'crm') then
    raise exception 'Acesso ao CRM negado.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.crm_require_access(uuid) from public, anon;
revoke all on function app_private.crm_emit_event(uuid,uuid,text,jsonb,text) from public, anon, authenticated;

revoke all on function public.crm_ensure_default_pipeline(uuid) from public, anon;
revoke all on function public.crm_create_opportunity(uuid,uuid,text,text,text,text,text,numeric,uuid,uuid,uuid,uuid,text,integer,text,jsonb,text) from public, anon;
revoke all on function public.crm_move_opportunity(uuid,uuid,uuid,uuid,uuid,uuid,numeric) from public, anon;
revoke all on function public.crm_save_opportunity(uuid,uuid,text,numeric,uuid,text,integer,text,uuid) from public, anon;
revoke all on function public.crm_create_activity(uuid,uuid,text,text,text,timestamptz,uuid) from public, anon;
revoke all on function public.crm_complete_activity(uuid,uuid) from public, anon;
revoke all on function public.crm_reorder_stages(uuid,uuid,uuid[]) from public, anon;
revoke all on function public.crm_pipeline_metrics(uuid,uuid) from public, anon;
revoke all on function public.crm_create_pipeline(uuid,text,boolean) from public, anon;
revoke all on function public.crm_set_default_pipeline(uuid,uuid) from public, anon;

revoke all on function public.claim_domain_outbox_events_for_consumer(text,text,integer) from public, anon, authenticated;
revoke all on function public.claim_automation_waits(text,integer) from public, anon, authenticated;
revoke all on function public.claim_automation_runs(text,integer) from public, anon, authenticated;
revoke all on function public.enqueue_due_finance_automation_events(integer) from public, anon, authenticated;

-- Emissão é interna a triggers/workers. Com EXECUTE implícito, um membro
-- autenticado poderia fabricar eventos para qualquer clínica.
revoke all on function app_private.emit_automation_event(uuid,text,text,uuid,jsonb,text,timestamptz) from public, anon, authenticated;

revoke all on function app_private.automation_has_access(uuid,boolean) from public, anon;
grant execute on function app_private.automation_has_access(uuid,boolean) to authenticated, service_role;
revoke all on function public.publish_automation_v2(uuid,uuid,jsonb,text,text,uuid) from public, anon;
revoke all on function public.cancel_automation_run(uuid,uuid) from public, anon;
revoke all on function public.get_automation_worker_health() from public, anon;

-- As RPCs financeiras validam tenant e papel internamente, mas não devem
-- conservar EXECUTE implícito para PUBLIC/anon.
revoke all on function app_private.finance_usuario_pode_gerir(uuid) from public, anon;
revoke all on function app_private.finance_usuario_configura(uuid) from public, anon;
revoke all on function public.finance_criar_recebivel(uuid,text,text,text,numeric,date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb) from public, anon;
revoke all on function public.finance_liquidar_recebivel(uuid,uuid,numeric,uuid,text,timestamptz,numeric,text,text,text,jsonb) from public, anon;
revoke all on function public.finance_transferir(uuid,uuid,uuid,numeric,timestamptz,text,text) from public, anon;
revoke all on function public.finance_resumo_clinica(uuid,date,date) from public, anon;
revoke all on function public.finance_liquidar_pagavel(uuid,uuid,numeric,uuid,text,timestamptz,text,jsonb) from public, anon;
revoke all on function public.finance_estornar_liquidacao(uuid,uuid,text,text) from public, anon;
revoke all on function public.finance_gerar_recorrencias(date) from public, anon, authenticated;
revoke all on function public.finance_criar_recebivel_parcelado(uuid,text,text,text,numeric,date,integer,text,uuid,jsonb) from public, anon;
revoke all on function public.finance_criar_pagavel(uuid,text,text,text,numeric,date,uuid,uuid,uuid,date,integer,jsonb) from public, anon;
revoke all on function public.finance_cancelar_recebivel_origem(uuid,text,text,text) from public, anon;
revoke all on function public.finance_reconhecer_sessao_pacote(uuid,uuid,integer,date) from public, anon;
revoke all on function public.finance_pagar_comissoes(uuid,uuid[],uuid,text,timestamptz,text) from public, anon;

grant execute on function public.claim_domain_outbox_events_for_consumer(text,text,integer) to service_role;
grant execute on function public.claim_automation_waits(text,integer) to service_role;
grant execute on function public.claim_automation_runs(text,integer) to service_role;
grant execute on function public.enqueue_due_finance_automation_events(integer) to service_role;
grant execute on function public.finance_gerar_recorrencias(date) to service_role;

-- A coluna clinica_id dos registros clínicos deve corresponder à clínica do
-- paciente relacionado. NOT VALID preserva dados legados para auditoria, mas
-- já bloqueia qualquer nova associação cross-tenant.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cliente_fotos_clinica_cliente_fk'
      and conrelid = 'public.cliente_fotos'::regclass
  ) then
    alter table public.cliente_fotos
      add constraint cliente_fotos_clinica_cliente_fk
      foreign key (clinica_id, cliente_id)
      references public.clientes(clinica_id, id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cliente_consentimentos_clinica_cliente_fk'
      and conrelid = 'public.cliente_consentimentos'::regclass
  ) then
    alter table public.cliente_consentimentos
      add constraint cliente_consentimentos_clinica_cliente_fk
      foreign key (clinica_id, cliente_id)
      references public.clientes(clinica_id, id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pagamentos_clinica_cliente_tenant_fk'
      and conrelid = 'public.pagamentos_clinica'::regclass
  ) then
    alter table public.pagamentos_clinica
      add constraint pagamentos_clinica_cliente_tenant_fk
      foreign key (clinica_id, cliente_id)
      references public.clientes(clinica_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pagamentos_clinica_agendamento_tenant_fk'
      and conrelid = 'public.pagamentos_clinica'::regclass
  ) then
    alter table public.pagamentos_clinica
      add constraint pagamentos_clinica_agendamento_tenant_fk
      foreign key (clinica_id, agendamento_id)
      references public.agendamentos(clinica_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pagamentos_clinica_profissional_tenant_fk'
      and conrelid = 'public.pagamentos_clinica'::regclass
  ) then
    alter table public.pagamentos_clinica
      add constraint pagamentos_clinica_profissional_tenant_fk
      foreign key (clinica_id, profissional_id)
      references public.profissionais(clinica_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pacotes_clinica_procedimento_tenant_fk'
      and conrelid = 'public.pacotes_clinica'::regclass
  ) then
    alter table public.pacotes_clinica
      add constraint pacotes_clinica_procedimento_tenant_fk
      foreign key (clinica_id, procedimento_id)
      references public.procedimentos(clinica_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cliente_pacotes_cliente_tenant_fk'
      and conrelid = 'public.cliente_pacotes'::regclass
  ) then
    alter table public.cliente_pacotes
      add constraint cliente_pacotes_cliente_tenant_fk
      foreign key (clinica_id, cliente_id)
      references public.clientes(clinica_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cliente_pacotes_pacote_tenant_fk'
      and conrelid = 'public.cliente_pacotes'::regclass
  ) then
    alter table public.cliente_pacotes
      add constraint cliente_pacotes_pacote_tenant_fk
      foreign key (clinica_id, pacote_id)
      references public.pacotes_clinica(clinica_id, id)
      not valid;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
