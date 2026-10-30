begin;

alter table public.usuarios_clinica
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invite_requires_password boolean not null default false;

create index if not exists idx_usuarios_clinica_pending_invites
  on public.usuarios_clinica (invite_expires_at)
  where ativo = false and accepted_at is null;

create or replace function app_private.guard_staff_invitation_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.ativo or new.accepted_at is not null or new.user_id is not null then
      raise exception 'Staff membership must be created by the invitation service.';
    end if;
  else
    if new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.clinica_id is distinct from old.clinica_id
       or new.accepted_at is distinct from old.accepted_at
       or new.invited_at is distinct from old.invited_at
       or new.invite_expires_at is distinct from old.invite_expires_at
       or new.invite_requires_password is distinct from old.invite_requires_password
       or (old.accepted_at is null and new.ativo) then
      raise exception 'Staff invitation state is managed by the invitation service.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_staff_invitation_state on public.usuarios_clinica;
create trigger guard_staff_invitation_state
before insert or update on public.usuarios_clinica
for each row execute function app_private.guard_staff_invitation_state();

commit;
