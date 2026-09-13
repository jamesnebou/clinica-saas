begin;

create table if not exists public.public_rate_limit_buckets (
  scope text not null,
  tenant_key text not null default 'global',
  subject_hash text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, tenant_key, subject_hash, window_start),
  check (scope ~ '^[a-z0-9_.:-]{1,100}$'),
  check (char_length(tenant_key) between 1 and 100),
  check (subject_hash ~ '^[0-9a-f]{64}$'),
  check (window_seconds between 10 and 86400),
  check (request_count > 0)
);

create index if not exists public_rate_limit_buckets_expires_idx
  on public.public_rate_limit_buckets (expires_at);

-- O identificador nasce no formulário e é validado pelo servidor. O índice impede
-- que retries concorrentes reservem estoque ou iniciem duas cobranças.
create unique index if not exists pedidos_clinica_checkout_request_active_uidx
  on public.pedidos_clinica (clinica_id, ((origem ->> 'checkout_request_id')))
  where nullif(origem ->> 'checkout_request_id', '') is not null;

alter table public.public_rate_limit_buckets enable row level security;
revoke all on table public.public_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_tenant_key text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer, current_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_tenant_key text := coalesce(nullif(trim(p_tenant_key), ''), 'global');
begin
  if p_scope is null or p_scope !~ '^[a-z0-9_.:-]{1,100}$' then
    raise exception 'Invalid rate-limit scope.' using errcode = '22023';
  end if;
  if char_length(v_tenant_key) > 100 then
    raise exception 'Invalid rate-limit tenant.' using errcode = '22023';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit subject.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid rate limit.' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit window.' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.public_rate_limit_buckets (
    scope,
    tenant_key,
    subject_hash,
    window_start,
    window_seconds,
    request_count,
    expires_at,
    updated_at
  ) values (
    p_scope,
    v_tenant_key,
    p_subject_hash,
    v_window_start,
    p_window_seconds,
    1,
    v_window_end + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (scope, tenant_key, subject_hash, window_start)
  do update set
    request_count = least(public.public_rate_limit_buckets.request_count, 2147483646) + 1,
    updated_at = excluded.updated_at,
    expires_at = excluded.expires_at
  returning request_count into v_count;

  -- Amostragem reduz o crescimento sem adicionar um scheduler obrigatório.
  if random() < 0.02 then
    delete from public.public_rate_limit_buckets
    where ctid in (
      select ctid
      from public.public_rate_limit_buckets
      where expires_at < v_now
      order by expires_at
      limit 500
      for update skip locked
    );
  end if;

  return query select
    v_count <= p_limit,
    greatest(1, ceil(extract(epoch from (v_window_end - v_now)))::integer),
    v_count;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, text, integer, integer)
  to service_role;

commit;
