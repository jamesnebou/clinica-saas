# Prontuario seguro - Fase 0A

## Modelo

`clientes` permanece como cadastro administrativo usado por Agenda, CRM,
Financeiro e WhatsApp. `cliente_prontuarios` passa a ser a superficie canonica
de anamnese, alergias, medicamentos, contraindicacoes, observacoes clinicas,
retorno recomendado e resumo dos consentimentos clinicos.

As colunas clinicas legadas de `clientes` nao sao removidas nesta fase. A
migration realiza backfill sem sobrescrever prontuarios ja criados e instala
sincronizacao bidirecional temporaria. Sessoes `authenticated` recebem
privilegios somente sobre as colunas cadastrais permitidas.

## Autorizacao

- `owner`: acesso clinico.
- `admin`: acesso clinico por padrao; uma lista personalizada de secoes precisa
  conter `prontuario`.
- `profissional`: acesso somente quando `prontuario` for concedido
  explicitamente nas secoes permitidas.
- `recepcao` e `financeiro`: sem acesso clinico, mesmo que uma secao malformada
  tente incluir `prontuario`.

Fotos, consentimentos e `cliente_prontuarios` usam
`app_private.usuario_prontuario_clinica`. O bucket `cliente-fotos` continua
privado; uploads e URLs assinadas continuam no servidor e validam o prefixo
`clinica_id/cliente_id`.

## Validacao local

O arquivo `supabase/tests/prontuario_secure_rls.test.sql` executa cenarios reais
de RLS com dois tenants e seis identidades. Ele deve ser executado em um
Supabase local descartavel, nunca no banco de producao.

Antes de publicar a migration, valide que a quantidade e o conteudo foram
preservados:

```sql
select
  (select count(*) from public.clientes) as clientes,
  (select count(*) from public.cliente_prontuarios) as prontuarios;

select count(*) as divergencias
from public.clientes c
join public.cliente_prontuarios p
  on p.clinica_id = c.clinica_id and p.cliente_id = c.id
where row(c.observacoes_clinicas, c.anamnese, c.alergias, c.contraindicacoes,
          c.medicamentos_uso, c.procedimentos_previos, c.retorno_recomendado_em,
          c.termo_consentimento_aceito, c.termo_consentimento_aceito_em,
          c.termo_consentimento_observacao, c.termo_consentimento_versao,
          c.termo_consentimento_registrado_por)
   is distinct from
      row(p.observacoes_clinicas, p.anamnese, p.alergias, p.contraindicacoes,
          p.medicamentos_uso, p.procedimentos_previos, p.retorno_recomendado_em,
          p.termo_consentimento_aceito, p.termo_consentimento_aceito_em,
          p.termo_consentimento_observacao, p.termo_consentimento_versao,
          p.termo_consentimento_registrado_por);
```

## Rollback operacional

1. Interromper temporariamente escritas no prontuario.
2. Confirmar `divergencias = 0` com a consulta acima.
3. Reimplantar a versao anterior da aplicacao. A sincronizacao mantem as colunas
   legadas atualizadas para essa reversao.
4. Restaurar os privilegios cadastrais anteriores somente durante uma janela
   controlada, se a versao antiga ainda depender de `select('*')`.
5. Nao remover `cliente_prontuarios`, triggers ou colunas legadas ate concluir
   uma janela completa de observacao e um backup verificado.

Este rollback nao apaga dados clinicos. A remocao definitiva das colunas
legadas deve ocorrer em outra migration e somente depois da homologacao.
