# Arquitetura do BI

## Fluxo de dados

1. A rota server-side resolve clínica, papel, filtros, período e timezone.
2. `bi_resumo_clinica` valida o acesso com `usuario_pode_bi_clinica`.
3. O PostgreSQL agrega agenda, pagamentos, CRM, pacientes, equipe, procedimentos, estoque, pedidos, eventos e metas.
4. O navegador recebe apenas resumos e rankings limitados.
5. O componente Recharts renderiza os gráficos sem recalcular regras financeiras.

## Contratos

- `src/lib/bi/periods.js`: períodos atual e comparável no fuso da clínica.
- `src/lib/bi/service.js`: chamada RPC, disponibilidade de agenda, filtros e exportação.
- `src/lib/domain/bi-core.mjs`: comparação, retenção e insights determinísticos.
- `bi_resumo_clinica`: payload agregado do painel.
- `bi_detalhes_clinica`: drill-down paginado e autorizado.
- `src/lib/bi/contracts.js`: fronteiras futuras para consultas e assistente de gestão.

## Performance

As migrations adicionam índices por clínica/período, evento, atribuição e metas. Rankings possuem limites. Drill-down aceita no máximo 100 linhas por chamada. Nenhum histórico completo é agregado no browser.

Para volumes superiores a centenas de milhares de registros por clínica, o próximo passo é medir `EXPLAIN (ANALYZE, BUFFERS)` nas consultas reais e introduzir snapshots diários ou materialized views somente para os gargalos confirmados.

## Segurança

- Funções usam `SECURITY INVOKER`.
- O `clinica_id` é validado contra o usuário autenticado.
- A RPC reaplica no banco a capability `bi` do segmento, do plano e do override da clínica; não depende apenas de ocultar a rota no frontend.
- BI é owner/admin por padrão e pode ser concedido granularmente.
- CSV reutiliza o mesmo contexto autenticado e filtros.
- Eventos não guardam prontuário, anamnese, diagnósticos, fotos ou segredos.
- A API pública aceita apenas eventos de uma allowlist e resolve a clínica pelo slug publicado.

## Retenção e LGPD

Definir política operacional para anonimizar ou excluir `eventos_analiticos` antigos. Recomendação inicial: manter eventos brutos pelo período necessário à atribuição comercial e preservar somente agregações após esse prazo.

## Multiunidade

Os contratos reservam `unidade_id` em metas. A evolução correta é adicionar a dimensão aos fatos operacionais, aos índices e aos parâmetros RPC. Não aplicar rateio retroativo sem fonte confiável.
