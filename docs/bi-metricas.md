# Dicionário de métricas do BI

## Regras gerais

- Períodos usam o fuso configurado na clínica, com fallback `America/Bahia`.
- A comparação usa imediatamente o período anterior de mesma duração.
- Agendamento cancelado ou com falta não compõe receita prevista.
- Pagamento cancelado ou estornado não compõe receita recebida.
- Valores não disponíveis não são estimados.

| Métrica | Definição |
| --- | --- |
| Receita prevista | Soma do valor de agendamentos faturáveis no período. |
| Receita recebida | Soma de `valor_pago` faturável e pagamentos avulsos pagos. |
| Pendente | Máximo entre receita prevista menos recebida e zero. |
| Ticket médio | Receita recebida dividida por atendimentos do período. |
| Taxa de conclusão | Atendimentos concluídos divididos pelo total. |
| No-show | Faltas divididas pelo total de atendimentos. |
| Cancelamento | Cancelamentos divididos pelo total de atendimentos. |
| Ocupação | Minutos faturáveis agendados divididos pelos minutos disponíveis do expediente, descontadas datas inativas. |
| Conversão CRM | Oportunidades convertidas divididas pelos leads criados no período. |
| Pipeline | Soma do valor estimado de oportunidades abertas. |
| Pacientes recorrentes | Pacientes com dois ou mais atendimentos faturáveis no período. |
| Sem retorno 90 dias | Pacientes sem atendimento válido ou cujo último atendimento ocorreu há mais de 90 dias. |
| Procedimentos realizados | Atendimentos com status `concluido`, agrupados pelo procedimento. Cancelamentos e faltas continuam visíveis nas taxas, mas não contam como realização. |
| Receita por procedimento | Valores previstos e recebidos dos atendimentos faturáveis, excluindo cancelados, faltas e pagamentos cancelados. |
| Repasse | Receita recebida multiplicada pela comissão cadastrada do profissional. |
| Receita e-commerce | Total de pedidos pagos criados no período. |
| Ticket e-commerce | Receita e-commerce dividida pelos pedidos pagos. |

## Limitações explícitas

Lucro, margem, custos fixos e variáveis dependem de um financeiro contábil completo. Enquanto essa fonte não existir, o BI informa a indisponibilidade e não cria números artificiais.

O filtro de segmento atua como contexto da clínica. Registros operacionais antigos ainda não possuem dimensão de segmento individual; portanto, não há rateio retroativo inventado.

Retenção por coortes de 30/60/90/180 dias, reativação, frequência e retorno médio exigem uma agregação histórica dedicada. A base de domínio já reserva esses cálculos, mas eles não são exibidos como completos enquanto a coorte não estiver materializada e validada em produção.
