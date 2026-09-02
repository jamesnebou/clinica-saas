begin;

create or replace function public.admin_delete_clinic_v1(
  p_clinica_id uuid,
  p_expected_name text,
  p_execute boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_clinic public.clinicas%rowtype;
begin
  if p_clinica_id is null then
    raise exception using errcode = '22004', message = 'CLINIC_ID_REQUIRED';
  end if;

  select *
    into v_clinic
    from public.clinicas
   where id = p_clinica_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CLINIC_NOT_FOUND';
  end if;

  if nullif(btrim(p_expected_name), '') is null
     or lower(btrim(p_expected_name)) <> lower(btrim(v_clinic.nome)) then
    raise exception using errcode = '22023', message = 'CLINIC_CONFIRMATION_MISMATCH';
  end if;

  if v_clinic.slug = 'demo-nexawi-clinicas'
     or exists (
       select 1
         from app_private.demo_environments
        where clinic_id = p_clinica_id
     ) then
    raise exception using errcode = '42501', message = 'DEMO_CLINIC_PROTECTED';
  end if;

  if not p_execute then
    return jsonb_build_object('ready', true, 'deleted', false);
  end if;

  delete from public.clinicas where id = p_clinica_id;

  return jsonb_build_object('ready', true, 'deleted', true, 'id', p_clinica_id);
end;
$$;

revoke all on function public.admin_delete_clinic_v1(uuid, text, boolean) from public;
revoke all on function public.admin_delete_clinic_v1(uuid, text, boolean) from anon;
revoke all on function public.admin_delete_clinic_v1(uuid, text, boolean) from authenticated;
grant execute on function public.admin_delete_clinic_v1(uuid, text, boolean) to service_role;

comment on function public.admin_delete_clinic_v1(uuid, text, boolean) is
  'Validates and deletes one non-demo clinic. Restricted to service_role and called by an authenticated internal-admin server action.';

commit;
