-- Adds public website image fields to procedures.
-- Run this before using procedure image uploads on the dashboard.

alter table public.procedimentos
  add column if not exists imagem_url text,
  add column if not exists imagem_storage_path text,
  add column if not exists imagem_mime_type text,
  add column if not exists imagem_tamanho_bytes bigint;
