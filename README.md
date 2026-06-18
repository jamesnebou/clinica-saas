# Clinica SaaS

SaaS para gestao de clinicas de estetica, construido com Next.js, Tailwind CSS, Supabase e Vercel.

## Stack inicial

- Next.js App Router
- Tailwind CSS
- Supabase Auth/Database
- Vercel deploy via GitHub

## Modulos MVP

- Login com Supabase Auth
- Dashboard protegido
- Multi-clinica com RLS por clinica
- Clientes
- Profissionais
- Procedimentos
- Agenda

## Variaveis de ambiente

Copie `.env.example` para `.env.local` no ambiente local e configure tambem na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` deve ser usada apenas em codigo server-side.

## Supabase

A migration inicial esta em:

```txt
supabase/migrations/20260618122000_initial_clinica_saas_schema.sql
```

Para criar a primeira clinica e vincular o primeiro usuario owner, siga:

```txt
docs/supabase-bootstrap.md
```

## Scripts

```bash
npm run dev
npm run lint
npm run build
```
