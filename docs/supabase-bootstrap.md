# Bootstrap Supabase

## 1. Aplicar schema

No Supabase Dashboard, abra **SQL Editor** e execute o arquivo:

```txt
supabase/migrations/20260618122000_initial_clinica_saas_schema.sql
```

Ele cria as tabelas principais do MVP:

- clinicas
- usuarios_clinica
- clientes
- profissionais
- procedimentos
- agendamentos

Todas as tabelas ficam com RLS habilitado e escopo por clinica.

## 2. Criar usuario no Auth

No Supabase Dashboard, va em **Authentication > Users** e crie o primeiro usuario com e-mail e senha.

## 3. Vincular primeira clinica

Depois de criar o usuario, execute no SQL Editor trocando os valores abaixo:

```sql
with nova_clinica as (
  insert into public.clinicas (nome, slug, email, telefone, cidade, estado, status, plano)
  values (
    'Nome da Clinica',
    'nome-da-clinica',
    'contato@clinica.com',
    '(00) 00000-0000',
    'Sua Cidade',
    'UF',
    'ativa',
    'starter'
  )
  returning id
), usuario_auth as (
  select id, email
  from auth.users
  where lower(email) = lower('EMAIL_DO_USUARIO_AUTH')
  limit 1
)
insert into public.usuarios_clinica (clinica_id, user_id, nome, email, papel, ativo, accepted_at)
select nova_clinica.id, usuario_auth.id, 'Administrador', usuario_auth.email, 'owner', true, now()
from nova_clinica, usuario_auth;
```

Se o `select` de `auth.users` nao encontrar o e-mail, nenhum vinculo sera criado. Confira se o usuario foi criado no Auth antes.

## 4. Testar

Acesse `/login`, entre com o e-mail/senha criado no Supabase Auth e abra `/dashboard`.
