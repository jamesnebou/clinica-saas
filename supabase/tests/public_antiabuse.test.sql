begin;
select plan(16);

select has_table('public', 'public_rate_limit_buckets', 'rate-limit bucket table exists');
select has_function('public', 'consume_public_rate_limit', array['text', 'text', 'text', 'integer', 'integer'], 'atomic limiter RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.public_rate_limit_buckets'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.public_rate_limit_buckets', 'select'), 'anon cannot read buckets');
select ok(not has_function_privilege('authenticated', 'public.consume_public_rate_limit(text,text,text,integer,integer)', 'execute'), 'authenticated cannot consume arbitrary buckets');

select is(
  (select allowed from public.consume_public_rate_limit('test:ip', 'tenant-a', repeat('a', 64), 1, 60)),
  true,
  'first request is allowed'
);
select is(
  (select allowed from public.consume_public_rate_limit('test:ip', 'tenant-a', repeat('a', 64), 1, 60)),
  false,
  'request above limit is denied atomically'
);
select is(
  (select allowed from public.consume_public_rate_limit('test:ip', 'tenant-b', repeat('a', 64), 1, 60)),
  true,
  'tenant bucket is independent'
);

select ok(has_function_privilege('service_role', 'public.consume_public_rate_limit(text,text,text,integer,integer)', 'execute'), 'service role can consume');
select ok(not has_table_privilege('authenticated', 'public.public_rate_limit_buckets', 'insert'), 'browser cannot manufacture quota');
select throws_ok($$select * from public.consume_public_rate_limit('test:ip','tenant-a','plain-ip',1,60)$$,
 '22023', null, 'raw IP is rejected by RPC');
select ok((select retry_after between 1 and 60 from public.consume_public_rate_limit('retry:ip','tenant-a',repeat('b',64),1,60)), 'retry is bounded to current window');
select ok((select allowed from public.consume_public_rate_limit('other:ip','tenant-a',repeat('a',64),1,60)), 'route bucket independent');
insert into public.clinicas(id,nome,slug,status) values
 ('e0000000-0000-4000-8000-000000000001','Antiabuse fixture A','antiabuse-fixture-a','ativa'),
 ('e0000000-0000-4000-8000-000000000002','Antiabuse fixture B','antiabuse-fixture-b','ativa');
insert into public.pedidos_clinica(clinica_id,nome_cliente,telefone_cliente,status,origem) values
 ('e0000000-0000-4000-8000-000000000001','Fixture','00000000000','cancelado','{"checkout_request_id":"fixture-key"}');
select throws_ok($$
 insert into public.pedidos_clinica(clinica_id,nome_cliente,telefone_cliente,origem)
 values ('e0000000-0000-4000-8000-000000000001','Fixture','00000000000','{"checkout_request_id":"fixture-key"}')
$$, '23505', null, 'cancelled checkout key still prevents duplicate order');
select lives_ok($$
 insert into public.pedidos_clinica(clinica_id,nome_cliente,telefone_cliente,origem)
 values ('e0000000-0000-4000-8000-000000000002','Fixture','00000000000','{"checkout_request_id":"fixture-key"}')
$$, 'same key in different tenant remains independent');
select is((select count(*) from public.pedidos_clinica where origem->>'checkout_request_id'='fixture-key'),2::bigint,'one order per tenant');
select * from finish();
rollback;
