# Checklist para demonstração comercial

## Antes de apresentar

1. Aplicar as migrations pendentes no Supabase.
2. Configurar as variáveis na Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INTERNAL_ADMIN_EMAILS`
   - `ASAAS_WEBHOOK_TOKEN`
   - `ASAAS_API_KEY` quando a criação de cobrança for ativada.
3. Criar ou confirmar uma clínica de demonstração.
4. Trocar o UUID em `supabase/seeds/demo-data.sql` pelo `id` da clínica demo.
5. Rodar o seed apenas no projeto Supabase de demonstração.
6. Entrar no dashboard e conferir:
   - agenda do dia;
   - clientes e fichas;
   - profissionais;
   - procedimentos;
   - financeiro;
   - painel Admin SaaS.

## Domínio na Vercel

1. Acessar o projeto `clinica-saas` na Vercel.
2. Ir em Settings > Domains.
3. Adicionar o domínio escolhido, por exemplo `app.seudominio.com.br` ou `clinicas.seudominio.com.br`.
4. Criar os registros DNS solicitados pela Vercel no provedor do domínio.
5. Esperar a validação SSL ficar ativa.
6. Definir o domínio principal do projeto quando a validação finalizar.

## LGPD e contratos

As páginas `/privacidade` e `/termos` já existem como base para demonstração. Antes de vender oficialmente, revisar com apoio jurídico para adequar:

- razão social e CNPJ da empresa operadora;
- e-mail de contato/DPO;
- responsabilidades da clínica como controladora dos dados;
- responsabilidades da plataforma como operadora;
- retenção de prontuários, fotos e termos de consentimento;
- regras comerciais de trial, bloqueio e cancelamento.
