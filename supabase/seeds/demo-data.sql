-- Demo data for Clinica SaaS.
-- Run after creating at least one clinic and replacing the value below.
-- This script is intentionally not a migration.

begin;

-- Replace with the clinic id used in the demo account.
create temporary table demo_context (clinica_id uuid);
insert into demo_context values ('00000000-0000-0000-0000-000000000000');

insert into public.profissionais (clinica_id, nome, telefone, email, especialidade, comissao_percentual, observacoes)
select clinica_id, 'Dra. Helena Martins', '11999990001', 'helena@bellaskin.demo', 'Harmonização facial', 18, 'Profissional principal da demonstração.' from demo_context
union all select clinica_id, 'Camila Duarte', '11999990002', 'camila@bellaskin.demo', 'Estética corporal', 15, 'Atende pacotes corporais.' from demo_context
on conflict do nothing;

insert into public.procedimentos (clinica_id, nome, categoria, descricao, duracao_minutos, preco, cuidados_antes, cuidados_depois)
select clinica_id, 'Limpeza de pele premium', 'Facial', 'Higienização, extração e hidratação facial.', 90, 260, 'Evitar ácidos por 48h.', 'Usar protetor solar e hidratar a pele.' from demo_context
union all select clinica_id, 'Botox', 'Injetáveis', 'Aplicação de toxina botulínica.', 45, 890, 'Evitar anti-inflamatórios sem orientação.', 'Não deitar por 4h após o procedimento.' from demo_context
union all select clinica_id, 'Drenagem linfática', 'Corporal', 'Sessão de drenagem manual.', 60, 180, 'Beber água antes da sessão.', 'Manter hidratação ao longo do dia.' from demo_context
on conflict do nothing;

insert into public.clientes (clinica_id, nome, telefone, email, cpf, data_nascimento, origem, status, observacoes, consentimento_lgpd, data_consentimento_lgpd, observacoes_clinicas, alergias, contraindicacoes, retorno_recomendado_em, termo_consentimento_aceito, termo_consentimento_aceito_em, anamnese)
select clinica_id, 'Mariana Costa', '11988887777', 'mariana@example.com', '12345678900', '1992-04-12', 'Instagram', 'ativo', 'Interessada em protocolo facial.', true, now(), 'Pele sensível.', 'Alergia leve a níquel.', 'Evitar peeling agressivo.', current_date + interval '21 days', true, now(), '{"objetivo_principal":"Rejuvenescimento facial","gestante":false,"diabetes":false}'::jsonb from demo_context
union all select clinica_id, 'Ana Paula Ribeiro', '11977776666', 'ana@example.com', '98765432100', '1988-09-03', 'Indicação', 'ativo', 'Cliente de pacote corporal.', true, now(), 'Boa aderência a retornos.', null, null, current_date + interval '14 days', true, now(), '{"objetivo_principal":"Redução de medidas","hipertensao":false}'::jsonb from demo_context
union all select clinica_id, 'Juliana Rocha', '11966665555', 'juliana@example.com', null, '1996-01-20', 'Tráfego pago', 'lead', 'Agendar avaliação.', true, now(), null, null, null, current_date + interval '30 days', false, null, '{}'::jsonb from demo_context
on conflict do nothing;

insert into public.agendamentos (clinica_id, cliente_id, profissional_id, procedimento_id, inicio, fim, status, valor, pagamento_status, forma_pagamento, valor_pago, observacoes)
select c.clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '10 hours 30 minutes', 'confirmado', proc.preco, 'pago', 'pix', proc.preco, 'Atendimento de demonstração.'
from demo_context c
join public.clientes cli on cli.clinica_id = c.clinica_id and cli.nome = 'Mariana Costa'
join public.profissionais prof on prof.clinica_id = c.clinica_id and prof.nome = 'Dra. Helena Martins'
join public.procedimentos proc on proc.clinica_id = c.clinica_id and proc.nome = 'Botox'
union all
select c.clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '11 hours', date_trunc('day', now()) + interval '12 hours 30 minutes', 'agendado', proc.preco, 'pendente', null, 0, 'Confirmar pelo WhatsApp.'
from demo_context c
join public.clientes cli on cli.clinica_id = c.clinica_id and cli.nome = 'Ana Paula Ribeiro'
join public.profissionais prof on prof.clinica_id = c.clinica_id and prof.nome = 'Camila Duarte'
join public.procedimentos proc on proc.clinica_id = c.clinica_id and proc.nome = 'Drenagem linfática';

commit;
