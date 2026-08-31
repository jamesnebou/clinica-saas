begin;

-- O cadastro reutiliza os eventos internos do funil. Este índice mantém o
-- rate limit por IP eficiente sem criar uma segunda fonte de tracking.
create index if not exists clinica_marketing_eventos_ip_created_idx
  on public.clinica_marketing_eventos(ip_hash, created_at desc)
  where ip_hash is not null;

commit;
