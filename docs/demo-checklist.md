# Checklist para demonstracao comercial

## Objetivo

Preparar uma demo limpa, consistente e repetivel do Clinica SaaS, com uma clinica ficticia, usuario pronto, agenda preenchida, clientes com prontuario, financeiro basico e plano ativo.

## Antes de aplicar o seed

1. Aplicar todas as migrations pendentes no Supabase.
2. Confirmar que estas migrations existem no banco:
   - `20260619123000_clinica_logos_storage.sql`
   - `20260619133000_prontuario_consentimentos.sql`
3. Criar no Supabase Auth o usuario:
   - Email: `demo@clinicasaas.com.br`
   - Senha: definir manualmente no painel do Supabase.
4. Confirmar variaveis de ambiente na Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INTERNAL_ADMIN_EMAILS`
   - `ASAAS_WEBHOOK_TOKEN`
   - `ASAAS_API_KEY` quando a criacao real de cobranca for ativada.

## Aplicar dados demo

1. Abrir o SQL Editor do Supabase no projeto de demo.
2. Colar e executar o arquivo `supabase/seeds/demo-data.sql`.
3. O seed e idempotente para a clinica `demo-bella-skin`: ele recria apenas os dados operacionais dessa clinica demo.
4. Nao executar esse seed em banco de producao com dados reais sem revisar antes.

## Dados criados

- Clinica: `Clinica Bella Skin Demo`
- Marca exibida: `Bella Skin`
- Plano: `Growth`
- Status: `ativa`
- Usuario owner: `demo@clinicasaas.com.br`
- Usuarios auxiliares:
  - `recepcao@bellaskin.demo`
  - `financeiro@bellaskin.demo`
- Profissionais:
  - Dra. Helena Martins
  - Camila Duarte
  - Bianca Alves
- Clientes:
  - Mariana Costa
  - Ana Paula Ribeiro
  - Juliana Rocha
  - Renata Lima
  - Carla Mendes
- Dados incluidos:
  - agenda de hoje e futura;
  - historico concluido;
  - pagamentos pagos, parciais e pendentes;
  - prontuario com anamnese;
  - consentimentos formais;
  - fotos antes/depois de exemplo;
  - pacote de sessoes ativo.

## Validacao antes da apresentacao

1. Entrar por `/login-cliente` com o usuario demo.
2. Conferir `/dashboard`:
   - cards carregando dados reais;
   - plano Growth ativo;
   - resumo do dia com faturamento previsto.
3. Conferir `/dashboard/agenda`:
   - agendamentos do dia;
   - status visual;
   - filtro por profissional;
   - WhatsApp rapido.
4. Conferir `/dashboard/clientes`:
   - clientes listados;
   - abrir Ana Paula Ribeiro para mostrar prontuario e fotos;
   - abrir Mariana Costa para mostrar consentimento de procedimento.
5. Conferir `/dashboard/financeiro`:
   - pagamentos pagos, parciais e pendentes;
   - pacote ativo.
6. Conferir `/dashboard/crm`:
   - pipeline por etapa;
   - oportunidades com follow-up;
   - WhatsApp rapido;
   - conversao de oportunidade em cliente.
7. Conferir `/dashboard/assinatura`:
   - plano atual;
   - limites;
   - acao de upgrade.

## Domínio na Vercel

1. Acessar o projeto `clinica-saas` na Vercel.
2. Ir em Settings > Domains.
3. Adicionar o dominio escolhido, por exemplo `app.seudominio.com.br` ou `clinicas.seudominio.com.br`.
4. Criar os registros DNS solicitados pela Vercel no provedor do dominio.
5. Esperar a validacao SSL ficar ativa.
6. Definir o dominio principal do projeto quando a validacao finalizar.

## LGPD e contratos

As paginas `/privacidade` e `/termos` ja existem como base para demonstracao. Antes de vender oficialmente, revisar com apoio juridico para adequar:

- razao social e CNPJ da empresa operadora;
- e-mail de contato/DPO;
- responsabilidades da clinica como controladora dos dados;
- responsabilidades da plataforma como operadora;
- retencao de prontuarios, fotos e termos de consentimento;
- regras comerciais de trial, bloqueio e cancelamento.
