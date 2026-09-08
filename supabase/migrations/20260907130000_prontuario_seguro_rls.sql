begin;

-- Fase 0A: separa a superfície cadastral da superfície clínica sem apagar
-- as colunas legadas. A sincronização bidirecional permite rollback operacional.
create table if not exists public.cliente_prontuarios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null,
  observacoes_clinicas text,
  anamnese jsonb not null default '{}'::jsonb,
  alergias text,
  contraindicacoes text,
  medicamentos_uso text,
  procedimentos_previos text,
  retorno_recomendado_em date,
  termo_consentimento_aceito boolean not null default false,
  termo_consentimento_aceito_em timestamptz,
  termo_consentimento_observacao text,
  termo_consentimento_versao text,
  termo_consentimento_registrado_por uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, cliente_id),
  constraint cliente_prontuarios_cliente_tenant_fk
    foreign key (clinica_id, cliente_id)
    references public.clientes(clinica_id, id)
    on delete cascade
);

create index if not exists cliente_prontuarios_clinica_idx
  on public.cliente_prontuarios(clinica_id, updated_at desc);

drop trigger if exists set_updated_at_cliente_prontuarios on public.cliente_prontuarios;
create trigger set_updated_at_cliente_prontuarios
before update on public.cliente_prontuarios
for each row execute function app_private.set_updated_at();

create or replace function app_private.usuario_prontuario_clinica(p_clinica_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or exists (
      select 1
      from public.usuarios_clinica uc
      where uc.clinica_id = p_clinica_id
        and uc.ativo = true
        and (
          uc.user_id = auth.uid()
          or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        and (
          uc.papel = 'owner'
          or (
            uc.papel = 'admin'
            and case
              when jsonb_typeof(uc.permissoes -> 'secoes') = 'array'
                and jsonb_array_length(uc.permissoes -> 'secoes') > 0
                then (uc.permissoes -> 'secoes') ? 'prontuario'
              else true
            end
          )
          or (
            uc.papel = 'profissional'
            and jsonb_typeof(uc.permissoes -> 'secoes') = 'array'
            and (uc.permissoes -> 'secoes') ? 'prontuario'
          )
        )
    );
$$;

revoke all on function app_private.usuario_prontuario_clinica(uuid) from public, anon;
grant execute on function app_private.usuario_prontuario_clinica(uuid) to authenticated, service_role;

insert into public.cliente_prontuarios (
  clinica_id,
  cliente_id,
  observacoes_clinicas,
  anamnese,
  alergias,
  contraindicacoes,
  medicamentos_uso,
  procedimentos_previos,
  retorno_recomendado_em,
  termo_consentimento_aceito,
  termo_consentimento_aceito_em,
  termo_consentimento_observacao,
  termo_consentimento_versao,
  termo_consentimento_registrado_por,
  created_at,
  updated_at
)
select
  clinica_id,
  id,
  observacoes_clinicas,
  coalesce(anamnese, '{}'::jsonb),
  alergias,
  contraindicacoes,
  medicamentos_uso,
  procedimentos_previos,
  retorno_recomendado_em,
  termo_consentimento_aceito,
  termo_consentimento_aceito_em,
  termo_consentimento_observacao,
  termo_consentimento_versao,
  termo_consentimento_registrado_por,
  created_at,
  updated_at
from public.clientes
on conflict (clinica_id, cliente_id) do nothing;

create or replace function app_private.sync_cliente_legacy_to_prontuario()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  insert into public.cliente_prontuarios (
    clinica_id, cliente_id, observacoes_clinicas, anamnese, alergias,
    contraindicacoes, medicamentos_uso, procedimentos_previos,
    retorno_recomendado_em, termo_consentimento_aceito,
    termo_consentimento_aceito_em, termo_consentimento_observacao,
    termo_consentimento_versao, termo_consentimento_registrado_por
  ) values (
    new.clinica_id, new.id, new.observacoes_clinicas, coalesce(new.anamnese, '{}'::jsonb), new.alergias,
    new.contraindicacoes, new.medicamentos_uso, new.procedimentos_previos,
    new.retorno_recomendado_em, new.termo_consentimento_aceito,
    new.termo_consentimento_aceito_em, new.termo_consentimento_observacao,
    new.termo_consentimento_versao, new.termo_consentimento_registrado_por
  )
  on conflict (clinica_id, cliente_id) do update set
    observacoes_clinicas = excluded.observacoes_clinicas,
    anamnese = excluded.anamnese,
    alergias = excluded.alergias,
    contraindicacoes = excluded.contraindicacoes,
    medicamentos_uso = excluded.medicamentos_uso,
    procedimentos_previos = excluded.procedimentos_previos,
    retorno_recomendado_em = excluded.retorno_recomendado_em,
    termo_consentimento_aceito = excluded.termo_consentimento_aceito,
    termo_consentimento_aceito_em = excluded.termo_consentimento_aceito_em,
    termo_consentimento_observacao = excluded.termo_consentimento_observacao,
    termo_consentimento_versao = excluded.termo_consentimento_versao,
    termo_consentimento_registrado_por = excluded.termo_consentimento_registrado_por;

  return new;
end;
$$;

create or replace function app_private.sync_prontuario_to_cliente_legacy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.clientes set
    observacoes_clinicas = new.observacoes_clinicas,
    anamnese = new.anamnese,
    alergias = new.alergias,
    contraindicacoes = new.contraindicacoes,
    medicamentos_uso = new.medicamentos_uso,
    procedimentos_previos = new.procedimentos_previos,
    retorno_recomendado_em = new.retorno_recomendado_em,
    termo_consentimento_aceito = new.termo_consentimento_aceito,
    termo_consentimento_aceito_em = new.termo_consentimento_aceito_em,
    termo_consentimento_observacao = new.termo_consentimento_observacao,
    termo_consentimento_versao = new.termo_consentimento_versao,
    termo_consentimento_registrado_por = new.termo_consentimento_registrado_por
  where clinica_id = new.clinica_id and id = new.cliente_id;

  return new;
end;
$$;

revoke all on function app_private.sync_cliente_legacy_to_prontuario() from public, anon, authenticated;
revoke all on function app_private.sync_prontuario_to_cliente_legacy() from public, anon, authenticated;

drop trigger if exists sync_cliente_legacy_to_prontuario on public.clientes;
create trigger sync_cliente_legacy_to_prontuario
after insert or update of observacoes_clinicas, anamnese, alergias,
  contraindicacoes, medicamentos_uso, procedimentos_previos,
  retorno_recomendado_em, termo_consentimento_aceito,
  termo_consentimento_aceito_em, termo_consentimento_observacao,
  termo_consentimento_versao, termo_consentimento_registrado_por
on public.clientes
for each row execute function app_private.sync_cliente_legacy_to_prontuario();

drop trigger if exists sync_prontuario_to_cliente_legacy on public.cliente_prontuarios;
create trigger sync_prontuario_to_cliente_legacy
after insert or update on public.cliente_prontuarios
for each row execute function app_private.sync_prontuario_to_cliente_legacy();

alter table public.cliente_prontuarios enable row level security;

drop policy if exists cliente_prontuarios_select_clinico on public.cliente_prontuarios;
create policy cliente_prontuarios_select_clinico on public.cliente_prontuarios
for select to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id));

drop policy if exists cliente_prontuarios_insert_clinico on public.cliente_prontuarios;
create policy cliente_prontuarios_insert_clinico on public.cliente_prontuarios
for insert to authenticated
with check (
  app_private.usuario_prontuario_clinica(clinica_id)
  and exists (
    select 1 from public.clientes c
    where c.clinica_id = cliente_prontuarios.clinica_id
      and c.id = cliente_prontuarios.cliente_id
  )
);

drop policy if exists cliente_prontuarios_update_clinico on public.cliente_prontuarios;
create policy cliente_prontuarios_update_clinico on public.cliente_prontuarios
for update to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id))
with check (app_private.usuario_prontuario_clinica(clinica_id));

drop policy if exists cliente_prontuarios_delete_admin on public.cliente_prontuarios;
create policy cliente_prontuarios_delete_admin on public.cliente_prontuarios
for delete to authenticated
using (
  app_private.usuario_admin_clinica(clinica_id)
  and app_private.usuario_prontuario_clinica(clinica_id)
);

revoke all on public.cliente_prontuarios from public, anon, authenticated;
grant select, insert, update on public.cliente_prontuarios to authenticated;
grant all on public.cliente_prontuarios to service_role;

-- A tabela cadastral continua disponível para agenda, CRM e financeiro, mas
-- sessões autenticadas deixam de possuir privilégio SQL sobre colunas clínicas.
revoke select, insert, update, delete on public.clientes from authenticated;
grant select (
  id, clinica_id, nome, telefone, email, cpf, data_nascimento, endereco,
  origem, status, observacoes, consentimento_lgpd, data_consentimento_lgpd,
  created_at, updated_at, telefone_whatsapp
) on public.clientes to authenticated;
grant insert (
  clinica_id, nome, telefone, email, cpf, data_nascimento, endereco,
  origem, status, observacoes, consentimento_lgpd, data_consentimento_lgpd
) on public.clientes to authenticated;
grant update (
  nome, telefone, email, cpf, data_nascimento, endereco, origem, status,
  observacoes, consentimento_lgpd, data_consentimento_lgpd, updated_at
) on public.clientes to authenticated;
grant delete on public.clientes to authenticated;

drop policy if exists "clientes_crud_membros" on public.clientes;
drop policy if exists clientes_select_cadastro on public.clientes;
create policy clientes_select_cadastro on public.clientes
for select to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'));

drop policy if exists clientes_insert_cadastro on public.clientes;
create policy clientes_insert_cadastro on public.clientes
for insert to authenticated
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'));

drop policy if exists clientes_update_cadastro on public.clientes;
create policy clientes_update_cadastro on public.clientes
for update to authenticated
using (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'))
with check (app_private.usuario_pode_secao_clinica(clinica_id, 'clientes'));

drop policy if exists clientes_delete_admin on public.clientes;
create policy clientes_delete_admin on public.clientes
for delete to authenticated
using (
  app_private.usuario_admin_clinica(clinica_id)
  and app_private.usuario_pode_secao_clinica(clinica_id, 'clientes')
  and app_private.usuario_prontuario_clinica(clinica_id)
);

-- Fotos e consentimentos passam a usar a mesma decisão de capability clínica.
drop policy if exists "cliente_fotos_prontuario" on public.cliente_fotos;
create policy "cliente_fotos_prontuario" on public.cliente_fotos
for all to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id))
with check (app_private.usuario_prontuario_clinica(clinica_id));

drop policy if exists "cliente_consentimentos_prontuario" on public.cliente_consentimentos;
create policy "cliente_consentimentos_prontuario" on public.cliente_consentimentos
for all to authenticated
using (app_private.usuario_prontuario_clinica(clinica_id))
with check (app_private.usuario_prontuario_clinica(clinica_id));

notify pgrst, 'reload schema';

commit;
