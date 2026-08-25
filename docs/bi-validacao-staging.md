# Validação de staging do BI e multissegmento

Execute esta validação em um projeto Supabase de staging antes da produção. Não use dados clínicos reais nas fixtures.

## 1. Aplicação

1. Aplicar `20260825100000_multisegmento_bi_foundation.sql`.
2. Aplicar `20260825103000_bi_aggregations.sql`.
3. Confirmar que as duas transações concluíram sem erro.
4. Confirmar os oito segmentos e somente um segmento principal por clínica.

## 2. Compatibilidade

1. Abrir uma clínica criada antes das migrations.
2. Confirmar fallback/migração para `estetica` sem alteração de agenda, CRM, financeiro, site ou checkout.
3. Criar uma clínica nova com segmento principal e dois adicionais.
4. Reabrir o onboarding e confirmar os vínculos persistidos.

## 3. Isolamento e permissões

Use dois usuários e duas clínicas sem vínculo entre si.

1. Owner A consulta somente o BI da clínica A.
2. Owner A não executa `bi_resumo_clinica` nem `bi_detalhes_clinica` para a clínica B.
3. Recepção sem permissão personalizada não abre `/dashboard/bi`.
4. Usuário com permissão personalizada `bi` abre somente o tenant ao qual pertence.
5. Override `bi = false` bloqueia página e RPC.
6. Plano com lista restritiva sem `bi` bloqueia página e RPC.
7. Exportação CSV preserva clínica, período e filtros e gera registro em `auditoria_clinica`.

## 4. Métricas conhecidas

Criar uma fixture determinística com agendamentos concluídos, pendentes, cancelados e faltas; pagamentos pagos, parciais e cancelados; oportunidades em todas as etapas; pedidos e carrinhos.

Validar manualmente:

- cancelados e faltas não entram em receita prevista ou recebida;
- pagamento cancelado não entra em recebido;
- no-show e cancelamento usam o total de atendimentos do período;
- comparação usa o intervalo anterior equivalente;
- filtros de profissional, procedimento, categoria, status, forma, origem, canal e etapa alteram apenas os conjuntos correspondentes;
- datas próximas da meia-noite permanecem no dia correto no fuso da clínica;
- drill-down totaliza e pagina os mesmos registros do KPI;
- nenhuma métrica indisponível aparece como zero inventado.

## 5. Performance

Com volume representativo, medir as duas RPCs com `EXPLAIN (ANALYZE, BUFFERS)`. Registrar duração, leituras e plano. Introduzir snapshots ou materialized views apenas para gargalos medidos.

## Critério de promoção

Promover para produção somente com migrations aplicadas sem erro, isolamento entre os dois tenants comprovado, métricas da fixture conciliadas e regressão manual dos fluxos operacionais concluída.
