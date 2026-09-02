import { createHash } from "node:crypto";

export const DEMO_DATASET_VERSION = 4;
export const DEMO_TIME_ZONE = "America/Bahia";

// Keep this list aligned with app_private.demo_reset_registry in the demo migration.
export const DEMO_MUTABLE_TABLES = [
  "automation_action_receipts",
  "automation_waits",
  "automation_run_steps",
  "automation_event_consumptions",
  "automation_tasks",
  "automation_runs",
  "automation_versions",
  "automations",
  "finance_comissao_pagamento_itens",
  "finance_comissao_pagamentos",
  "finance_transferencias",
  "finance_conciliacoes",
  "finance_movimentos",
  "finance_liquidacao_parcelas",
  "finance_comissoes",
  "finance_competencias",
  "finance_liquidacoes",
  "finance_recebivel_parcelas",
  "finance_pagavel_parcelas",
  "finance_recebiveis",
  "finance_pagaveis",
  "finance_recorrencias",
  "finance_orcamentos",
  "finance_comissao_regras",
  "finance_configuracoes",
  "finance_fornecedores",
  "finance_categorias",
  "finance_centros_custo",
  "finance_contas",
  "pagamentos_loja_clinica",
  "estoque_reservas_clinica",
  "estoque_movimentos_clinica",
  "pedido_itens_clinica",
  "carrinhos_abandonados_clinica",
  "pedidos_clinica",
  "cupons_clinica",
  "produtos_clinica",
  "crm_opportunity_tags",
  "crm_opportunity_appointments",
  "crm_activities",
  "crm_opportunity_events",
  "crm_saved_views",
  "site_agendamentos_publicos",
  "pagamentos_clinica",
  "cliente_pacotes",
  "cliente_fotos",
  "cliente_consentimentos",
  "eventos_analiticos",
  "metas_clinica",
  "agendamentos",
  "crm_oportunidades",
  "crm_tags",
  "crm_lost_reasons",
  "crm_pipeline_stages",
  "crm_pipelines",
  "pacotes_clinica",
  "procedimentos",
  "profissionais",
  "clientes",
];

export function deterministicDemoId(clinicId, key) {
  const hex = createHash("sha256").update(`${clinicId}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function localParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, Number(item.value)]));
}

function localDate(now, offsetDays = 0) {
  const { year, month, day } = localParts(now);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
  return date.toISOString().slice(0, 10);
}

function localTimestamp(now, offsetDays, hour, minute = 0) {
  return new Date(`${localDate(now, offsetDays)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`).toISOString();
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function monthBounds(now) {
  const { year, month } = localParts(now);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
  return { start, end };
}

function monthStartForDate(value) {
  return `${String(value).slice(0, 7)}-01`;
}

export function buildDemoDataset({ clinicId, userId, now = new Date() }) {
  const id = (key) => deterministicDemoId(clinicId, key);
  const { start: monthStart, end: monthEnd } = monthBounds(now);
  const table = Object.fromEntries(DEMO_MUTABLE_TABLES.map((name) => [name, []]));

  const automationDefinitions = [
    {
      key: "lead-follow-up", name: "Follow-up de novo lead", trigger: "crm.opportunity.created",
      steps: [
        { id: "wait_10m", type: "wait", mode: "duration", amount: 10, unit: "minutes", until: null },
        { id: "create_follow_up", type: "action", actionType: "crm.create_follow_up", params: { title: "Entrar em contato com novo lead", due_in_minutes: 0 } },
      ],
    },
    {
      key: "booking-reminder", name: "Lembrete de agendamento", trigger: "booking.created",
      steps: [{ id: "register_reminder", type: "action", actionType: "agenda.register_reminder", params: { channel: "interno", message: "Confirmar o próximo atendimento." } }],
    },
    {
      key: "overdue-recovery", name: "Recuperação de inadimplência", trigger: "finance.receivable.overdue",
      steps: [{ id: "collection_task", type: "action", actionType: "finance.create_collection_task", params: { title: "Cobrar recebível vencido", due_in_minutes: 0 } }],
    },
  ].map((item) => ({ ...item, definition: { schemaVersion: 1, trigger: { type: item.trigger, reentry: "deny_self" }, conditions: { kind: "group", operator: "AND", conditions: [] }, steps: item.steps } }));

  table.automations = automationDefinitions.map((item) => ({
    id: id(`automation:${item.key}`), clinica_id: clinicId, name: item.name,
    description: "Automação fictícia e pausada para demonstração segura.", status: "paused",
    trigger_type: item.trigger, draft_definition: item.definition, current_version_id: null,
    owner_id: userId, metadata: { demo: true },
  }));
  table.automation_versions = automationDefinitions.map((item) => ({
    id: id(`automation-version:${item.key}`), clinica_id: clinicId,
    automation_id: id(`automation:${item.key}`), version: 1, trigger_type: item.trigger,
    definition: item.definition,
    definition_hash: createHash("sha256").update(JSON.stringify(item.definition)).digest("hex"),
    status: "active", created_by: userId,
  }));
  const automationRunSpecs = [
    ["lead-follow-up", "waiting", -2, 0],
    ["booking-reminder", "completed", -1, 1],
    ["overdue-recovery", "failed", 0, 1],
  ];
  table.automation_runs = automationRunSpecs.map(([key, status, offset, cursor]) => {
    const item = automationDefinitions.find((candidate) => candidate.key === key);
    return {
      id: id(`automation-run:${key}`), clinica_id: clinicId,
      automation_id: id(`automation:${key}`), automation_version_id: id(`automation-version:${key}`),
      source_event_id: null, source_event_type: item.trigger, entity_type: "demo", entity_id: null,
      status, current_step_index: cursor, execution_plan: item.steps,
      context_snapshot: { event: { type: item.trigger, clinica_id: clinicId }, clinic_metadata: { demo: true } },
      correlation_id: `demo:${key}`, automation_depth: 0, attempts: status === "failed" ? 2 : 1,
      next_attempt_at: localTimestamp(now, offset, 10), started_at: localTimestamp(now, offset, 10),
      completed_at: ["completed", "failed"].includes(status) ? localTimestamp(now, offset, 10, 5) : null,
      failure_code: status === "failed" ? "DEMO_CONFIGURATION_REQUIRED" : null,
      failure_message: status === "failed" ? "Execução fictícia para demonstrar o diagnóstico de falhas." : null,
    };
  });
  table.automation_run_steps = automationRunSpecs.flatMap(([key, status, offset]) => {
    const item = automationDefinitions.find((candidate) => candidate.key === key);
    return item.steps.map((step, index) => ({
      id: id(`automation-step:${key}:${step.id}`), clinica_id: clinicId, run_id: id(`automation-run:${key}`),
      step_id: step.id, step_index: index, step_type: step.type, action_type: step.actionType || null,
      status: status === "waiting" ? (step.type === "wait" ? "waiting" : "queued") : status === "failed" && index === item.steps.length - 1 ? "failed" : "completed",
      attempt: 1, result: status === "waiting" && step.type === "wait" ? { resume_at: localTimestamp(now, 1, 10) } : { demo: true },
      error_code: status === "failed" && index === item.steps.length - 1 ? "DEMO_CONFIGURATION_REQUIRED" : null,
      error_message: status === "failed" && index === item.steps.length - 1 ? "Falha fictícia da demonstração." : null,
      started_at: localTimestamp(now, offset, 10, index), completed_at: status === "waiting" ? null : localTimestamp(now, offset, 10, index + 1),
    }));
  });
  table.automation_waits = [{
    id: id("automation-wait:lead-follow-up"), clinica_id: clinicId,
    run_id: id("automation-run:lead-follow-up"), step_id: "wait_10m",
    resume_at: localTimestamp(now, 1, 10), status: "pending", attempts: 0,
  }];
  table.automation_tasks = [{
    id: id("automation-task:overdue-recovery"), clinica_id: clinicId,
    run_id: id("automation-run:overdue-recovery"), entity_type: "finance_receivable", entity_id: null,
    title: "Revisar cobrança demonstrativa", description: "Tarefa fictícia criada pelo Motor 2.0.",
    due_at: localTimestamp(now, 1, 14), status: "pending", assigned_to: userId,
  }];
  table.automation_action_receipts = [{
    id: id("automation-receipt:booking-reminder"), clinica_id: clinicId,
    run_id: id("automation-run:booking-reminder"), step_id: "register_reminder",
    action_type: "agenda.register_reminder", idempotency_key: `demo:${clinicId}:booking-reminder`,
    status: "completed", entity_type: "booking", entity_id: id("appointment:0"),
    result: { demo: true, delivered: true }, completed_at: localTimestamp(now, -1, 10, 5),
  }];

  const professionalSpecs = [
    ["helena", "Dra. Helena Martins", "Harmonização facial", 18],
    ["camila", "Camila Duarte", "Estética corporal", 15],
    ["marina", "Marina Lopes", "Dermatofuncional", 16],
    ["rafaela", "Rafaela Nunes", "Cílios e sobrancelhas", 12],
    ["isabela", "Isabela Freitas", "Estética facial", 14],
    ["beatriz", "Beatriz Andrade", "Massoterapia", 13],
  ];
  table.profissionais = professionalSpecs.map(([key, nome, especialidade, comissao], index) => ({
    id: id(`professional:${key}`), clinica_id: clinicId, nome, especialidade,
    telefone: `7799999000${index + 1}`, email: `${key}.demo@nexawi.com.br`,
    comissao_percentual: comissao, ativo: true, observacoes: "Profissional fictícia da demonstração.",
  }));

  const procedureSpecs = [
    ["limpeza", "Limpeza de pele premium", "Facial", 90, 260, 20, "evaluation"],
    ["botox", "Botox", "Injetáveis", 45, 890, 30, "direct_sale"],
    ["harmonizacao", "Harmonização facial", "Injetáveis", 90, 1800, 35, "opportunity"],
    ["bioestimulador", "Bioestimulador de colágeno", "Facial", 60, 1200, 30, "opportunity"],
    ["microderme", "Microderme corporal", "Corporal", 90, 699, 30, "evaluation"],
    ["drenagem", "Drenagem linfática", "Corporal", 60, 180, 0, "direct_sale"],
    ["cilios", "Extensão de cílios", "Facial", 120, 250, 0, "direct_sale"],
    ["peeling", "Peeling químico", "Facial", 60, 420, 25, "evaluation"],
    ["skinbooster", "Skinbooster", "Injetáveis", 60, 950, 30, "opportunity"],
    ["massagem", "Massagem relaxante", "Bem-estar", 60, 190, 0, "direct_sale"],
    ["radiofrequencia", "Radiofrequência", "Corporal", 50, 320, 20, "evaluation"],
    ["sobrancelha", "Design de sobrancelhas", "Facial", 40, 95, 0, "direct_sale"],
  ];
  table.procedimentos = procedureSpecs.map(([key, nome, categoria, duracao, preco, sinal, behavior], index) => ({
    id: id(`procedure:${key}`), clinica_id: clinicId, nome, categoria, duracao_minutos: duracao, preco,
    descricao: `Protocolo demonstrativo de ${nome.toLowerCase()} com avaliação individualizada.`, ativo: true,
    cuidados_antes: "Informe alergias, medicamentos e condições de saúde durante a avaliação.",
    cuidados_depois: "Siga as orientações da profissional e evite exposição excessiva nas primeiras horas.",
    publicado_site: true, destaque_site: index < 5, sinal_percentual: sinal, sinal_valor: 0,
    ordem_site: index + 1, crm_booking_behavior: behavior,
  }));

  const clientSpecs = [
    ["mariana", "Mariana Costa", "Instagram", "ativo"], ["ana", "Ana Paula Ribeiro", "Indicação", "ativo"],
    ["juliana", "Juliana Rocha", "Tráfego pago", "lead"], ["carla", "Carla Mendes", "Google", "ativo"],
    ["patricia", "Patrícia Almeida", "WhatsApp", "ativo"], ["renata", "Renata Souza", "Instagram", "lead"],
    ["fernanda", "Fernanda Lima", "Indicação", "ativo"], ["luana", "Luana Martins", "Google", "ativo"],
    ["bianca", "Bianca Teixeira", "Instagram", "lead"], ["aline", "Aline Barbosa", "WhatsApp", "ativo"],
    ["sofia", "Sofia Nascimento", "Tráfego pago", "ativo"], ["daniela", "Daniela Pires", "Indicação", "ativo"],
    ["gabriela", "Gabriela Moraes", "Instagram", "ativo"], ["larissa", "Larissa Oliveira", "Google", "ativo"],
    ["vanessa", "Vanessa Ferreira", "Indicação", "ativo"], ["leticia", "Letícia Cardoso", "WhatsApp", "ativo"],
    ["natalia", "Natália Santos", "Instagram", "ativo"], ["bruna", "Bruna Carvalho", "Google", "ativo"],
    ["debora", "Débora Azevedo", "Tráfego pago", "ativo"], ["monique", "Monique Ramos", "Indicação", "inativo"],
    ["priscila", "Priscila Correia", "Instagram", "ativo"], ["tatiane", "Tatiane Vieira", "WhatsApp", "ativo"],
    ["raquel", "Raquel Gomes", "Google", "ativo"], ["elaine", "Elaine Castro", "Indicação", "ativo"],
    ["cristiane", "Cristiane Reis", "Instagram", "ativo"], ["simone", "Simone Araújo", "Tráfego pago", "inativo"],
    ["adriana", "Adriana Farias", "WhatsApp", "ativo"], ["luciana", "Luciana Matos", "Google", "ativo"],
    ["marcela", "Marcela Cunha", "Indicação", "ativo"], ["flavia", "Flávia Teles", "Instagram", "ativo"],
    ["viviane", "Viviane Brito", "Google", "ativo"], ["erika", "Erika Peixoto", "WhatsApp", "ativo"],
    ["claudia", "Cláudia Neves", "Indicação", "ativo"], ["michele", "Michele Xavier", "Tráfego pago", "inativo"],
    ["sandra", "Sandra Almeida", "Google", "ativo"], ["rosana", "Rosana Dias", "Instagram", "ativo"],
  ];
  table.clientes = clientSpecs.map(([key, nome, origem, status], index) => ({
    id: id(`client:${key}`), clinica_id: clinicId, nome, origem, status,
    telefone: `77988${String(887777 - index * 1111).padStart(6, "0")}`.slice(0, 11),
    email: `${key}.demo@nexawi.com.br`, cpf: `00000000${String(index + 10).padStart(3, "0")}`,
    data_nascimento: `199${index % 10}-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 18) + 1).padStart(2, "0")}`,
    observacoes: "Cadastro fictício para demonstração comercial.", consentimento_lgpd: true,
    data_consentimento_lgpd: localTimestamp(now, status === "lead" ? -(3 + index) : -(60 + index * 18), 10),
    observacoes_clinicas: "Registro demonstrativo para apresentação do prontuário.",
    alergias: index % 4 === 0 ? "Pele sensível." : null,
    contraindicacoes: index % 5 === 0 ? "Avaliação obrigatória antes de procedimentos agressivos." : null,
    retorno_recomendado_em: localDate(now, index + 8), termo_consentimento_aceito: true,
    termo_consentimento_aceito_em: localTimestamp(now, status === "lead" ? -(2 + index) : -(58 + index * 18), 11),
    anamnese: { objetivo_principal: index % 2 ? "Protocolo corporal" : "Rejuvenescimento facial", gestante: false, diabetes: false },
    created_at: localTimestamp(now, status === "lead" ? -(3 + index) : -(60 + index * 18), 10),
  }));

  const professional = Object.fromEntries(professionalSpecs.map(([key]) => [key, id(`professional:${key}`)]));
  const procedure = Object.fromEntries(procedureSpecs.map(([key]) => [key, id(`procedure:${key}`)]));
  const client = Object.fromEntries(clientSpecs.map(([key]) => [key, id(`client:${key}`)]));

  table.pacotes_clinica = [
    { id: id("package:facial"), clinica_id: clinicId, nome: "Jornada Facial Premium", descricao: "Botox, limpeza e bioestimulador.", procedimento_id: procedure.botox, procedimento_ids: [procedure.botox, procedure.limpeza, procedure.bioestimulador], quantidade_sessoes: 5, valor: 2490, validade_dias: 180, ativo: true },
    { id: id("package:corporal"), clinica_id: clinicId, nome: "Protocolo Corporal 360", descricao: "Microderme e drenagem.", procedimento_id: procedure.microderme, procedimento_ids: [procedure.microderme, procedure.drenagem], quantidade_sessoes: 8, valor: 1990, validade_dias: 150, ativo: true },
    { id: id("package:skin"), clinica_id: clinicId, nome: "Pele Renovada", descricao: "Limpeza, peeling e skinbooster.", procedimento_id: procedure.peeling, procedimento_ids: [procedure.limpeza, procedure.peeling, procedure.skinbooster], quantidade_sessoes: 6, valor: 2790, validade_dias: 210, ativo: true },
    { id: id("package:wellness"), clinica_id: clinicId, nome: "Bem-estar Mensal", descricao: "Massagens e drenagens recorrentes.", procedimento_id: procedure.massagem, procedimento_ids: [procedure.massagem, procedure.drenagem], quantidade_sessoes: 10, valor: 1590, validade_dias: 240, ativo: true },
  ];
  table.cliente_pacotes = [
    { id: id("client-package:ana"), clinica_id: clinicId, cliente_id: client.ana, pacote_id: id("package:corporal"), nome_pacote: "Protocolo Corporal 360", sessoes_total: 8, sessoes_utilizadas: 3, valor_total: 1990, status: "ativo", data_compra: localDate(now, -22), validade_em: localDate(now, 128) },
    { id: id("client-package:fernanda"), clinica_id: clinicId, cliente_id: client.fernanda, pacote_id: id("package:facial"), nome_pacote: "Jornada Facial Premium", sessoes_total: 5, sessoes_utilizadas: 2, valor_total: 2490, status: "ativo", data_compra: localDate(now, -16), validade_em: localDate(now, 164) },
    { id: id("client-package:gabriela"), clinica_id: clinicId, cliente_id: client.gabriela, pacote_id: id("package:skin"), nome_pacote: "Pele Renovada", sessoes_total: 6, sessoes_utilizadas: 4, valor_total: 2790, status: "ativo", data_compra: localDate(now, -80), validade_em: localDate(now, 130) },
    { id: id("client-package:larissa"), clinica_id: clinicId, cliente_id: client.larissa, pacote_id: id("package:wellness"), nome_pacote: "Bem-estar Mensal", sessoes_total: 10, sessoes_utilizadas: 7, valor_total: 1590, status: "ativo", data_compra: localDate(now, -110), validade_em: localDate(now, 130) },
    { id: id("client-package:vanessa"), clinica_id: clinicId, cliente_id: client.vanessa, pacote_id: id("package:facial"), nome_pacote: "Jornada Facial Premium", sessoes_total: 5, sessoes_utilizadas: 5, valor_total: 2490, status: "finalizado", data_compra: localDate(now, -310), validade_em: localDate(now, -130) },
    { id: id("client-package:leticia"), clinica_id: clinicId, cliente_id: client.leticia, pacote_id: id("package:corporal"), nome_pacote: "Protocolo Corporal 360", sessoes_total: 8, sessoes_utilizadas: 8, valor_total: 1990, status: "finalizado", data_compra: localDate(now, -420), validade_em: localDate(now, -270) },
    { id: id("client-package:natalia"), clinica_id: clinicId, cliente_id: client.natalia, pacote_id: id("package:skin"), nome_pacote: "Pele Renovada", sessoes_total: 6, sessoes_utilizadas: 1, valor_total: 2790, status: "cancelado", data_compra: localDate(now, -190), validade_em: localDate(now, 20) },
    { id: id("client-package:bruna"), clinica_id: clinicId, cliente_id: client.bruna, pacote_id: id("package:wellness"), nome_pacote: "Bem-estar Mensal", sessoes_total: 10, sessoes_utilizadas: 10, valor_total: 1590, status: "finalizado", data_compra: localDate(now, -560), validade_em: localDate(now, -320) },
  ];

  table.produtos_clinica = [
    { id: id("product:serum"), clinica_id: clinicId, nome: "Sérum antioxidante", sku: "DEMO-SERUM", categoria: "Home care", descricao: "Sérum facial demonstrativo.", custo: 62, preco: 149, estoque_atual: 18, estoque_minimo: 5, publicado_site: true, ativo: true },
    { id: id("product:protetor"), clinica_id: clinicId, nome: "Protetor solar premium", sku: "DEMO-FPS", categoria: "Home care", descricao: "Proteção diária para protocolos faciais.", custo: 48, preco: 119, estoque_atual: 12, estoque_minimo: 4, publicado_site: true, ativo: true },
    { id: id("product:kit"), clinica_id: clinicId, nome: "Kit pós-procedimento", sku: "DEMO-KIT", categoria: "Kits", descricao: "Cuidados essenciais após o atendimento.", custo: 85, preco: 219, estoque_atual: 7, estoque_reservado: 1, estoque_minimo: 3, publicado_site: true, ativo: true },
    { id: id("product:sabonete"), clinica_id: clinicId, nome: "Sabonete facial suave", sku: "DEMO-SAB", categoria: "Home care", descricao: "Limpeza diária para peles sensíveis.", custo: 29, preco: 79, estoque_atual: 24, estoque_minimo: 8, publicado_site: true, ativo: true },
    { id: id("product:hidratante"), clinica_id: clinicId, nome: "Hidratante reparador", sku: "DEMO-HIDRA", categoria: "Home care", descricao: "Hidratação intensiva pós-procedimento.", custo: 44, preco: 109, estoque_atual: 16, estoque_minimo: 5, publicado_site: true, ativo: true },
    { id: id("product:mascara"), clinica_id: clinicId, nome: "Máscara calmante", sku: "DEMO-MASC", categoria: "Home care", descricao: "Máscara calmante para rotina semanal.", custo: 38, preco: 99, estoque_atual: 4, estoque_minimo: 6, publicado_site: true, ativo: true },
    { id: id("product:oleo"), clinica_id: clinicId, nome: "Óleo corporal nutritivo", sku: "DEMO-OLEO", categoria: "Corporal", descricao: "Cuidado corporal para uso diário.", custo: 36, preco: 89, estoque_atual: 21, estoque_minimo: 6, publicado_site: true, ativo: true },
    { id: id("product:necessaire"), clinica_id: clinicId, nome: "Nécessaire de autocuidado", sku: "DEMO-NEC", categoria: "Kits", descricao: "Kit presenteável da clínica.", custo: 52, preco: 139, estoque_atual: 9, estoque_minimo: 4, publicado_site: true, ativo: true },
  ];
  table.cupons_clinica = [{ id: id("coupon:BEMVINDA"), clinica_id: clinicId, codigo: "BEMVINDA", descricao: "Cupom demonstrativo", tipo: "percentual", valor: 10, pedido_minimo: 100, limite_usos: 50, usos: 8, inicia_em: localTimestamp(now, -20, 8), termina_em: localTimestamp(now, 30, 23, 59), ativo: true }];
  table.pedidos_clinica = [
    { id: id("order:paid"), clinica_id: clinicId, cliente_id: client.mariana, status: "concluido", pagamento_status: "pago", entrega_tipo: "retirada", nome_cliente: "Mariana Costa", telefone_cliente: "77988887777", email_cliente: "mariana.demo@nexawi.com.br", subtotal: 268, desconto: 0, frete: 0, total: 268, forma_pagamento: "PIX", pago_em: localTimestamp(now, -3, 13), origem: { source: "site_demo" }, observacoes: "Pedido demonstrativo pago." },
    { id: id("order:pending"), clinica_id: clinicId, cliente_id: client.bianca, cupom_id: id("coupon:BEMVINDA"), status: "aguardando_pagamento", pagamento_status: "pendente", entrega_tipo: "retirada", nome_cliente: "Bianca Teixeira", telefone_cliente: "77910101010", email_cliente: "bianca.demo@nexawi.com.br", subtotal: 219, desconto: 21.9, frete: 0, total: 197.1, cupom_codigo: "BEMVINDA", forma_pagamento: "PIX", expiracao_reserva_em: localTimestamp(now, 1, 18), origem: { source: "instagram", campaign: "home_care_demo" }, observacoes: "Pedido aguardando pagamento." },
  ];
  table.pedido_itens_clinica = [
    { id: id("order-item:paid:serum"), clinica_id: clinicId, pedido_id: id("order:paid"), produto_id: id("product:serum"), nome_produto: "Sérum antioxidante", sku: "DEMO-SERUM", quantidade: 1, valor_unitario: 149, desconto: 0, total: 149 },
    { id: id("order-item:paid:fps"), clinica_id: clinicId, pedido_id: id("order:paid"), produto_id: id("product:protetor"), nome_produto: "Protetor solar premium", sku: "DEMO-FPS", quantidade: 1, valor_unitario: 119, desconto: 0, total: 119 },
    { id: id("order-item:pending:kit"), clinica_id: clinicId, pedido_id: id("order:pending"), produto_id: id("product:kit"), nome_produto: "Kit pós-procedimento", sku: "DEMO-KIT", quantidade: 1, valor_unitario: 219, desconto: 21.9, total: 197.1 },
  ];
  table.pagamentos_loja_clinica = [
    { id: id("shop-payment:paid"), clinica_id: clinicId, cliente_id: client.mariana, pedido_id: id("order:paid"), valor: 268, forma: "pix", status: "pago", provedor: "demo", provedor_pagamento_id: `demo-paid-${id("order:paid")}`, pago_em: localTimestamp(now, -3, 13), observacoes: "Pagamento fictício." },
    { id: id("shop-payment:pending"), clinica_id: clinicId, cliente_id: client.bianca, pedido_id: id("order:pending"), valor: 197.1, forma: "pix", status: "pendente", provedor: "demo", provedor_pagamento_id: `demo-pending-${id("order:pending")}`, vencimento_em: localTimestamp(now, 1, 18), observacoes: "Cobrança fictícia." },
  ];
  const storeProducts = table.produtos_clinica.slice(0, 7);
  for (let month = 1; month <= 12; month += 1) {
    const product = storeProducts[month % storeProducts.length];
    const clientKey = clientSpecs[(month * 3) % clientSpecs.length][0];
    const orderKey = `history:${month}`;
    const offset = -(month * 30) + 5;
    const quantity = month % 4 === 0 ? 2 : 1;
    const subtotal = Number((Number(product.preco) * quantity).toFixed(2));
    const refunded = month === 7;
    const orderId = id(`order:${orderKey}`);
    table.pedidos_clinica.push({
      id: orderId, clinica_id: clinicId, cliente_id: client[clientKey],
      status: refunded ? "estornado" : "concluido", pagamento_status: refunded ? "estornado" : "pago",
      entrega_tipo: month % 3 === 0 ? "entrega" : "retirada",
      nome_cliente: clientSpecs.find(([key]) => key === clientKey)[1],
      telefone_cliente: table.clientes.find((item) => item.id === client[clientKey]).telefone,
      email_cliente: `${clientKey}.demo@nexawi.com.br`, subtotal, desconto: 0, frete: month % 3 === 0 ? 18 : 0,
      total: subtotal + (month % 3 === 0 ? 18 : 0), forma_pagamento: month % 2 ? "PIX" : "CREDIT_CARD",
      pago_em: localTimestamp(now, offset, 13), origem: { source: month % 2 ? "instagram" : "site_demo", campaign: "home_care" },
      observacoes: refunded ? "Pedido demonstrativo estornado." : "Venda histórica da loja demonstrativa.",
      created_at: localTimestamp(now, offset, 12),
    });
    table.pedido_itens_clinica.push({ id: id(`order-item:${orderKey}`), clinica_id: clinicId, pedido_id: orderId, produto_id: product.id, nome_produto: product.nome, sku: product.sku, quantidade: quantity, valor_unitario: product.preco, desconto: 0, total: subtotal, created_at: localTimestamp(now, offset, 12) });
    table.pagamentos_loja_clinica.push({ id: id(`shop-payment:${orderKey}`), clinica_id: clinicId, cliente_id: client[clientKey], pedido_id: orderId, valor: subtotal + (month % 3 === 0 ? 18 : 0), forma: month % 2 ? "pix" : "cartao_credito", status: refunded ? "estornado" : "pago", provedor: "demo", provedor_pagamento_id: `demo-store-${month}-${clinicId}`, pago_em: localTimestamp(now, offset, 13), observacoes: "Pagamento histórico fictício.", created_at: localTimestamp(now, offset, 12) });
    table.estoque_reservas_clinica.push({ id: id(`stock-reservation:${orderKey}`), clinica_id: clinicId, pedido_id: orderId, produto_id: product.id, quantidade: quantity, status: "convertida", expira_em: localTimestamp(now, offset, 14), finalizada_em: localTimestamp(now, offset, 13), created_at: localTimestamp(now, offset, 12) });
    table.estoque_movimentos_clinica.push({ id: id(`stock-movement:${orderKey}:sale`), clinica_id: clinicId, produto_id: product.id, pedido_id: orderId, tipo: "venda", quantidade: -quantity, estoque_anterior: 30 + month, estoque_posterior: 30 + month - quantity, observacoes: "Baixa histórica por venda demonstrativa.", created_by: userId, created_at: localTimestamp(now, offset, 13) });
    if (refunded) {
      table.estoque_movimentos_clinica.push({ id: id(`stock-movement:${orderKey}:refund`), clinica_id: clinicId, produto_id: product.id, pedido_id: orderId, tipo: "estorno", quantidade: quantity, estoque_anterior: 30 + month - quantity, estoque_posterior: 30 + month, observacoes: "Reposição por estorno demonstrativo.", created_by: userId, created_at: localTimestamp(now, offset + 1, 10) });
    }
  }
  table.estoque_reservas_clinica.push({ id: id("stock-reservation:pending"), clinica_id: clinicId, pedido_id: id("order:pending"), produto_id: id("product:kit"), quantidade: 1, status: "ativa", expira_em: localTimestamp(now, 1, 18) });
  table.estoque_movimentos_clinica.push({ id: id("stock-movement:pending"), clinica_id: clinicId, produto_id: id("product:kit"), pedido_id: id("order:pending"), tipo: "reserva", quantidade: 0, estoque_anterior: 7, estoque_posterior: 7, observacoes: "Reserva temporária do pedido pendente.", created_by: userId });
  table.carrinhos_abandonados_clinica = [
    { id: id("abandoned-cart:active"), clinica_id: clinicId, sessao_token: id("cart-session:active"), token_recuperacao: id("cart-recovery:active"), status: "ativo", nome: "Renata Souza", telefone: table.clientes.find((item) => item.id === client.renata).telefone, email: "renata.demo@nexawi.com.br", consentimento_recuperacao: true, consentimento_em: localTimestamp(now, -1, 16), itens: [{ produto_id: id("product:serum"), nome: "Sérum antioxidante", quantidade: 1, preco: 149 }], subtotal: 149, origem: { source: "instagram" }, ultima_interacao_em: localTimestamp(now, -1, 16), quantidade_lembretes: 0 },
    { id: id("abandoned-cart:recovered"), clinica_id: clinicId, sessao_token: id("cart-session:recovered"), token_recuperacao: id("cart-recovery:recovered"), pedido_id: id("order:history:2"), status: "recuperado", nome: "Fernanda Lima", telefone: table.clientes.find((item) => item.id === client.fernanda).telefone, email: "fernanda.demo@nexawi.com.br", consentimento_recuperacao: true, consentimento_em: localTimestamp(now, -62, 10), itens: [{ produto_id: id("product:protetor"), nome: "Protetor solar premium", quantidade: 1, preco: 119 }], subtotal: 119, origem: { source: "whatsapp" }, ultima_interacao_em: localTimestamp(now, -61, 10), lembrete_enviado_em: localTimestamp(now, -61, 9), quantidade_lembretes: 1, convertido_em: localTimestamp(now, -60, 13) },
    { id: id("abandoned-cart:expired"), clinica_id: clinicId, sessao_token: id("cart-session:expired"), token_recuperacao: id("cart-recovery:expired"), status: "expirado", nome: "Juliana Rocha", telefone: table.clientes.find((item) => item.id === client.juliana).telefone, email: "juliana.demo@nexawi.com.br", consentimento_recuperacao: false, itens: [{ produto_id: id("product:kit"), nome: "Kit pós-procedimento", quantidade: 1, preco: 219 }], subtotal: 219, origem: { source: "google" }, ultima_interacao_em: localTimestamp(now, -90, 15), quantidade_lembretes: 0 },
  ];

  const pipelineId = id("crm:pipeline:commercial");
  const stages = [
    ["new", "Novo lead", "novo-lead", 10, "#38bdf8", 10, "open"],
    ["contacted", "Contato iniciado", "contato-iniciado", 20, "#818cf8", 20, "open"],
    ["qualified", "Qualificado", "qualificado", 30, "#a78bfa", 40, "open"],
    ["evaluation_scheduled", "Avaliação marcada", "avaliacao-marcada", 40, "#f59e0b", 60, "open"],
    ["negotiation", "Em negociação", "em-negociacao", 50, "#fb7185", 80, "open"],
    ["won", "Convertido", "convertido", 60, "#10b981", 100, "won"],
    ["lost", "Perdido", "perdido", 70, "#64748b", 0, "lost"],
  ];
  table.crm_pipelines = [{ id: pipelineId, clinica_id: clinicId, nome: "Pipeline comercial", ativo: true, padrao: true, ordem: 10, created_by: userId }];
  table.crm_pipeline_stages = stages.map(([key, nome, slug, ordem, cor, probabilidade, tipo]) => ({ id: id(`crm:stage:${key}`), clinica_id: clinicId, pipeline_id: pipelineId, nome, slug, ordem, cor, probabilidade, tipo, semantic_key: key, ativo: true }));
  table.crm_lost_reasons = [{ id: id("crm:lost:price"), clinica_id: clinicId, nome: "Preço fora do orçamento", ordem: 10, ativo: true }, { id: id("crm:lost:timing"), clinica_id: clinicId, nome: "Momento inadequado", ordem: 20, ativo: true }];
  table.crm_tags = [{ id: id("crm:tag:vip"), clinica_id: clinicId, nome: "VIP", cor: "#f59e0b" }, { id: id("crm:tag:return"), clinica_id: clinicId, nome: "Retorno", cor: "#10b981" }, { id: id("crm:tag:urgent"), clinica_id: clinicId, nome: "Prioridade", cor: "#ef4444" }];

  const opportunitySpecs = [
    ["renata", "new", 1200, "quente", 82, 0, "Enviar apresentação do protocolo"],
    ["bianca", "new", 890, "morno", 58, 1, "Responder dúvidas pelo WhatsApp"],
    ["juliana", "contacted", 699, "morno", 62, -1, "Confirmar interesse na avaliação"],
    ["sofia", "qualified", 1990, "quente", 88, 1, "Apresentar pacote corporal"],
    ["patricia", "evaluation_scheduled", 1800, "quente", 90, 2, "Realizar avaliação facial"],
    ["luana", "negotiation", 1200, "quente", 85, -2, "Enviar condições de pagamento"],
    ["mariana", "won", 890, "quente", 100, -5, "Cliente convertida"],
    ["carla", "won", 260, "morno", 100, -7, "Retorno confirmado"],
    ["aline", "won", 250, "morno", 100, -3, "Manutenção recorrente"],
    ["ana", "won", 1990, "quente", 100, -6, "Pacote corporal contratado"],
    ["fernanda", "won", 2490, "quente", 100, -4, "Jornada facial contratada"],
    ["daniela", "lost", 1800, "frio", 20, -4, "Retomar em três meses"],
  ];
  opportunitySpecs.push(...clientSpecs.slice(12).map(([clientKey], index) => {
    const lost = index % 5 === 4;
    const values = [260, 420, 890, 1200, 1590, 1990, 2490, 2790];
    return [
      clientKey,
      lost ? "lost" : "won",
      values[index % values.length],
      lost ? "frio" : index % 3 === 0 ? "quente" : "morno",
      lost ? 25 : 100,
      -(45 + index * 24),
      lost ? "Oportunidade encerrada no histórico" : "Tratamento convertido no histórico",
    ];
  }));
  table.crm_oportunidades = opportunitySpecs.map(([clientKey, stageKey, value, temperatura, score, nextOffset, action], index) => {
    const closed = ["won", "lost"].includes(stageKey);
    return {
      id: id(`crm:opportunity:${clientKey}`), clinica_id: clinicId, cliente_id: client[clientKey],
      nome: clientSpecs.find(([key]) => key === clientKey)?.[1], telefone: table.clientes.find((item) => item.id === client[clientKey])?.telefone,
      email: `${clientKey}.demo@nexawi.com.br`, origem: index % 3 === 0 ? "instagram" : index % 3 === 1 ? "whatsapp" : "google",
      status: stageKey === "won" ? "convertido" : stageKey === "lost" ? "perdido" : stageKey === "evaluation_scheduled" ? "avaliacao_marcada" : stageKey === "negotiation" ? "em_negociacao" : "lead",
      valor_estimado: value, proxima_acao_em: closed ? null : localDate(now, nextOffset), proxima_acao: action,
      observacoes: "Oportunidade fictícia do CRM 2.0.", perdido_motivo: stageKey === "lost" ? "Preço fora do orçamento" : null,
      convertido_em: stageKey === "won" ? localTimestamp(now, nextOffset, 16) : null, created_by: userId,
      pipeline_id: pipelineId, stage_id: id(`crm:stage:${stageKey}`), titulo: action, responsavel_id: userId,
      temperatura, score, sort_order: (index + 1) * 1000, valor_fechado: stageKey === "won" ? value : null,
      won_at: stageKey === "won" ? localTimestamp(now, nextOffset, 16) : null,
      lost_at: stageKey === "lost" ? localTimestamp(now, nextOffset, 15) : null,
      lost_reason_id: stageKey === "lost" ? id("crm:lost:price") : null,
      first_response_at: stageKey === "new" ? null : localTimestamp(now, Math.min(nextOffset - 1, -1), 10),
      last_activity_at: localTimestamp(now, Math.min(nextOffset, 0), 11), next_activity_at: closed ? null : localTimestamp(now, nextOffset, 14),
      source: index % 3 === 0 ? "instagram" : index % 3 === 1 ? "whatsapp" : "google", medium: "demo", campaign: "avaliacao_premium",
      utm: { source: "demo", campaign: "avaliacao_premium" }, identificador_externo: `demo-opportunity-${clientKey}`, metadata: { demo: true },
      created_at: localTimestamp(now, Math.min(nextOffset - 7, -1), 9),
    };
  });
  table.crm_activities = opportunitySpecs.filter(([, stage]) => !["won", "lost"].includes(stage)).map(([clientKey, , , , , nextOffset, action], index) => ({
    id: id(`crm:activity:${clientKey}`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), cliente_id: client[clientKey], owner_id: userId,
    tipo: index % 2 ? "whatsapp" : "follow_up", titulo: action, descricao: "Atividade demonstrativa com prazo relativo.",
    due_at: localTimestamp(now, nextOffset, 14), completed_at: nextOffset < 0 ? localTimestamp(now, nextOffset, 12) : null,
    status: nextOffset < 0 ? "completed" : "pending", created_by: userId,
  }));
  table.crm_opportunity_events = opportunitySpecs.flatMap(([clientKey, stageKey, , , , nextOffset]) => [
    { id: id(`crm:event:${clientKey}:created`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), event_type: "created", actor_id: userId, data: { source: "demo" }, occurred_at: localTimestamp(now, Math.min(nextOffset - 7, -2), 9) },
    { id: id(`crm:event:${clientKey}:stage`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), event_type: "stage_changed", actor_id: userId, data: { to: stageKey }, occurred_at: localTimestamp(now, Math.min(nextOffset, -1), 11) },
  ]);
  table.crm_opportunity_tags = [
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:renata"), tag_id: id("crm:tag:urgent"), created_by: userId },
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:mariana"), tag_id: id("crm:tag:vip"), created_by: userId },
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:carla"), tag_id: id("crm:tag:return"), created_by: userId },
  ];
  table.crm_saved_views = [
    { id: id("crm:view:priority"), clinica_id: clinicId, user_id: userId, nome: "Leads prioritários", filters: { temperatura: ["quente"], status: ["open"] }, padrao: true },
    { id: id("crm:view:follow-up"), clinica_id: clinicId, user_id: userId, nome: "Follow-ups vencidos", filters: { activity_status: "overdue" }, padrao: false },
  ];

  const appointmentSpecs = [
    ["mariana", "helena", "botox", -6, 9, "concluido", "pago", "pix", 890],
    ["ana", "camila", "microderme", -5, 14, "concluido", "pago", "cartao", 699],
    ["carla", "helena", "limpeza", -4, 10, "concluido", "pago", "dinheiro", 260],
    ["fernanda", "marina", "bioestimulador", -3, 15, "concluido", "pago", "pix", 1200],
    ["aline", "rafaela", "cilios", -2, 11, "concluido", "pago", "cartao", 250],
    ["daniela", "helena", "harmonizacao", -1, 16, "concluido", "parcial", "pix", 900],
    ["mariana", "helena", "botox", 0, 9, "confirmado", "pendente", null, 0],
    ["ana", "camila", "drenagem", 0, 11, "agendado", "pendente", null, 0],
    ["patricia", "helena", "harmonizacao", 0, 15, "confirmado", "parcial", "pix", 540],
    ["luana", "marina", "bioestimulador", 1, 10, "agendado", "pendente", null, 0],
    ["juliana", "camila", "microderme", 1, 14, "agendado", "pendente", null, 0],
    ["bianca", "helena", "limpeza", 2, 9, "confirmado", "pendente", null, 0],
    ["sofia", "camila", "microderme", 3, 16, "agendado", "pendente", null, 0],
    ["renata", "marina", "bioestimulador", 4, 11, "agendado", "pendente", null, 0],
  ];
  const recentAppointmentCount = appointmentSpecs.length;
  const professionalKeys = professionalSpecs.map(([key]) => key);
  const procedureKeys = procedureSpecs.map(([key]) => key);
  for (let month = 1; month <= 24; month += 1) {
    for (let slot = 0; slot < 7; slot += 1) {
      const clientKey = clientSpecs[(month * 7 + slot) % clientSpecs.length][0];
      const professionalKey = professionalKeys[(month + slot) % professionalKeys.length];
      const procedureKey = procedureKeys[(month * 2 + slot) % procedureKeys.length];
      const offset = -(month * 30) + slot * 3 + (month % 4);
      const status = slot === 6 && month % 3 === 0 ? "faltou" : slot === 5 && month % 4 === 0 ? "cancelado" : "concluido";
      const procedureSpec = procedureSpecs.find(([key]) => key === procedureKey);
      const paid = status === "concluido" ? procedureSpec[4] : 0;
      appointmentSpecs.push([clientKey, professionalKey, procedureKey, offset, 8 + (slot % 9), status, status === "concluido" ? "pago" : "cancelado", status === "concluido" ? ["pix", "cartao", "dinheiro"][slot % 3] : null, paid]);
    }
  }
  table.agendamentos = appointmentSpecs.map(([clientKey, professionalKey, procedureKey, offset, hour, status, paymentStatus, method, paid], index) => {
    const start = localTimestamp(now, offset, hour);
    const procedureSpec = procedureSpecs.find(([key]) => key === procedureKey);
    return { id: id(`appointment:${index}`), clinica_id: clinicId, cliente_id: client[clientKey], profissional_id: professional[professionalKey], procedimento_id: procedure[procedureKey], inicio: start, fim: addMinutes(start, procedureSpec[3]), status, valor: procedureSpec[4], pagamento_status: paymentStatus, forma_pagamento: method, valor_pago: paid, data_pagamento: paid > 0 ? start : null, observacoes: "Agendamento fictício da demonstração.", created_by: userId, crm_oportunidade_id: id(`crm:opportunity:${clientKey}`) };
  });
  table.crm_opportunity_appointments = appointmentSpecs.map(([clientKey], index) => ({ clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), agendamento_id: id(`appointment:${index}`) }));
  table.site_agendamentos_publicos = appointmentSpecs.slice(6, 12).map(([clientKey, professionalKey, procedureKey, offset, hour, , paymentStatus, , paid], index) => ({
    id: id(`public-booking:${index}`), clinica_id: clinicId, cliente_id: client[clientKey], agendamento_id: id(`appointment:${index + 6}`),
    procedimento_id: procedure[procedureKey], profissional_id: professional[professionalKey],
    nome: clientSpecs.find(([key]) => key === clientKey)[1], telefone: table.clientes.find((item) => item.id === client[clientKey]).telefone,
    email: `${clientKey}.demo@nexawi.com.br`, data_hora: localTimestamp(now, offset, hour),
    valor_total: procedureSpecs.find(([key]) => key === procedureKey)[4], valor_sinal: paid,
    pagamento_status: paymentStatus === "pago" ? "pago" : paid > 0 ? "pago" : "pendente",
    payload: { demo: true, source: "site_publico" }, crm_oportunidade_id: id(`crm:opportunity:${clientKey}`),
  }));
  table.cliente_consentimentos = clientSpecs.slice(0, 16).flatMap(([clientKey, clientName], index) => [
    { id: id(`consent:${clientKey}:lgpd`), clinica_id: clinicId, cliente_id: client[clientKey], tipo: "lgpd", titulo: "Consentimento LGPD", versao: "v2", texto: "Autorização fictícia para tratamento de dados na demonstração.", aceito: true, aceito_em: localTimestamp(now, -(500 - index * 17), 10), aceito_por_nome: clientName, created_by: userId },
    { id: id(`consent:${clientKey}:procedure`), clinica_id: clinicId, cliente_id: client[clientKey], tipo: "procedimento", titulo: "Termo de procedimento estético", versao: "v3", texto: "Termo fictício de ciência e consentimento para fins demonstrativos.", aceito: true, aceito_em: localTimestamp(now, -(300 - index * 11), 11), aceito_por_nome: clientName, observacoes: "Registro demonstrativo.", created_by: userId },
  ]);
  table.cliente_fotos = [
    { id: id("client-photo:mariana:evaluation"), clinica_id: clinicId, cliente_id: client.mariana, tipo: "evolucao", titulo: "Registro da avaliação inicial", url: "/marketing/estetica/consultation.jpg", observacoes: "Imagem ilustrativa da demonstração.", data_foto: localDate(now, -240), autorizacao_uso_imagem: false, visibilidade: "restrito", created_by: userId },
    { id: id("client-photo:ana:evaluation"), clinica_id: clinicId, cliente_id: client.ana, tipo: "evolucao", titulo: "Acompanhamento do protocolo", url: "/marketing/estetica/consultation.jpg", observacoes: "Imagem ilustrativa da demonstração.", data_foto: localDate(now, -120), autorizacao_uso_imagem: false, visibilidade: "interno", created_by: userId },
  ];

  const accounts = { cash: id("finance:account:cash"), bank: id("finance:account:bank"), gateway: id("finance:account:gateway") };
  const categories = {
    services: id("finance:category:services"), packages: id("finance:category:packages"), products: id("finance:category:products"),
    fees: id("finance:category:fees"), commissions: id("finance:category:commissions"), supplies: id("finance:category:supplies"),
    admin: id("finance:category:admin"), marketing: id("finance:category:marketing"), occupancy: id("finance:category:occupancy"),
  };
  const centerId = id("finance:center:clinic");
  table.finance_contas = [
    { id: accounts.cash, clinica_id: clinicId, nome: "Caixa da recepção", tipo: "caixa", saldo_inicial: 500, data_saldo_inicial: monthStart, ativa: true, padrao: false },
    { id: accounts.bank, clinica_id: clinicId, nome: "Conta bancária principal", tipo: "banco", instituicao: "Banco Demo", saldo_inicial: 8500, data_saldo_inicial: monthStart, ativa: true, padrao: true },
    { id: accounts.gateway, clinica_id: clinicId, nome: "Recebimentos online", tipo: "gateway", instituicao: "Gateway Demo", saldo_inicial: 1200, data_saldo_inicial: monthStart, ativa: true, padrao: false, provider: "demo" },
  ];
  table.finance_categorias = [
    [categories.services, "Receita de serviços", "receita", "receita_bruta", "REC_SERVICOS", true],
    [categories.packages, "Receita de pacotes", "receita", "receita_bruta", "REC_PACOTES", true],
    [categories.products, "Venda de produtos", "receita", "receita_bruta", "REC_PRODUTOS", true],
    [categories.fees, "Taxas de meios de pagamento", "deducao", "deducoes", "DED_TAXAS", true],
    [categories.commissions, "Comissões profissionais", "custo_variavel", "custos_variaveis", "CUSTO_COMISSOES", true],
    [categories.supplies, "Materiais e insumos", "custo_variavel", "custos_variaveis", "CUSTO_INSUMOS", true],
    [categories.admin, "Despesas administrativas", "despesa", "despesas_operacionais", "DESP_ADMIN", true],
    [categories.marketing, "Marketing", "despesa", "despesas_operacionais", "DESP_MARKETING", true],
    [categories.occupancy, "Aluguel e ocupação", "despesa", "despesas_operacionais", "DESP_OCUPACAO", true],
  ].map(([categoryId, nome, tipo, grupo_dre, codigo, sistema]) => ({ id: categoryId, clinica_id: clinicId, nome, tipo, grupo_dre, codigo, sistema }));
  table.finance_centros_custo = [{ id: centerId, clinica_id: clinicId, nome: "Clínica", codigo: "CLINICA", ativo: true }];
  table.finance_fornecedores = [
    { id: id("finance:supplier:rent"), clinica_id: clinicId, nome: "Centro Empresarial Demo", documento: "00.000.000/0002-80", ativo: true },
    { id: id("finance:supplier:supplies"), clinica_id: clinicId, nome: "Distribuidora Estética Brasil", documento: "00.000.000/0003-60", ativo: true },
  ];
  table.finance_configuracoes = [{ clinica_id: clinicId, regime: "caixa", dia_fechamento: 1, reconhecer_receita_agendamento_em: "conclusao", bloquear_exclusao_com_movimento: true, comissao_padrao_percentual: 15, metadata: { demo: true } }];
  table.finance_comissao_regras = professionalSpecs.map(([key, , , percent], index) => ({ id: id(`finance:commission-rule:${key}`), clinica_id: clinicId, profissional_id: professional[key], tipo: "percentual", percentual: percent, base_calculo: "recebido_liquido", prioridade: 10 + index, ativa: true, vigencia_inicio: monthStart }));

  const receivableSpecs = [
    ["appt0", "appointment:0", client.mariana, professional.helena, procedure.botox, 890, 890, "pago", -6, "pix"],
    ["appt1", "appointment:1", client.ana, professional.camila, procedure.microderme, 699, 699, "pago", -5, "cartao"],
    ["appt3", "appointment:3", client.fernanda, professional.marina, procedure.bioestimulador, 1200, 1200, "pago", -3, "pix"],
    ["appt5", "appointment:5", client.daniela, professional.helena, procedure.harmonizacao, 1800, 900, "parcial", -1, "pix"],
    ["appt8", "appointment:8", client.patricia, professional.helena, procedure.harmonizacao, 1800, 540, "parcial", 0, "pix"],
    ["future", "appointment:9", client.luana, professional.marina, procedure.bioestimulador, 1200, 0, "aberto", 1, null],
  ];
  appointmentSpecs.slice(recentAppointmentCount).forEach(([clientKey, professionalKey, procedureKey, offset, , status, , method, paid], historyIndex) => {
    if (status !== "concluido") return;
    const appointmentIndex = recentAppointmentCount + historyIndex;
    const procedureSpec = procedureSpecs.find(([key]) => key === procedureKey);
    receivableSpecs.push([
      `history:${appointmentIndex}`,
      `appointment:${appointmentIndex}`,
      client[clientKey],
      professional[professionalKey],
      procedure[procedureKey],
      procedureSpec[4],
      paid,
      "pago",
      offset,
      method,
    ]);
  });
  table.finance_recebiveis = receivableSpecs.map(([key, appointmentKey, clientId, professionalId, procedureId, value, received, status, offset, method]) => {
    const referenceDate = localDate(now, offset);
    return { id: id(`finance:receivable:${key}`), clinica_id: clinicId, cliente_id: clientId, profissional_id: professionalId, procedimento_id: procedureId, agendamento_id: id(appointmentKey), categoria_id: categories.services, centro_custo_id: centerId, descricao: "Atendimento demonstrativo", origem_tipo: "agendamento", origem_id: id(appointmentKey), valor_original: value, valor_recebido: received, emissao: referenceDate, competencia: monthStartForDate(referenceDate), vencimento: referenceDate, status, forma_pagamento: method, metadata: { demo: true } };
  });
  table.finance_recebiveis.push({ id: id("finance:receivable:order"), clinica_id: clinicId, cliente_id: client.mariana, pedido_id: id("order:paid"), categoria_id: categories.products, centro_custo_id: centerId, descricao: "Pedido de home care", origem_tipo: "ecommerce", origem_id: id("order:paid"), valor_original: 268, valor_recebido: 268, emissao: localDate(now, -3), competencia: monthStart, vencimento: localDate(now, -3), status: "pago", forma_pagamento: "pix", metadata: { demo: true } });
  table.finance_recebivel_parcelas = table.finance_recebiveis.map((item) => ({ id: id(`finance:receivable-installment:${item.id}`), clinica_id: clinicId, recebivel_id: item.id, numero: 1, vencimento: item.vencimento, valor: item.valor_original, valor_liquidado: item.valor_recebido, status: item.status }));

  table.finance_pagaveis = [
    { id: id("finance:payable:rent"), clinica_id: clinicId, fornecedor_id: id("finance:supplier:rent"), categoria_id: categories.occupancy, centro_custo_id: centerId, descricao: "Aluguel da clínica", origem_tipo: "manual_demo", origem_id: "rent-current", valor_original: 2800, valor_pago: 2800, emissao: localDate(now, -10), competencia: monthStart, vencimento: localDate(now, -5), status: "pago" },
    { id: id("finance:payable:marketing"), clinica_id: clinicId, categoria_id: categories.marketing, centro_custo_id: centerId, descricao: "Campanhas digitais", origem_tipo: "manual_demo", origem_id: "marketing-current", valor_original: 950, valor_pago: 0, emissao: localDate(now, -2), competencia: monthStart, vencimento: localDate(now, 4), status: "aberto" },
    { id: id("finance:payable:supplies"), clinica_id: clinicId, fornecedor_id: id("finance:supplier:supplies"), categoria_id: categories.supplies, centro_custo_id: centerId, descricao: "Insumos estéticos", origem_tipo: "manual_demo", origem_id: "supplies-current", valor_original: 1400, valor_pago: 700, emissao: localDate(now, -8), competencia: monthStart, vencimento: localDate(now, 2), status: "parcial" },
  ];
  const historicalPayablePayments = [];
  for (let month = 1; month <= 24; month += 1) {
    const offset = -(month * 30);
    const referenceDate = localDate(now, offset);
    const competence = monthStartForDate(referenceDate);
    const monthlyPayables = [
      ["rent", "Aluguel da clínica", id("finance:supplier:rent"), categories.occupancy, 2800 + Math.floor((24 - month) / 8) * 150],
      ["supplies", "Reposição de materiais e insumos", id("finance:supplier:supplies"), categories.supplies, 1100 + (month % 5) * 95],
      ["marketing", "Investimento em campanhas digitais", null, categories.marketing, 650 + (month % 4) * 120],
    ];
    for (const [key, description, supplierId, categoryId, value] of monthlyPayables) {
      const payableKey = `history:${month}:${key}`;
      table.finance_pagaveis.push({ id: id(`finance:payable:${payableKey}`), clinica_id: clinicId, fornecedor_id: supplierId, categoria_id: categoryId, centro_custo_id: centerId, descricao: description, origem_tipo: "historico_demo", origem_id: payableKey, valor_original: value, valor_pago: value, emissao: referenceDate, competencia: competence, vencimento: referenceDate, status: "pago", metadata: { demo: true } });
      historicalPayablePayments.push({ key: `expense:${payableKey}`, payableId: id(`finance:payable:${payableKey}`), accountId: accounts.bank, value, offset, method: "pix", categoryId });
    }
  }
  table.finance_pagavel_parcelas = table.finance_pagaveis.map((item) => ({ id: id(`finance:payable-installment:${item.id}`), clinica_id: clinicId, pagavel_id: item.id, numero: 1, vencimento: item.vencimento, valor: item.valor_original, valor_liquidado: item.valor_pago, status: item.status }));

  const liquidations = [
    ...receivableSpecs.filter(([, , , , , , received]) => received > 0).map(([key, , , , , , received, , offset, method]) => ({ key: `income:${key}`, type: "recebimento", receivableId: id(`finance:receivable:${key}`), payableId: null, accountId: method === "dinheiro" ? accounts.cash : accounts.bank, value: received, offset, method, categoryId: categories.services })),
    { key: "income:order", type: "recebimento", receivableId: id("finance:receivable:order"), payableId: null, accountId: accounts.gateway, value: 268, offset: -3, method: "pix", categoryId: categories.products },
    { key: "expense:rent", type: "pagamento", receivableId: null, payableId: id("finance:payable:rent"), accountId: accounts.bank, value: 2800, offset: -5, method: "pix", categoryId: categories.occupancy },
    { key: "expense:supplies", type: "pagamento", receivableId: null, payableId: id("finance:payable:supplies"), accountId: accounts.bank, value: 700, offset: -1, method: "pix", categoryId: categories.supplies },
    ...historicalPayablePayments.map((item) => ({ ...item, type: "pagamento", receivableId: null })),
  ];
  table.finance_liquidacoes = liquidations.map((item) => ({ id: id(`finance:liquidation:${item.key}`), clinica_id: clinicId, recebivel_id: item.receivableId, pagavel_id: item.payableId, conta_financeira_id: item.accountId, tipo: item.type, valor_bruto: item.value, valor_liquido: item.value, forma_pagamento: item.method, data_liquidacao: localTimestamp(now, item.offset, 13), provider: "demo", provider_reference: `demo:${item.key}`, idempotency_key: `demo:${clinicId}:${item.key}`, conciliado: true, metadata: { demo: true } }));
  table.finance_liquidacao_parcelas = liquidations.map((item) => ({ id: id(`finance:liquidation-installment:${item.key}`), clinica_id: clinicId, liquidacao_id: id(`finance:liquidation:${item.key}`), recebivel_parcela_id: item.receivableId ? id(`finance:receivable-installment:${item.receivableId}`) : null, pagavel_parcela_id: item.payableId ? id(`finance:payable-installment:${item.payableId}`) : null, valor: item.value }));
  table.finance_movimentos = liquidations.map((item) => ({ id: id(`finance:movement:${item.key}`), clinica_id: clinicId, conta_financeira_id: item.accountId, categoria_id: item.categoryId, centro_custo_id: centerId, liquidacao_id: id(`finance:liquidation:${item.key}`), tipo: item.type === "recebimento" ? "entrada" : "saida", origem_tipo: "liquidacao", origem_id: id(`finance:liquidation:${item.key}`), descricao: item.type === "recebimento" ? "Recebimento demonstrativo" : "Pagamento demonstrativo", valor_bruto: item.value, valor_liquido: item.value, data_movimento: localTimestamp(now, item.offset, 13), competencia: monthStartForDate(localDate(now, item.offset)), provider: "demo", provider_reference: `demo:${item.key}`, conciliado: true, metadata: { demo: true } }));
  const transferOutId = id("finance:movement:transfer:out");
  const transferInId = id("finance:movement:transfer:in");
  table.finance_movimentos.push(
    { id: transferOutId, clinica_id: clinicId, conta_financeira_id: accounts.gateway, categoria_id: null, centro_custo_id: centerId, liquidacao_id: null, tipo: "transferencia_saida", origem_tipo: "transferencia", origem_id: id("finance:transfer:gateway-bank"), descricao: "Transferência do gateway para a conta principal", valor_bruto: 3200, valor_liquido: 3200, data_movimento: localTimestamp(now, -12, 10), competencia: monthStartForDate(localDate(now, -12)), provider: "demo", provider_reference: "demo:transfer:out", conciliado: true, metadata: { demo: true } },
    { id: transferInId, clinica_id: clinicId, conta_financeira_id: accounts.bank, categoria_id: null, centro_custo_id: centerId, liquidacao_id: null, tipo: "transferencia_entrada", origem_tipo: "transferencia", origem_id: id("finance:transfer:gateway-bank"), descricao: "Transferência recebida do gateway", valor_bruto: 3200, valor_liquido: 3200, data_movimento: localTimestamp(now, -12, 10), competencia: monthStartForDate(localDate(now, -12)), provider: "demo", provider_reference: "demo:transfer:in", conciliado: true, metadata: { demo: true } },
  );
  table.finance_transferencias = [{ id: id("finance:transfer:gateway-bank"), clinica_id: clinicId, conta_origem_id: accounts.gateway, conta_destino_id: accounts.bank, movimento_saida_id: transferOutId, movimento_entrada_id: transferInId, valor: 3200, data_transferencia: localTimestamp(now, -12, 10), descricao: "Repasse consolidado dos recebimentos online", idempotency_key: `demo:${clinicId}:transfer:gateway-bank`, metadata: { demo: true }, created_by: userId }];

  table.finance_comissoes = receivableSpecs.filter(([, , , professionalId, , , received]) => professionalId && received > 0).map(([key, appointmentKey, , professionalId, procedureId, , received, , offset], index) => {
    const percent = professionalSpecs.find(([professionalKey]) => professional[professionalKey] === professionalId)?.[3] || 15;
    const referenceDate = localDate(now, offset);
    return { id: id(`finance:commission:${key}`), clinica_id: clinicId, profissional_id: professionalId, procedimento_id: procedureId, agendamento_id: id(appointmentKey), recebivel_id: id(`finance:receivable:${key}`), liquidacao_id: id(`finance:liquidation:income:${key}`), regra_id: id(`finance:commission-rule:${professionalSpecs.find(([professionalKey]) => professional[professionalKey] === professionalId)?.[0]}`), competencia: monthStartForDate(referenceDate), base_calculo: received, percentual: percent, valor: Number((received * percent / 100).toFixed(2)), status: index < 2 ? "disponivel" : index < 5 ? "provisionada" : "paga", metadata: { demo: true } };
  });
  const paidCommissions = table.finance_comissoes.filter((item) => item.status === "paga").slice(0, 18);
  const commissionGroups = paidCommissions.reduce((groups, item) => {
    const commissions = groups.get(item.profissional_id) || [];
    commissions.push(item);
    groups.set(item.profissional_id, commissions);
    return groups;
  }, new Map());
  for (const [professionalId, commissions] of commissionGroups) {
    const professionalKey = professionalSpecs.find(([key]) => professional[key] === professionalId)?.[0];
    const paymentId = id(`finance:commission-payment:${professionalKey}`);
    const value = Number(commissions.reduce((total, item) => total + Number(item.valor), 0).toFixed(2));
    table.finance_comissao_pagamentos.push({ id: paymentId, clinica_id: clinicId, profissional_id: professionalId, conta_financeira_id: accounts.bank, competencia_inicio: localDate(now, -730), competencia_fim: localDate(now, -31), valor: value, status: "pago", idempotency_key: `demo:${clinicId}:commission-payment:${professionalKey}`, pago_em: localTimestamp(now, -28, 15), created_by: userId, metadata: { demo: true, quantity: commissions.length } });
    table.finance_comissao_pagamento_itens.push(...commissions.map((commission) => ({ id: id(`finance:commission-payment-item:${commission.id}`), clinica_id: clinicId, pagamento_id: paymentId, comissao_id: commission.id, valor: commission.valor })));
  }
  table.finance_competencias = [
    ...table.finance_recebiveis.filter((item) => item.profissional_id).map((item) => ({ id: id(`finance:accrual:income:${item.id}`), clinica_id: clinicId, categoria_id: categories.services, centro_custo_id: centerId, recebivel_id: item.id, origem_tipo: "agendamento", origem_id: item.origem_id, descricao: "Receita de atendimento concluído", tipo: "receita", competencia: item.competencia, valor: item.valor_original, metadata: { demo: true } })),
    { id: id("finance:accrual:order"), clinica_id: clinicId, categoria_id: categories.products, centro_custo_id: centerId, recebivel_id: id("finance:receivable:order"), origem_tipo: "ecommerce", origem_id: "order-paid", descricao: "Venda de produtos", tipo: "receita", competencia: monthStart, valor: 268, metadata: { demo: true } },
    ...table.finance_pagaveis.map((item) => ({ id: id(`finance:accrual:expense:${item.id}`), clinica_id: clinicId, categoria_id: item.categoria_id, centro_custo_id: centerId, pagavel_id: item.id, origem_tipo: "pagavel_demo", origem_id: item.origem_id, descricao: item.descricao, tipo: item.categoria_id === categories.supplies ? "custo" : "despesa", competencia: item.competencia, valor: item.valor_original, metadata: { demo: true } })),
  ];
  table.finance_recorrencias = [{ id: id("finance:recurrence:rent"), clinica_id: clinicId, tipo: "pagar", descricao: "Aluguel mensal", fornecedor_id: id("finance:supplier:rent"), categoria_id: categories.occupancy, centro_custo_id: centerId, conta_financeira_id: accounts.bank, valor: 2800, periodicidade: "mensal", dia_vencimento: 5, proxima_competencia: localDate(now, 30), proximo_vencimento: localDate(now, 35), ativa: true, metadata: { demo: true } }];
  table.finance_orcamentos = [{ id: id("finance:budget:marketing"), clinica_id: clinicId, categoria_id: categories.marketing, centro_custo_id: centerId, competencia: monthStart, valor_planejado: 1200, observacoes: "Orçamento demonstrativo." }];
  table.finance_conciliacoes = liquidations.slice(0, 18).map((item) => ({ id: id(`finance:reconciliation:${item.key}`), clinica_id: clinicId, conta_financeira_id: item.accountId, liquidacao_id: id(`finance:liquidation:${item.key}`), movimento_id: id(`finance:movement:${item.key}`), provider: "demo", provider_reference: `demo:${item.key}`, valor_provider: item.value, data_provider: localTimestamp(now, item.offset, 13), status: "conciliado", conciliado_em: localTimestamp(now, item.offset, 14), conciliado_por: userId, payload_resumo: { demo: true } }));

  table.metas_clinica = [
    { id: id("goal:revenue"), clinica_id: clinicId, tipo: "faturamento", referencia: "Meta mensal", periodo_inicio: monthStart, periodo_fim: monthEnd, valor_meta: 28000, metadata: { demo: true } },
    { id: id("goal:appointments"), clinica_id: clinicId, tipo: "agendamentos", referencia: "Atendimentos do mês", periodo_inicio: monthStart, periodo_fim: monthEnd, valor_meta: 85, metadata: { demo: true } },
  ];
  table.eventos_analiticos = opportunitySpecs.slice(0, 8).flatMap(([clientKey], index) => [
    { id: id(`analytics:${clientKey}:visit`), clinica_id: clinicId, session_id: `demo-session-${index}`, contato_id: client[clientKey], event_name: "site_view", source: index % 2 ? "instagram" : "google", medium: index % 2 ? "social" : "cpc", campaign: "avaliacao_premium", landing_page: "/c/demo-nexawi-clinicas", idempotency_key: `demo:${clinicId}:visit:${index}`, metadata: { demo: true }, occurred_at: localTimestamp(now, -7 + index, 10) },
    { id: id(`analytics:${clientKey}:lead`), clinica_id: clinicId, session_id: `demo-session-${index}`, contato_id: client[clientKey], event_name: "lead_created", source: index % 2 ? "instagram" : "google", medium: index % 2 ? "social" : "cpc", campaign: "avaliacao_premium", landing_page: "/c/demo-nexawi-clinicas", idempotency_key: `demo:${clinicId}:lead:${index}`, metadata: { demo: true }, occurred_at: localTimestamp(now, -7 + index, 10, 15) },
  ]);
  const analyticsEvents = ["site_view", "procedure_view", "booking_started", "lead_created", "whatsapp_click"];
  const campaigns = ["avaliacao_premium", "pele_renovada", "protocolo_corporal", "indicacao_vip"];
  for (let month = 1; month <= 24; month += 1) {
    for (let eventIndex = 0; eventIndex < 10; eventIndex += 1) {
      const clientKey = clientSpecs[(month + eventIndex) % clientSpecs.length][0];
      const eventName = analyticsEvents[eventIndex % analyticsEvents.length];
      const source = ["instagram", "google", "whatsapp", "indicacao"][eventIndex % 4];
      table.eventos_analiticos.push({
        id: id(`analytics:history:${month}:${eventIndex}`), clinica_id: clinicId,
        session_id: `demo-history-${month}-${eventIndex}`, contato_id: client[clientKey], event_name: eventName,
        source, medium: source === "google" ? "cpc" : source === "instagram" ? "social" : "referral",
        campaign: campaigns[(month + eventIndex) % campaigns.length], landing_page: "/c/demo-nexawi-clinicas",
        idempotency_key: `demo:${clinicId}:history:${month}:${eventIndex}`, metadata: { demo: true, historical: true },
        occurred_at: localTimestamp(now, -(month * 30) + eventIndex, 9 + (eventIndex % 8)),
      });
    }
  }

  return { version: DEMO_DATASET_VERSION, generatedAt: now.toISOString(), clinicId, tables: table };
}
