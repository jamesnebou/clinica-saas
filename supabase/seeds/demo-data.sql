-- Clean demo data for Clinica SaaS.
-- Run after applying all migrations, including:
-- - 20260619123000_clinica_logos_storage.sql
-- - 20260619133000_prontuario_consentimentos.sql
--
-- Auth user:
-- 1. Create a Supabase Auth user with email demo@clinicasaas.com.br.
-- 2. Set a known password in Supabase Auth.
-- 3. Run this script. The membership is linked by email and by user_id when the Auth user exists.
--
-- This script resets only the demo clinic identified by slug demo-bella-skin.

do $demo$
declare
  v_clinica_id uuid;
  v_demo_email text := 'demo@clinicasaas.com.br';
begin
  insert into public.clinicas (
    nome,
    slug,
    documento,
    telefone,
    email,
    cidade,
    estado,
    endereco,
    status,
    plano,
    assinatura_status,
    trial_ends_at,
    billing_email,
    metadata
  )
  values (
    'Clinica Bella Skin Demo',
    'demo-bella-skin',
    '12.345.678/0001-90',
    '11955550100',
    v_demo_email,
    'Sao Paulo',
    'SP',
    'Av. Paulista, 1000 - Bela Vista',
    'ativa',
    'growth',
    'ativa',
    now() + interval '30 days',
    'financeiro@bellaskin.demo',
    '{
      "brand_name":"Bella Skin",
      "primary_color":"#e86f8d",
      "accent_color":"#f7b4c6",
      "horario_funcionamento":{"inicio":"08:00","fim":"19:00","dias":["1","2","3","4","5","6"]},
      "politica_cancelamento":"Cancelamentos com menos de 24h podem ser cobrados conforme avaliacao da clinica.",
      "whatsapp_mensagem_padrao":"Ola, {cliente}. Passando para confirmar seu horario na Bella Skin em {data}."
    }'::jsonb
  )
  on conflict (slug) do update set
    nome = excluded.nome,
    documento = excluded.documento,
    telefone = excluded.telefone,
    email = excluded.email,
    cidade = excluded.cidade,
    estado = excluded.estado,
    endereco = excluded.endereco,
    status = excluded.status,
    plano = excluded.plano,
    assinatura_status = excluded.assinatura_status,
    trial_ends_at = excluded.trial_ends_at,
    billing_email = excluded.billing_email,
    metadata = excluded.metadata;

  select id into v_clinica_id
  from public.clinicas
  where slug = 'demo-bella-skin';

  if v_clinica_id is null then
    raise exception 'Clinica demo nao foi criada.';
  end if;

  delete from public.pagamentos_clinica where clinica_id = v_clinica_id;
  delete from public.cliente_pacotes where clinica_id = v_clinica_id;
  delete from public.pacotes_clinica where clinica_id = v_clinica_id;
  delete from public.cliente_fotos where clinica_id = v_clinica_id;
  delete from public.cliente_consentimentos where clinica_id = v_clinica_id;
  delete from public.agendamentos where clinica_id = v_clinica_id;
  delete from public.crm_oportunidades where clinica_id = v_clinica_id;
  delete from public.clientes where clinica_id = v_clinica_id;
  delete from public.profissionais where clinica_id = v_clinica_id;
  delete from public.procedimentos where clinica_id = v_clinica_id;
  delete from public.usuarios_clinica
  where clinica_id = v_clinica_id
    and lower(email) in ('demo@clinicasaas.com.br', 'recepcao@bellaskin.demo', 'financeiro@bellaskin.demo');

  insert into public.usuarios_clinica (clinica_id, user_id, nome, email, papel, ativo, invited_at, accepted_at)
  select v_clinica_id, au.id, 'Usuario Demo', v_demo_email, 'owner', true, now(), now()
  from (select 1) seed
  left join auth.users au on lower(au.email) = lower(v_demo_email)
  on conflict (clinica_id, email) do update set
    user_id = excluded.user_id,
    nome = excluded.nome,
    papel = excluded.papel,
    ativo = true,
    accepted_at = now();

  insert into public.usuarios_clinica (clinica_id, nome, email, papel, ativo, invited_at)
  values
    (v_clinica_id, 'Recepcao Demo', 'recepcao@bellaskin.demo', 'recepcao', true, now()),
    (v_clinica_id, 'Financeiro Demo', 'financeiro@bellaskin.demo', 'financeiro', true, now())
  on conflict (clinica_id, email) do update set
    nome = excluded.nome,
    papel = excluded.papel,
    ativo = true;

  insert into public.profissionais (clinica_id, nome, telefone, email, especialidade, comissao_percentual, observacoes)
  values
    (v_clinica_id, 'Dra. Helena Martins', '11999990001', 'helena@bellaskin.demo', 'Harmonizacao facial', 18, 'Profissional principal da demonstracao.'),
    (v_clinica_id, 'Camila Duarte', '11999990002', 'camila@bellaskin.demo', 'Estetica corporal', 15, 'Atende pacotes corporais e drenagem.'),
    (v_clinica_id, 'Bianca Alves', '11999990003', 'bianca@bellaskin.demo', 'Estetica facial', 12, 'Foco em limpeza de pele e protocolos faciais.');

  insert into public.procedimentos (clinica_id, nome, categoria, descricao, duracao_minutos, preco, cuidados_antes, cuidados_depois)
  values
    (v_clinica_id, 'Limpeza de pele premium', 'Facial', 'Higienizacao, extracao e hidratacao facial.', 90, 260, 'Evitar acidos por 48h.', 'Usar protetor solar e hidratar a pele.'),
    (v_clinica_id, 'Toxina botulinica', 'Injetaveis', 'Aplicacao de toxina botulinica com retorno recomendado.', 45, 890, 'Evitar anti-inflamatorios sem orientacao.', 'Nao deitar por 4h apos o procedimento.'),
    (v_clinica_id, 'Drenagem linfatica', 'Corporal', 'Sessao de drenagem manual.', 60, 180, 'Beber agua antes da sessao.', 'Manter hidratacao ao longo do dia.'),
    (v_clinica_id, 'Bioestimulador corporal', 'Corporal', 'Protocolo corporal com acompanhamento fotografico.', 75, 1200, 'Comparecer sem cremes na regiao.', 'Evitar sol e seguir orientacoes da profissional.'),
    (v_clinica_id, 'Peeling quimico leve', 'Facial', 'Peeling superficial com acompanhamento de retorno.', 50, 340, 'Suspender acidos conforme orientacao.', 'Usar fotoprotecao rigorosa.');

  insert into public.clientes (
    clinica_id,
    nome,
    telefone,
    email,
    cpf,
    data_nascimento,
    endereco,
    origem,
    status,
    observacoes,
    consentimento_lgpd,
    data_consentimento_lgpd,
    observacoes_clinicas,
    alergias,
    contraindicacoes,
    medicamentos_uso,
    procedimentos_previos,
    retorno_recomendado_em,
    termo_consentimento_aceito,
    termo_consentimento_aceito_em,
    termo_consentimento_versao,
    termo_consentimento_observacao,
    anamnese
  )
  values
    (v_clinica_id, 'Mariana Costa', '11988887777', 'mariana.costa@demo.com', '12345678900', date '1992-04-12', 'Rua das Flores, 120', 'Instagram', 'ativo', 'Interessada em protocolo facial premium.', true, now() - interval '20 days', 'Pele sensivel, boa aderencia a rotina de skincare.', 'Alergia leve a niquel.', 'Evitar peeling agressivo.', 'Vitamina D.', 'Limpeza de pele ha 6 meses.', current_date + 21, true, now() - interval '18 days', 'v1', 'Aceite registrado presencialmente antes do procedimento.', '{"objetivo_principal":"Rejuvenescimento facial","queixa_principal":"Linhas finas e textura irregular","gestante":false,"diabetes":false,"hipertensao":false,"usa_acidos":true,"rotina_skincare":"Limpeza, vitamina C e protetor solar"}'::jsonb),
    (v_clinica_id, 'Ana Paula Ribeiro', '11977776666', 'ana.ribeiro@demo.com', '98765432100', date '1988-09-03', 'Av. Brasil, 455', 'Indicacao', 'ativo', 'Cliente de pacote corporal.', true, now() - interval '10 days', 'Boa aderencia a retornos.', null, null, null, 'Drenagem em outra clinica.', current_date + 14, true, now() - interval '9 days', 'v1', 'Autorizou fotos para acompanhamento interno.', '{"objetivo_principal":"Reducao de medidas","queixa_principal":"Retencao de liquido","hipertensao":false,"diabetes":false}'::jsonb),
    (v_clinica_id, 'Juliana Rocha', '11966665555', 'juliana.rocha@demo.com', null, date '1996-01-20', 'Rua Augusta, 88', 'Trafego pago', 'lead', 'Agendar avaliacao para manchas.', true, now() - interval '2 days', null, null, 'Avaliar sensibilidade antes de peeling.', null, null, current_date + 30, false, null, null, null, '{"objetivo_principal":"Clareamento de manchas","gestante":false}'::jsonb),
    (v_clinica_id, 'Renata Lima', '11955554444', 'renata.lima@demo.com', '11122233344', date '1984-06-18', 'Alameda Santos, 901', 'WhatsApp', 'ativo', 'Cliente interessada em injetaveis.', true, now() - interval '5 days', 'Historico de sensibilidade baixa.', null, 'Avaliar medicacoes antes de injetaveis.', 'Antialergico eventual.', 'Botox em 2024.', current_date + 25, true, now() - interval '4 days', 'v1', 'Aceite para procedimento e acompanhamento.', '{"objetivo_principal":"Suavizacao de rugas","queixa_principal":"Regiao frontal","hipertensao":false,"diabetes":false}'::jsonb),
    (v_clinica_id, 'Carla Mendes', '11944443333', 'carla.mendes@demo.com', '55566677788', date '1990-11-07', 'Rua Harmonia, 300', 'Google', 'ativo', 'Cliente de recorrencia facial.', true, now() - interval '30 days', 'Pele oleosa com comedoes.', null, null, null, 'Limpeza recorrente.', current_date + 7, true, now() - interval '29 days', 'v1', 'Aceite de acompanhamento facial.', '{"objetivo_principal":"Controle de oleosidade","queixa_principal":"Cravos recorrentes","gestante":false,"usa_acidos":false}'::jsonb);

  insert into public.cliente_consentimentos (clinica_id, cliente_id, tipo, titulo, versao, texto, aceito, aceito_em, aceito_por_nome, observacoes)
  select v_clinica_id, cli.id, 'procedimento', 'Termo de consentimento para toxina botulinica', 'v1', 'Cliente declara ter recebido explicacoes sobre objetivos, cuidados, riscos comuns, alternativas e necessidade de retorno. Autoriza o tratamento dos dados de saude/esteticos para atendimento e acompanhamento.', true, now() - interval '18 days', cli.nome, 'Registrado na demonstracao.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Mariana Costa'
  union all
  select v_clinica_id, cli.id, 'imagem', 'Autorizacao de imagem para acompanhamento corporal', 'v1', 'Cliente autoriza armazenamento de imagens antes/depois para acompanhamento clinico interno. Uso em marketing exige visibilidade marcada como marketing.', true, now() - interval '9 days', cli.nome, 'Autorizacao restrita ao prontuario.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro'
  union all
  select v_clinica_id, cli.id, 'lgpd', 'Consentimento LGPD e dados sensiveis', 'v1', 'Cliente autoriza tratamento de dados pessoais e sensiveis para prestacao do atendimento estetico, agenda, prontuario, comunicacao e obrigacoes legais.', true, now() - interval '4 days', cli.nome, 'Aceite presencial.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Renata Lima';

  insert into public.crm_oportunidades (clinica_id, cliente_id, nome, telefone, email, origem, status, valor_estimado, proxima_acao_em, proxima_acao, observacoes)
  select v_clinica_id, cli.id, cli.nome, cli.telefone, cli.email, 'instagram', 'avaliacao_marcada', 980, current_date + 1, 'Confirmar avaliacao facial e enviar preparos.', 'Lead veio do Instagram e ja tem interesse em protocolo facial.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Mariana Costa'
  union all
  select v_clinica_id, cli.id, cli.nome, cli.telefone, cli.email, 'indicacao', 'em_negociacao', 1500, current_date + 2, 'Enviar condicoes do pacote corporal.', 'Cliente comparando pacote de drenagem.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro'
  union all
  select v_clinica_id, cli.id, cli.nome, cli.telefone, cli.email, 'trafego_pago', 'lead', 340, current_date + 3, 'Agendar avaliacao para manchas.', 'Lead de campanha para peeling leve.'
  from public.clientes cli
  where cli.clinica_id = v_clinica_id and cli.nome = 'Juliana Rocha'
  union all
  select v_clinica_id, null, 'Fernanda Alves', '11933332222', 'fernanda.alves@demo.com', 'whatsapp', 'lead', 890, current_date + 1, 'Responder duvida sobre toxina botulinica.', 'Ainda nao virou cliente; oportunidade pura do CRM.'
  union all
  select v_clinica_id, null, 'Patricia Gomes', '11922221111', null, 'google', 'perdido', 260, null, null, 'Perdida por preco. Pode entrar em reativacao futura.';

  insert into public.cliente_fotos (clinica_id, cliente_id, tipo, titulo, url, observacoes, data_foto, autorizacao_uso_imagem, visibilidade, consentimento_id)
  select v_clinica_id, cli.id, 'antes', 'Antes - avaliacao corporal', 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=80', 'Imagem demo para acompanhamento.', current_date - 9, true, 'restrito', consent.id
  from public.clientes cli
  left join public.cliente_consentimentos consent on consent.cliente_id = cli.id and consent.tipo = 'imagem'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro'
  union all
  select v_clinica_id, cli.id, 'depois', 'Evolucao - sessao 3', 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80', 'Imagem demo para demonstrar comparativo.', current_date - 1, true, 'restrito', consent.id
  from public.clientes cli
  left join public.cliente_consentimentos consent on consent.cliente_id = cli.id and consent.tipo = 'imagem'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro';

  insert into public.agendamentos (clinica_id, cliente_id, profissional_id, procedimento_id, inicio, fim, status, valor, pagamento_status, forma_pagamento, valor_pago, data_pagamento, observacoes)
  select v_clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours 45 minutes', 'confirmado', proc.preco, 'pago', 'pix', proc.preco, now() - interval '1 hour', 'Atendimento de demonstracao.'
  from public.clientes cli
  join public.profissionais prof on prof.clinica_id = v_clinica_id and prof.nome = 'Dra. Helena Martins'
  join public.procedimentos proc on proc.clinica_id = v_clinica_id and proc.nome = 'Toxina botulinica'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Mariana Costa'
  union all
  select v_clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '11 hours', date_trunc('day', now()) + interval '12 hours', 'agendado', proc.preco, 'pendente', null, 0, null, 'Confirmar pelo WhatsApp.'
  from public.clientes cli
  join public.profissionais prof on prof.clinica_id = v_clinica_id and prof.nome = 'Camila Duarte'
  join public.procedimentos proc on proc.clinica_id = v_clinica_id and proc.nome = 'Drenagem linfatica'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro'
  union all
  select v_clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '14 hours', date_trunc('day', now()) + interval '14 hours 50 minutes', 'confirmado', proc.preco, 'parcial', 'cartao', 150, now() - interval '2 hours', 'Cliente avaliando pacote.'
  from public.clientes cli
  join public.profissionais prof on prof.clinica_id = v_clinica_id and prof.nome = 'Bianca Alves'
  join public.procedimentos proc on proc.clinica_id = v_clinica_id and proc.nome = 'Peeling quimico leve'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Juliana Rocha'
  union all
  select v_clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) + interval '1 day 10 hours', date_trunc('day', now()) + interval '1 day 11 hours 15 minutes', 'agendado', proc.preco, 'pendente', null, 0, null, 'Demo de agendamento futuro.'
  from public.clientes cli
  join public.profissionais prof on prof.clinica_id = v_clinica_id and prof.nome = 'Dra. Helena Martins'
  join public.procedimentos proc on proc.clinica_id = v_clinica_id and proc.nome = 'Bioestimulador corporal'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Renata Lima'
  union all
  select v_clinica_id, cli.id, prof.id, proc.id, date_trunc('day', now()) - interval '3 days' + interval '16 hours', date_trunc('day', now()) - interval '3 days' + interval '17 hours 30 minutes', 'concluido', proc.preco, 'pago', 'dinheiro', proc.preco, now() - interval '3 days', 'Historico concluido para demonstrar prontuario.'
  from public.clientes cli
  join public.profissionais prof on prof.clinica_id = v_clinica_id and prof.nome = 'Bianca Alves'
  join public.procedimentos proc on proc.clinica_id = v_clinica_id and proc.nome = 'Limpeza de pele premium'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Carla Mendes';

  insert into public.pagamentos_clinica (clinica_id, cliente_id, agendamento_id, profissional_id, descricao, valor, valor_pago, status, forma_pagamento, data_pagamento, observacoes)
  select ag.clinica_id, ag.cliente_id, ag.id, ag.profissional_id, 'Pagamento de atendimento: ' || coalesce(proc.nome, 'procedimento'), ag.valor, ag.valor_pago, ag.pagamento_status, ag.forma_pagamento, ag.data_pagamento, 'Gerado pelo seed demo.'
  from public.agendamentos ag
  left join public.procedimentos proc on proc.id = ag.procedimento_id
  where ag.clinica_id = v_clinica_id
    and ag.valor_pago > 0;

  insert into public.pacotes_clinica (clinica_id, nome, descricao, procedimento_id, quantidade_sessoes, valor, validade_dias)
  select v_clinica_id, 'Pacote Drenagem 10 sessoes', 'Pacote corporal para recorrencia.', proc.id, 10, 1500, 120
  from public.procedimentos proc
  where proc.clinica_id = v_clinica_id and proc.nome = 'Drenagem linfatica'
  union all
  select v_clinica_id, 'Protocolo Facial Premium', 'Limpeza, peeling leve e retorno acompanhado.', proc.id, 4, 980, 90
  from public.procedimentos proc
  where proc.clinica_id = v_clinica_id and proc.nome = 'Limpeza de pele premium';

  insert into public.cliente_pacotes (clinica_id, cliente_id, pacote_id, nome_pacote, sessoes_total, sessoes_utilizadas, valor_total, status, data_compra, validade_em, observacoes)
  select v_clinica_id, cli.id, pac.id, pac.nome, pac.quantidade_sessoes, 3, pac.valor, 'ativo', current_date - 12, current_date + 108, 'Demo de pacote ativo com sessoes consumidas.'
  from public.clientes cli
  join public.pacotes_clinica pac on pac.clinica_id = v_clinica_id and pac.nome = 'Pacote Drenagem 10 sessoes'
  where cli.clinica_id = v_clinica_id and cli.nome = 'Ana Paula Ribeiro';
end;
$demo$;
