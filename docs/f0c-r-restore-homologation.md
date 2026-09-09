# F0C-R: evidencia de backup e restore

Validacao executada em 2026-09-08 exclusivamente no Supabase local da Clinica.
Nenhuma operacao de escrita foi executada no projeto remoto.

## Artefatos do backup local

Diretorio temporario:

`C:\Users\james\AppData\Local\Temp\nexawi-f0cr-backup-20260908-153210`

| Artefato | Tamanho | SHA-256 |
|---|---:|---|
| roles.sql | 370 bytes | `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308` |
| schema.sql | 528424 bytes | `997CE9ED6E942DE24DB986FB1A11BE0B7FABB644583CDCFD187C7F636FF6711C` |
| data.sql | 61555 bytes | `AABA39A89492155CA93DABF479EC8EA398FCE7E8AEDEA9E409F40C284E46FC56` |
| full custom dump | 1263286 bytes | `76DFBFE4B0626EBCC24A6DE8D0F463F8A178A9FF685D21CE5F03F057F250E6C5` |

O dump de dados alertou sobre dependencias circulares em
`finance_categorias`, `finance_liquidacoes`, `automations` e
`automation_versions`. Por isso, o teste final usou o custom dump completo.

## Restore comprovado

O restore foi feito no banco local descartavel `f0cr_restore`, criado a partir
de `template0`, usando `supabase_admin` e preservando ACLs:

```text
pg_restore -U supabase_admin -d f0cr_restore --no-owner --exit-on-error /tmp/f0cr-full.dump
```

Nao usar `postgres` como usuario de restore nesse ambiente: ele nao possui todas
as permissoes exigidas pelos objetos gerenciados pelo Supabase. Nao usar
`--no-privileges` em restore integral: isso remove grants necessarios para os
roles da aplicacao.

## Validacoes depois do restore

- 52 registros de migration foram restaurados.
- Clinica, cliente, prontuario, agendamento, recebivel e liquidacao da fixture
  foram preservados.
- A reconciliacao entre legado e Financeiro 2.0 permaneceu valida.
- As constraints de tenant da fixture permaneceram validas.
- RLS permaneceu ativo em `agendamentos`, `automations`,
  `cliente_prontuarios`, `clientes`, `crm_oportunidades` e
  `finance_recebiveis`.
- F0A: 27/27 testes pgTAP aprovados.
- F0B: 26/26 testes pgTAP aprovados em banco restaurado sem a fixture global,
  conforme a pre-condicao de isolamento desse arquivo de teste.

Depois dos testes destrutivos da F0B, o banco descartavel foi recriado e o dump
foi restaurado novamente. A fixture foi revalidada no estado final.

## Limites desta homologacao

- O banco restaurado e local, nao um projeto Supabase de staging.
- Auth, Storage, webhooks, secrets e a aplicacao Preview nao foram homologados
  contra o restore.
- A configuracao do plano remoto, retencao de backup e PITR nao e observavel
  pelo repositorio e precisa ser confirmada no Dashboard do Supabase.
- Workers foram validados por codigo e testes, mas nao executados contra um
  staging restaurado.
- O baseline unificado Core + Clinica + Barbearia nao foi gerado porque o estado
  canonico remoto ainda depende da F0C e da decisao sobre a migration
  `20260809102000` da Barbearia.

## Condicao para homologacao completa

Criar um projeto Supabase isolado, restaurar um backup sanitizado, configurar uma
Preview da aplicacao e executar login, troca de tenant, agenda, prontuario,
financeiro, CRM, gateways sem cobranca real e todos os workers. Somente depois
disso o historico remoto e o baseline podem ser reconciliados com seguranca.
