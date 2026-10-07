-- Production-only classification. Apply after the generic P0-04 migration.
begin;

do $$
declare v_found integer;
begin
  select count(*) into v_found
  from (
    select id from public.clinicas
    where id in (
      'a5fc1411-87d5-4853-8c71-899527cc3020'::uuid,
      '55283218-7df6-4d0b-b29f-504fd6401291'::uuid
    )
    for update
  ) locked_clinics;
  if v_found <> 2 then
    raise exception 'Expected exactly two P0-04 special clinic UUIDs, found %', v_found;
  end if;

  update public.clinicas
  set plan_entitlements_mode = case id
    when 'a5fc1411-87d5-4853-8c71-899527cc3020'::uuid then 'unlimited_lifetime'
    when '55283218-7df6-4d0b-b29f-504fd6401291'::uuid then 'internal_full_access'
  end,
  plan_entitlements_version = 1
  where id in (
    'a5fc1411-87d5-4853-8c71-899527cc3020'::uuid,
    '55283218-7df6-4d0b-b29f-504fd6401291'::uuid
  );
  get diagnostics v_found = row_count;
  if v_found <> 2 then
    raise exception 'P0-04 special classification affected % clinics, expected 2', v_found;
  end if;

  if not exists (
    select 1 from public.clinicas
    where id = 'a5fc1411-87d5-4853-8c71-899527cc3020'::uuid
      and plan_entitlements_mode = 'unlimited_lifetime'
      and plan_entitlements_version = 1
  ) or not exists (
    select 1 from public.clinicas
    where id = '55283218-7df6-4d0b-b29f-504fd6401291'::uuid
      and plan_entitlements_mode = 'internal_full_access'
      and plan_entitlements_version = 1
  ) then
    raise exception 'P0-04 special classification verification failed';
  end if;
end;
$$;

commit;
