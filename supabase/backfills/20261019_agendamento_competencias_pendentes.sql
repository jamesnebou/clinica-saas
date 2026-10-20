-- Revisao e aprovacao separadas sao obrigatorias antes de executar em qualquer ambiente.
-- Um unico comando e atomico; pode ser envolvido por BEGIN/ROLLBACK nos testes.
-- A funcao da migration garante recebivel e competencia, inclusive sem sinal.
do $$
declare
  v_agendamento record;
begin
  for v_agendamento in
    select a.clinica_id, a.id
      from public.agendamentos a
      left join public.finance_recebiveis r
        on r.clinica_id = a.clinica_id and r.origem_tipo = 'agendamento'
       and r.origem_id = a.id::text
      left join public.finance_competencias c
        on c.clinica_id = a.clinica_id and c.origem_tipo = 'agendamento'
       and c.origem_id = a.id::text and c.tipo = 'receita'
     where a.status = 'concluido' and a.valor > 0
       and a.pagamento_status <> 'cancelado'
       and (r.id is null or (r.status not in ('cancelado', 'estornado') and r.valor_total > 0
            and r.metadata->>'demo' is distinct from 'true'))
       and (r.id is null or c.id is null or c.estornada)
       and not exists (select 1 from app_private.demo_environments d where d.clinic_id = a.clinica_id)
     order by a.clinica_id, a.id
  loop
    perform app_private.finance_sync_agendamento_competencia(
      v_agendamento.clinica_id, v_agendamento.id, true
    );
  end loop;
end;
$$;
