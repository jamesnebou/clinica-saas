import { createHash } from "node:crypto";

export const DEMO_DATASET_VERSION = 2;
export const DEMO_TIME_ZONE = "America/Bahia";

// Keep this list aligned with app_private.demo_reset_registry in the demo migration.
export const DEMO_MUTABLE_TABLES = [
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

export function buildDemoDataset({ clinicId, userId, now = new Date() }) {
  const id = (key) => deterministicDemoId(clinicId, key);
  const { start: monthStart, end: monthEnd } = monthBounds(now);
  const table = Object.fromEntries(DEMO_MUTABLE_TABLES.map((name) => [name, []]));

  const professionalSpecs = [
    ["helena", "Dra. Helena Martins", "Harmonização facial", 18],
    ["camila", "Camila Duarte", "Estética corporal", 15],
    ["marina", "Marina Lopes", "Dermatofuncional", 16],
    ["rafaela", "Rafaela Nunes", "Cílios e sobrancelhas", 12],
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
  ];
  table.clientes = clientSpecs.map(([key, nome, origem, status], index) => ({
    id: id(`client:${key}`), clinica_id: clinicId, nome, origem, status,
    telefone: `77988${String(887777 - index * 1111).padStart(6, "0")}`.slice(0, 11),
    email: `${key}.demo@nexawi.com.br`, cpf: `00000000${String(index + 10).padStart(3, "0")}`,
    data_nascimento: `199${index % 10}-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 18) + 1).padStart(2, "0")}`,
    observacoes: "Cadastro fictício para demonstração comercial.", consentimento_lgpd: true,
    data_consentimento_lgpd: localTimestamp(now, -30 + index, 10),
    observacoes_clinicas: "Registro demonstrativo para apresentação do prontuário.",
    alergias: index % 4 === 0 ? "Pele sensível." : null,
    contraindicacoes: index % 5 === 0 ? "Avaliação obrigatória antes de procedimentos agressivos." : null,
    retorno_recomendado_em: localDate(now, index + 8), termo_consentimento_aceito: true,
    termo_consentimento_aceito_em: localTimestamp(now, -20 + index, 11),
    anamnese: { objetivo_principal: index % 2 ? "Protocolo corporal" : "Rejuvenescimento facial", gestante: false, diabetes: false },
  }));

  const professional = Object.fromEntries(professionalSpecs.map(([key]) => [key, id(`professional:${key}`)]));
  const procedure = Object.fromEntries(procedureSpecs.map(([key]) => [key, id(`procedure:${key}`)]));
  const client = Object.fromEntries(clientSpecs.map(([key]) => [key, id(`client:${key}`)]));

  table.pacotes_clinica = [
    { id: id("package:facial"), clinica_id: clinicId, nome: "Jornada Facial Premium", descricao: "Botox, limpeza e bioestimulador.", procedimento_id: procedure.botox, procedimento_ids: [procedure.botox, procedure.limpeza, procedure.bioestimulador], quantidade_sessoes: 5, valor: 2490, validade_dias: 180, ativo: true },
    { id: id("package:corporal"), clinica_id: clinicId, nome: "Protocolo Corporal 360", descricao: "Microderme e drenagem.", procedimento_id: procedure.microderme, procedimento_ids: [procedure.microderme, procedure.drenagem], quantidade_sessoes: 8, valor: 1990, validade_dias: 150, ativo: true },
  ];
  table.cliente_pacotes = [
    { id: id("client-package:ana"), clinica_id: clinicId, cliente_id: client.ana, pacote_id: id("package:corporal"), nome_pacote: "Protocolo Corporal 360", sessoes_total: 8, sessoes_utilizadas: 3, valor_total: 1990, status: "ativo", data_compra: localDate(now, -22), validade_em: localDate(now, 128) },
    { id: id("client-package:fernanda"), clinica_id: clinicId, cliente_id: client.fernanda, pacote_id: id("package:facial"), nome_pacote: "Jornada Facial Premium", sessoes_total: 5, sessoes_utilizadas: 2, valor_total: 2490, status: "ativo", data_compra: localDate(now, -16), validade_em: localDate(now, 164) },
  ];

  table.produtos_clinica = [
    { id: id("product:serum"), clinica_id: clinicId, nome: "Sérum antioxidante", sku: "DEMO-SERUM", categoria: "Home care", descricao: "Sérum facial demonstrativo.", custo: 62, preco: 149, estoque_atual: 18, estoque_minimo: 5, publicado_site: true, ativo: true },
    { id: id("product:protetor"), clinica_id: clinicId, nome: "Protetor solar premium", sku: "DEMO-FPS", categoria: "Home care", descricao: "Proteção diária para protocolos faciais.", custo: 48, preco: 119, estoque_atual: 12, estoque_minimo: 4, publicado_site: true, ativo: true },
    { id: id("product:kit"), clinica_id: clinicId, nome: "Kit pós-procedimento", sku: "DEMO-KIT", categoria: "Kits", descricao: "Cuidados essenciais após o atendimento.", custo: 85, preco: 219, estoque_atual: 7, estoque_minimo: 3, publicado_site: true, ativo: true },
  ];
  table.cupons_clinica = [{ id: id("coupon:BEMVINDA"), clinica_id: clinicId, codigo: "BEMVINDA", descricao: "Cupom demonstrativo", tipo: "percentual", valor: 10, pedido_minimo: 100, limite_usos: 50, usos: 8, inicia_em: localTimestamp(now, -20, 8), termina_em: localTimestamp(now, 30, 23, 59), ativo: true }];
  table.pedidos_clinica = [
    { id: id("order:paid"), clinica_id: clinicId, cliente_id: client.mariana, status: "concluido", pagamento_status: "pago", entrega_tipo: "retirada", nome_cliente: "Mariana Costa", telefone_cliente: "77988887777", email_cliente: "mariana.demo@nexawi.com.br", subtotal: 268, desconto: 0, frete: 0, total: 268, forma_pagamento: "PIX", pago_em: localTimestamp(now, -3, 13), origem: { source: "site_demo" }, observacoes: "Pedido demonstrativo pago." },
    { id: id("order:pending"), clinica_id: clinicId, cliente_id: client.bianca, cupom_id: id("coupon:BEMVINDA"), status: "aguardando_pagamento", pagamento_status: "pendente", entrega_tipo: "retirada", nome_cliente: "Bianca Teixeira", telefone_cliente: "77910101010", email_cliente: "bianca.demo@nexawi.com.br", subtotal: 219, desconto: 21.9, frete: 0, total: 197.1, cupom_codigo: "BEMVINDA", forma_pagamento: "PIX", expiracao_reserva_em: localTimestamp(now, 1, 18), origem: { source: "instagram", campaign: "home_care_demo" }, observacoes: "Pedido aguardando pagamento." },
  ];
  table.pedido_itens_clinica = [
    { id: id("order-item:paid:serum"), clinica_id: clinicId, pedido_id: id("order:paid"), produto_id: id("product:serum"), nome_produto: "Sérum antioxidante", sku: "DEMO-SERUM", quantidade: 1, valor_unitario: 149, total: 149 },
    { id: id("order-item:paid:fps"), clinica_id: clinicId, pedido_id: id("order:paid"), produto_id: id("product:protetor"), nome_produto: "Protetor solar premium", sku: "DEMO-FPS", quantidade: 1, valor_unitario: 119, total: 119 },
    { id: id("order-item:pending:kit"), clinica_id: clinicId, pedido_id: id("order:pending"), produto_id: id("product:kit"), nome_produto: "Kit pós-procedimento", sku: "DEMO-KIT", quantidade: 1, valor_unitario: 219, desconto: 21.9, total: 197.1 },
  ];
  table.pagamentos_loja_clinica = [
    { id: id("shop-payment:paid"), clinica_id: clinicId, cliente_id: client.mariana, pedido_id: id("order:paid"), valor: 268, forma: "pix", status: "pago", provedor: "demo", provedor_pagamento_id: `demo-paid-${id("order:paid")}`, pago_em: localTimestamp(now, -3, 13), observacoes: "Pagamento fictício." },
    { id: id("shop-payment:pending"), clinica_id: clinicId, cliente_id: client.bianca, pedido_id: id("order:pending"), valor: 197.1, forma: "pix", status: "pendente", provedor: "demo", provedor_pagamento_id: `demo-pending-${id("order:pending")}`, vencimento_em: localTimestamp(now, 1, 18), observacoes: "Cobrança fictícia." },
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
    ["daniela", "lost", 1800, "frio", 20, -4, "Retomar em três meses"],
  ];
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
    };
  });
  table.crm_activities = opportunitySpecs.filter(([, stage]) => !["won", "lost"].includes(stage)).map(([clientKey, , , , , nextOffset, action], index) => ({
    id: id(`crm:activity:${clientKey}`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), cliente_id: client[clientKey], owner_id: userId,
    tipo: index % 2 ? "whatsapp" : "follow_up", titulo: action, descricao: "Atividade demonstrativa com prazo relativo.",
    due_at: localTimestamp(now, nextOffset, 14), completed_at: nextOffset < 0 ? localTimestamp(now, nextOffset, 12) : null,
    status: nextOffset < 0 ? "completed" : "pending", created_by: userId,
  }));
  table.crm_opportunity_events = opportunitySpecs.flatMap(([clientKey, stageKey], index) => [
    { id: id(`crm:event:${clientKey}:created`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), event_type: "created", actor_id: userId, data: { source: "demo" }, occurred_at: localTimestamp(now, -12 + index, 9) },
    { id: id(`crm:event:${clientKey}:stage`), clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), event_type: "stage_changed", actor_id: userId, data: { to: stageKey }, occurred_at: localTimestamp(now, -10 + index, 11) },
  ]);
  table.crm_opportunity_tags = [
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:renata"), tag_id: id("crm:tag:urgent"), created_by: userId },
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:mariana"), tag_id: id("crm:tag:vip"), created_by: userId },
    { clinica_id: clinicId, opportunity_id: id("crm:opportunity:carla"), tag_id: id("crm:tag:return"), created_by: userId },
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
  table.agendamentos = appointmentSpecs.map(([clientKey, professionalKey, procedureKey, offset, hour, status, paymentStatus, method, paid], index) => {
    const start = localTimestamp(now, offset, hour);
    const procedureSpec = procedureSpecs.find(([key]) => key === procedureKey);
    return { id: id(`appointment:${index}`), clinica_id: clinicId, cliente_id: client[clientKey], profissional_id: professional[professionalKey], procedimento_id: procedure[procedureKey], inicio: start, fim: addMinutes(start, procedureSpec[3]), status, valor: procedureSpec[4], pagamento_status: paymentStatus, forma_pagamento: method, valor_pago: paid, data_pagamento: paid > 0 ? start : null, observacoes: "Agendamento fictício da demonstração.", created_by: userId, crm_oportunidade_id: id(`crm:opportunity:${clientKey}`) };
  });
  table.crm_opportunity_appointments = appointmentSpecs.map(([clientKey], index) => ({ clinica_id: clinicId, opportunity_id: id(`crm:opportunity:${clientKey}`), agendamento_id: id(`appointment:${index}`) }));

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
  table.finance_recebiveis = receivableSpecs.map(([key, appointmentKey, clientId, professionalId, procedureId, value, received, status, offset, method]) => ({ id: id(`finance:receivable:${key}`), clinica_id: clinicId, cliente_id: clientId, profissional_id: professionalId, procedimento_id: procedureId, agendamento_id: id(appointmentKey), categoria_id: categories.services, centro_custo_id: centerId, descricao: "Atendimento demonstrativo", origem_tipo: "agendamento", origem_id: id(appointmentKey), valor_original: value, valor_recebido: received, emissao: localDate(now, offset), competencia: monthStart, vencimento: localDate(now, offset), status, forma_pagamento: method, metadata: { demo: true } }));
  table.finance_recebiveis.push({ id: id("finance:receivable:order"), clinica_id: clinicId, cliente_id: client.mariana, pedido_id: id("order:paid"), categoria_id: categories.products, centro_custo_id: centerId, descricao: "Pedido de home care", origem_tipo: "ecommerce", origem_id: id("order:paid"), valor_original: 268, valor_recebido: 268, emissao: localDate(now, -3), competencia: monthStart, vencimento: localDate(now, -3), status: "pago", forma_pagamento: "pix", metadata: { demo: true } });
  table.finance_recebivel_parcelas = table.finance_recebiveis.map((item) => ({ id: id(`finance:receivable-installment:${item.id}`), clinica_id: clinicId, recebivel_id: item.id, numero: 1, vencimento: item.vencimento, valor: item.valor_original, valor_liquidado: item.valor_recebido, status: item.status }));

  table.finance_pagaveis = [
    { id: id("finance:payable:rent"), clinica_id: clinicId, fornecedor_id: id("finance:supplier:rent"), categoria_id: categories.occupancy, centro_custo_id: centerId, descricao: "Aluguel da clínica", origem_tipo: "manual_demo", origem_id: "rent-current", valor_original: 2800, valor_pago: 2800, emissao: localDate(now, -10), competencia: monthStart, vencimento: localDate(now, -5), status: "pago" },
    { id: id("finance:payable:marketing"), clinica_id: clinicId, categoria_id: categories.marketing, centro_custo_id: centerId, descricao: "Campanhas digitais", origem_tipo: "manual_demo", origem_id: "marketing-current", valor_original: 950, valor_pago: 0, emissao: localDate(now, -2), competencia: monthStart, vencimento: localDate(now, 4), status: "aberto" },
    { id: id("finance:payable:supplies"), clinica_id: clinicId, fornecedor_id: id("finance:supplier:supplies"), categoria_id: categories.supplies, centro_custo_id: centerId, descricao: "Insumos estéticos", origem_tipo: "manual_demo", origem_id: "supplies-current", valor_original: 1400, valor_pago: 700, emissao: localDate(now, -8), competencia: monthStart, vencimento: localDate(now, 2), status: "parcial" },
  ];
  table.finance_pagavel_parcelas = table.finance_pagaveis.map((item) => ({ id: id(`finance:payable-installment:${item.id}`), clinica_id: clinicId, pagavel_id: item.id, numero: 1, vencimento: item.vencimento, valor: item.valor_original, valor_liquidado: item.valor_pago, status: item.status }));

  const liquidations = [
    ...receivableSpecs.filter(([, , , , , , received]) => received > 0).map(([key, , , , , , received, , offset, method]) => ({ key: `income:${key}`, type: "recebimento", receivableId: id(`finance:receivable:${key}`), payableId: null, accountId: method === "dinheiro" ? accounts.cash : accounts.bank, value: received, offset, method, categoryId: categories.services })),
    { key: "income:order", type: "recebimento", receivableId: id("finance:receivable:order"), payableId: null, accountId: accounts.gateway, value: 268, offset: -3, method: "pix", categoryId: categories.products },
    { key: "expense:rent", type: "pagamento", receivableId: null, payableId: id("finance:payable:rent"), accountId: accounts.bank, value: 2800, offset: -5, method: "pix", categoryId: categories.occupancy },
    { key: "expense:supplies", type: "pagamento", receivableId: null, payableId: id("finance:payable:supplies"), accountId: accounts.bank, value: 700, offset: -1, method: "pix", categoryId: categories.supplies },
  ];
  table.finance_liquidacoes = liquidations.map((item) => ({ id: id(`finance:liquidation:${item.key}`), clinica_id: clinicId, recebivel_id: item.receivableId, pagavel_id: item.payableId, conta_financeira_id: item.accountId, tipo: item.type, valor_bruto: item.value, valor_liquido: item.value, forma_pagamento: item.method, data_liquidacao: localTimestamp(now, item.offset, 13), provider: "demo", provider_reference: `demo:${item.key}`, idempotency_key: `demo:${clinicId}:${item.key}`, conciliado: true, metadata: { demo: true } }));
  table.finance_liquidacao_parcelas = liquidations.map((item) => ({ id: id(`finance:liquidation-installment:${item.key}`), clinica_id: clinicId, liquidacao_id: id(`finance:liquidation:${item.key}`), recebivel_parcela_id: item.receivableId ? id(`finance:receivable-installment:${item.receivableId}`) : null, pagavel_parcela_id: item.payableId ? id(`finance:payable-installment:${item.payableId}`) : null, valor: item.value }));
  table.finance_movimentos = liquidations.map((item) => ({ id: id(`finance:movement:${item.key}`), clinica_id: clinicId, conta_financeira_id: item.accountId, categoria_id: item.categoryId, centro_custo_id: centerId, liquidacao_id: id(`finance:liquidation:${item.key}`), tipo: item.type === "recebimento" ? "entrada" : "saida", origem_tipo: "liquidacao", origem_id: id(`finance:liquidation:${item.key}`), descricao: item.type === "recebimento" ? "Recebimento demonstrativo" : "Pagamento demonstrativo", valor_bruto: item.value, valor_liquido: item.value, data_movimento: localTimestamp(now, item.offset, 13), competencia: monthStart, provider: "demo", provider_reference: `demo:${item.key}`, conciliado: true, metadata: { demo: true } }));

  table.finance_comissoes = receivableSpecs.slice(0, 5).map(([key, appointmentKey, , professionalId, procedureId, , received, , offset], index) => {
    const percent = professionalSpecs.find(([professionalKey]) => professional[professionalKey] === professionalId)?.[3] || 15;
    return { id: id(`finance:commission:${key}`), clinica_id: clinicId, profissional_id: professionalId, procedimento_id: procedureId, agendamento_id: id(appointmentKey), recebivel_id: id(`finance:receivable:${key}`), liquidacao_id: id(`finance:liquidation:income:${key}`), regra_id: id(`finance:commission-rule:${professionalSpecs.find(([professionalKey]) => professional[professionalKey] === professionalId)?.[0]}`), competencia: monthStart, base_calculo: received, percentual: percent, valor: Number((received * percent / 100).toFixed(2)), status: index < 2 ? "disponivel" : "provisionada", metadata: { demo: true } };
  });
  table.finance_competencias = [
    ...receivableSpecs.slice(0, 5).map(([key, , , , , value]) => ({ id: id(`finance:accrual:income:${key}`), clinica_id: clinicId, categoria_id: categories.services, centro_custo_id: centerId, recebivel_id: id(`finance:receivable:${key}`), origem_tipo: "agendamento", origem_id: key, descricao: "Receita de atendimento concluído", tipo: "receita", competencia: monthStart, valor: value, metadata: { demo: true } })),
    { id: id("finance:accrual:order"), clinica_id: clinicId, categoria_id: categories.products, centro_custo_id: centerId, recebivel_id: id("finance:receivable:order"), origem_tipo: "ecommerce", origem_id: "order-paid", descricao: "Venda de produtos", tipo: "receita", competencia: monthStart, valor: 268, metadata: { demo: true } },
    ...table.finance_pagaveis.map((item) => ({ id: id(`finance:accrual:expense:${item.id}`), clinica_id: clinicId, categoria_id: item.categoria_id, centro_custo_id: centerId, pagavel_id: item.id, origem_tipo: "pagavel_demo", origem_id: item.origem_id, descricao: item.descricao, tipo: item.categoria_id === categories.supplies ? "custo" : "despesa", competencia: monthStart, valor: item.valor_original, metadata: { demo: true } })),
  ];
  table.finance_recorrencias = [{ id: id("finance:recurrence:rent"), clinica_id: clinicId, tipo: "pagar", descricao: "Aluguel mensal", fornecedor_id: id("finance:supplier:rent"), categoria_id: categories.occupancy, centro_custo_id: centerId, conta_financeira_id: accounts.bank, valor: 2800, periodicidade: "mensal", dia_vencimento: 5, proxima_competencia: localDate(now, 30), proximo_vencimento: localDate(now, 35), ativa: true, metadata: { demo: true } }];
  table.finance_orcamentos = [{ id: id("finance:budget:marketing"), clinica_id: clinicId, categoria_id: categories.marketing, centro_custo_id: centerId, competencia: monthStart, valor_planejado: 1200, observacoes: "Orçamento demonstrativo." }];
  table.finance_conciliacoes = liquidations.slice(0, 3).map((item) => ({ id: id(`finance:reconciliation:${item.key}`), clinica_id: clinicId, conta_financeira_id: item.accountId, liquidacao_id: id(`finance:liquidation:${item.key}`), movimento_id: id(`finance:movement:${item.key}`), provider: "demo", provider_reference: `demo:${item.key}`, valor_provider: item.value, data_provider: localTimestamp(now, item.offset, 13), status: "conciliado", conciliado_em: localTimestamp(now, item.offset, 14), conciliado_por: userId, payload_resumo: { demo: true } }));

  table.metas_clinica = [
    { id: id("goal:revenue"), clinica_id: clinicId, tipo: "faturamento", referencia: "Meta mensal", periodo_inicio: monthStart, periodo_fim: monthEnd, valor_meta: 28000, metadata: { demo: true } },
    { id: id("goal:appointments"), clinica_id: clinicId, tipo: "agendamentos", referencia: "Atendimentos do mês", periodo_inicio: monthStart, periodo_fim: monthEnd, valor_meta: 85, metadata: { demo: true } },
  ];
  table.eventos_analiticos = opportunitySpecs.slice(0, 8).flatMap(([clientKey], index) => [
    { id: id(`analytics:${clientKey}:visit`), clinica_id: clinicId, session_id: `demo-session-${index}`, contato_id: client[clientKey], event_name: "site_view", source: index % 2 ? "instagram" : "google", medium: index % 2 ? "social" : "cpc", campaign: "avaliacao_premium", landing_page: "/c/demo-nexawi-clinicas", idempotency_key: `demo:${clinicId}:visit:${index}`, metadata: { demo: true }, occurred_at: localTimestamp(now, -7 + index, 10) },
    { id: id(`analytics:${clientKey}:lead`), clinica_id: clinicId, session_id: `demo-session-${index}`, contato_id: client[clientKey], event_name: "lead_created", source: index % 2 ? "instagram" : "google", medium: index % 2 ? "social" : "cpc", campaign: "avaliacao_premium", landing_page: "/c/demo-nexawi-clinicas", idempotency_key: `demo:${clinicId}:lead:${index}`, metadata: { demo: true }, occurred_at: localTimestamp(now, -7 + index, 10, 15) },
  ]);

  return { version: DEMO_DATASET_VERSION, generatedAt: now.toISOString(), clinicId, tables: table };
}
