begin;

alter table public.crm_oportunidades
  add column if not exists telefone_normalizado text,
  add column if not exists email_normalizado text;

create or replace function app_private.crm_normalize_phone(p_value text)
returns text language sql immutable parallel safe set search_path=public as $$
  select case
    when length(regexp_replace(coalesce(p_value,''),'\D','','g')) between 10 and 11
      then '55'||regexp_replace(coalesce(p_value,''),'\D','','g')
    else nullif(regexp_replace(coalesce(p_value,''),'\D','','g'),'')
  end
$$;

create or replace function app_private.crm_validate_opportunity_tenant()
returns trigger language plpgsql set search_path=public,app_private as $$
begin
  new.telefone_normalizado:=app_private.crm_normalize_phone(new.telefone);
  new.email_normalizado:=nullif(lower(trim(coalesce(new.email,''))),'');

  if new.cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id=new.cliente_id and c.clinica_id=new.clinica_id
  ) then raise exception 'Contato não pertence à clínica.' using errcode='23503'; end if;

  if new.procedimento_id is not null and not exists (
    select 1 from public.procedimentos p where p.id=new.procedimento_id and p.clinica_id=new.clinica_id
  ) then raise exception 'Procedimento não pertence à clínica.' using errcode='23503'; end if;

  if new.responsavel_id is not null and not exists (
    select 1 from public.usuarios_clinica u
    where u.user_id=new.responsavel_id and u.clinica_id=new.clinica_id and u.ativo=true
  ) then raise exception 'Responsável não pertence à clínica ou está inativo.' using errcode='23503'; end if;

  return new;
end $$;

drop trigger if exists crm_validate_opportunity_tenant on public.crm_oportunidades;
create trigger crm_validate_opportunity_tenant
before insert or update of clinica_id,cliente_id,procedimento_id,responsavel_id,telefone,email
on public.crm_oportunidades for each row execute function app_private.crm_validate_opportunity_tenant();

create or replace function app_private.crm_validate_activity_tenant()
returns trigger language plpgsql set search_path=public,app_private as $$
begin
  if not exists (
    select 1 from public.crm_oportunidades o
    where o.id=new.opportunity_id and o.clinica_id=new.clinica_id
  ) then raise exception 'Oportunidade não pertence à clínica.' using errcode='23503'; end if;

  if new.cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id=new.cliente_id and c.clinica_id=new.clinica_id
  ) then raise exception 'Contato não pertence à clínica.' using errcode='23503'; end if;

  if new.owner_id is not null and not exists (
    select 1 from public.usuarios_clinica u
    where u.user_id=new.owner_id and u.clinica_id=new.clinica_id and u.ativo=true
  ) then raise exception 'Responsável da atividade não pertence à clínica.' using errcode='23503'; end if;

  return new;
end $$;

drop trigger if exists crm_validate_activity_tenant on public.crm_activities;
create trigger crm_validate_activity_tenant
before insert or update of clinica_id,opportunity_id,cliente_id,owner_id
on public.crm_activities for each row execute function app_private.crm_validate_activity_tenant();

update public.crm_oportunidades
set telefone_normalizado=app_private.crm_normalize_phone(telefone),
    email_normalizado=nullif(lower(trim(coalesce(email,''))),'')
where telefone_normalizado is distinct from app_private.crm_normalize_phone(telefone)
   or email_normalizado is distinct from nullif(lower(trim(coalesce(email,''))),'');

create index if not exists crm_opportunities_phone_idx
  on public.crm_oportunidades(clinica_id,telefone_normalizado) where telefone_normalizado is not null;
create index if not exists crm_opportunities_email_idx
  on public.crm_oportunidades(clinica_id,email_normalizado) where email_normalizado is not null;
create index if not exists crm_opportunities_created_idx
  on public.crm_oportunidades(clinica_id,created_at desc);
create index if not exists crm_opportunities_won_idx
  on public.crm_oportunidades(clinica_id,won_at desc) where won_at is not null;
create index if not exists crm_opportunities_lost_idx
  on public.crm_oportunidades(clinica_id,lost_at desc) where lost_at is not null;

create or replace view public.crm_possible_duplicates with (security_invoker=true) as
select clinica_id,
       coalesce(telefone_normalizado,email_normalizado) as chave_normalizada,
       case when telefone_normalizado is not null then 'telefone' else 'email' end as tipo,
       count(*) as quantidade,
       array_agg(id order by created_at) as oportunidade_ids
from public.crm_oportunidades
where telefone_normalizado is not null or email_normalizado is not null
group by clinica_id,coalesce(telefone_normalizado,email_normalizado),case when telefone_normalizado is not null then 'telefone' else 'email' end
having count(*)>1;

grant select on public.crm_possible_duplicates to authenticated,service_role;

-- Snapshots antigos não possuem os campos obrigatórios do CRM 2.0. Somente a
-- conta demo é invalidada para ser recapturada pelo seed atualizado.
delete from public.clinica_demo_snapshots s
using public.clinicas c
where s.clinica_id=c.id and c.slug='demo-nexawi-clinicas';

commit;
