-- Permite montar pacotes com mais de um procedimento sem remover a coluna legada.
alter table public.pacotes_clinica
  add column if not exists procedimento_ids uuid[] not null default '{}'::uuid[];
