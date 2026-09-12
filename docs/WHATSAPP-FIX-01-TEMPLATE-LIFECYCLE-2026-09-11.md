# WHATSAPP-FIX-01 — Lifecycle de templates Meta

Data: 2026-09-11

## Causa raiz

O worker consultava `whatsapp_templates` com `status = APPROVED`. A ausência de resultado era convertida em `Template Meta ainda não aprovado para este gatilho.` com `permanent = true`. Assim, `PENDING`, `REJECTED`, template ausente e qualquer outro estado produziam a mesma decisão permanente.

Além disso, `claim_notification_jobs` incrementa `attempt_count` antes do processamento. Um simples retry de `PENDING` consumiria rapidamente `max_attempts`, mesmo sem falha operacional.

## Decisão implementada

| Status Meta | Decisão | Health |
| --- | --- | --- |
| `APPROVED` | envia normalmente | sucesso ou resultado real do provider |
| `PENDING` | adia por pelo menos 1 hora, mantém `retry` e devolve a tentativa consumida pelo claim | saudável/deferred |
| `IN_APPEAL` | mesmo tratamento transitório de `PENDING` | saudável/deferred |
| `PAUSED` | mesmo tratamento transitório de `PENDING` | saudável/deferred |
| `REJECTED` | permanente; requer correção | dead/HTTP 422 |
| `DISABLED` | permanente; requer correção | dead/HTTP 422 |
| `PENDING_DELETION` | permanente; requer substituição | dead/HTTP 422 |
| `DELETED` | permanente; requer substituição | dead/HTTP 422 |
| `LIMIT_EXCEEDED` | permanente; requer correção | dead/HTTP 422 |
| ausente/desconhecido | configuração ausente ou estado não suportado, fail closed | dead/HTTP 422 |

O adiamento usa o status persistente `retry` e o backoff existente, com piso de uma hora. O `attempt_count` recebido do claim é reduzido em uma unidade na mesma atualização. Portanto, espera externa conhecida não esgota `max_attempts` e não deixa o scheduler vermelho a cada cinco minutos. Falhas operacionais reais continuam usando `retryScheduled`, `failed` ou `dead` e preservam o contrato F0C-CLOSE-02.

Antes de avaliar conexão, template ou consentimento, o worker cancela jobs que perderam validade por pagamento não pendente ou por agendamento cancelado, concluído ou marcado como falta.

## Diagnóstico read-only de jobs históricos

Nenhuma consulta a Production foi executada nesta tarefa. A consulta abaixo retorna somente contagens agregadas, sem nome, telefone, payload, token ou identificador do paciente:

```sql
with candidates as (
  select
    nj.template_purpose,
    nj.scheduled_at,
    e.aggregate_id,
    a.status as booking_status,
    p.pagamento_status,
    wt.status as template_status
  from public.notification_jobs nj
  join public.domain_outbox_events e
    on e.id = nj.event_id
   and e.clinica_id = nj.clinica_id
  left join public.agendamentos a
    on a.id = e.aggregate_id
   and a.clinica_id = nj.clinica_id
  left join lateral (
    select sap.pagamento_status
    from public.site_agendamentos_publicos sap
    where sap.agendamento_id = e.aggregate_id
      and sap.clinica_id = nj.clinica_id
    order by sap.created_at desc
    limit 1
  ) p on true
  left join public.whatsapp_connections wc
    on wc.clinica_id = nj.clinica_id
   and wc.is_primary = true
   and wc.connection_status = 'connected'
   and wc.onboarding_status = 'ready'
  left join public.whatsapp_templates wt
    on wt.clinica_id = nj.clinica_id
   and wt.connection_id = wc.id
   and wt.purpose = nj.template_purpose
  where nj.status = 'failed'
    and nj.last_error = 'Template Meta ainda não aprovado para este gatilho.'
), classified as (
  select
    template_purpose,
    coalesce(template_status, 'MISSING') as template_status,
    case
      when template_purpose in ('booking_payment_pending', 'payment_expiring', 'payment_expired')
        and pagamento_status is distinct from 'pendente'
        then 'obsolete_payment'
      when template_purpose in ('appointment_reminder_24h', 'appointment_reminder_3h')
        and booking_status in ('cancelado', 'faltou', 'concluido')
        then 'obsolete_booking'
      when template_purpose in ('appointment_reminder_24h', 'appointment_reminder_3h')
        and scheduled_at < now()
        then 'obsolete_reminder_window'
      when template_status = 'APPROVED'
        then 'eligible_for_reviewed_requeue'
      else 'awaiting_template_or_review'
    end as recovery_state
  from candidates
)
select template_purpose, template_status, recovery_state, count(*) as jobs
from classified
group by template_purpose, template_status, recovery_state
order by recovery_state, template_purpose, template_status;
```

## Recuperação futura

1. Executar a consulta agregada acima em modo read-only.
2. Confirmar que a conexão primária continua `ready/connected` e que o template canônico está `APPROVED`.
3. Excluir da recuperação pagamentos concluídos, agendamentos cancelados/concluídos/faltosos e lembretes cuja janela passou.
4. Revisar individualmente somente os jobs classificados como `eligible_for_reviewed_requeue`, dentro do tenant correto.
5. Com autorização explícita, reclassificar esses jobs para `retry`, limpar locks e agendar execução controlada. Não zerar ou alterar jobs enviados.
6. Executar um lote pequeno, conferir `whatsapp_messages` e o retorno da Meta antes de ampliar.

Nenhum job histórico foi reprocessado ou alterado durante esta correção.

## Migration

Não foi necessária. O modelo atual já suporta `retry`, `scheduled_at`, `attempt_count`, `max_attempts` e todos os estados Meta tratados.

## Risco residual

Um template `PAUSED` pode permanecer indisponível por período definido pela Meta. Ele continuará sendo verificado a cada hora sem consumir tentativas. Estados desconhecidos permanecem fail closed para não enviar com um lifecycle não reconhecido.
