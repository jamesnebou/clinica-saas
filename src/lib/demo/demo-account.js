import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACCESS_SECTIONS } from "@/lib/auth/permissions";

export const DEMO_EMAIL = "demo@nexawi.com.br";
export const DEMO_PASSWORD = "demo1234";

const DEMO_SLUG = "demo-nexawi-clinicas";
const DEMO_CLINIC_NAME = "NexaWi Clínicas Demo";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isDemoLoginEmail(email) {
  return normalizeEmail(email) === DEMO_EMAIL;
}

export function isDemoPassword(password) {
  return String(password || "") === DEMO_PASSWORD;
}

async function findAuthUserByEmail(email) {
  const targetEmail = normalizeEmail(email);

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const found = data?.users?.find((user) => normalizeEmail(user.email) === targetEmail);
    if (found) return found;
    if (!data?.users?.length || data.users.length < 100) break;
  }

  return null;
}

async function ensureDemoAuthUser() {
  const existing = await findAuthUserByEmail(DEMO_EMAIL);

  if (existing?.id) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        nome: "Usuário Demo NexaWi",
        tipo: "demo",
      },
      app_metadata: {
        ...(existing.app_metadata || {}),
        demo_account: true,
      },
    });

    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      nome: "Usuário Demo NexaWi",
      tipo: "demo",
    },
    app_metadata: {
      demo_account: true,
    },
  });

  if (error) throw error;
  return data.user;
}

async function ensureDemoClinic() {
  const now = new Date();
  const nextBilling = new Date(now);
  nextBilling.setDate(nextBilling.getDate() + 22);

  const payload = {
    nome: DEMO_CLINIC_NAME,
    slug: DEMO_SLUG,
    documento: "00.000.000/0001-00",
    telefone: "77999990000",
    email: DEMO_EMAIL,
    cidade: "Vitória da Conquista",
    estado: "BA",
    endereco: "Av. Demo Premium, 1200 - Centro",
    status: "ativa",
    plano: "premium",
    trial_ends_at: null,
    billing_email: DEMO_EMAIL,
    assinatura_status: "isenta",
    proxima_cobranca_em: nextBilling.toISOString().slice(0, 10),
    bloqueada_em: null,
    bloqueio_motivo: null,
    metadata: {
      demo: true,
      marca_cor: "#ed7009",
      cor_primaria: "#ed7009",
      cor_secundaria: "#111111",
      site_publicado: true,
      site_titulo: "Beleza, tecnologia e gestão premium",
      site_subtitulo: "Demonstração real da plataforma NexaWi Clínicas com agenda, financeiro, CRM e site público integrados.",
      site_descricao_curta: "Clínica demo com dados fictícios para avaliação comercial.",
      site_profissional_nome: "Dra. Helena Martins",
      site_profissional_credencial_1: "Estética avançada",
      site_profissional_credencial_2: "Harmonização facial",
      site_profissional_credencial_3: "Protocolos corporais",
      site_bio:
        "Esta é uma clínica demonstrativa criada para apresentar a experiência real da NexaWi Clínicas. Os dados são fictícios e restaurados automaticamente para novos testes.",
      site_whatsapp: "5577999990000",
      site_instagram_url: "https://www.instagram.com/nexawi",
      horario_funcionamento: {
        segunda: { ativo: true, inicio: "08:00", fim: "18:00" },
        terca: { ativo: true, inicio: "08:00", fim: "18:00" },
        quarta: { ativo: true, inicio: "08:00", fim: "18:00" },
        quinta: { ativo: true, inicio: "08:00", fim: "18:00" },
        sexta: { ativo: true, inicio: "08:00", fim: "18:00" },
        sabado: { ativo: true, inicio: "08:00", fim: "13:00" },
        domingo: { ativo: false, inicio: "", fim: "" },
      },
    },
  };

  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .upsert(payload, { onConflict: "slug" })
    .select("id, nome, slug")
    .single();

  if (error) throw error;
  return data;
}

async function safeDelete(table, clinicId) {
  const { error } = await supabaseAdmin.from(table).delete().eq("clinica_id", clinicId);

  if (!error) return;

  const message = String(error.message || "");
  if (message.includes("does not exist") || message.includes("schema cache")) return;
  console.error(`Erro ao limpar dados demo em ${table}:`, error);
}

function daysFromNow(days, hour, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addMinutes(iso, minutes) {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function mapByName(items) {
  return new Map((items || []).map((item) => [item.nome, item]));
}

async function seedDemoData(clinic, user) {
  const permissions = { secoes: ACCESS_SECTIONS };

  const { error: membershipError } = await supabaseAdmin.from("usuarios_clinica").upsert(
    {
      clinica_id: clinic.id,
      user_id: user.id,
      nome: "Usuário Demo NexaWi",
      email: DEMO_EMAIL,
      papel: "owner",
      ativo: true,
      permissions,
      permissoes: permissions,
      invited_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
    },
    { onConflict: "clinica_id,email" }
  );
  if (membershipError) throw membershipError;

  const professionalsPayload = [
    ["Dra. Helena Martins", "77999990001", "helena.demo@nexawi.com.br", "Harmonização facial", 18],
    ["Camila Duarte", "77999990002", "camila.demo@nexawi.com.br", "Estética corporal", 15],
    ["Marina Lopes", "77999990003", "marina.demo@nexawi.com.br", "Dermatofuncional", 16],
    ["Rafaela Nunes", "77999990004", "rafaela.demo@nexawi.com.br", "Cílios e sobrancelhas", 12],
  ].map(([nome, telefone, email, especialidade, comissao_percentual]) => ({
    clinica_id: clinic.id,
    nome,
    telefone,
    email,
    especialidade,
    comissao_percentual,
    ativo: true,
    observacoes: "Profissional fictício para demonstração comercial.",
  }));

  const { data: professionals, error: professionalError } = await supabaseAdmin
    .from("profissionais")
    .insert(professionalsPayload)
    .select("id, nome, comissao_percentual");
  if (professionalError) throw professionalError;

  const proceduresPayload = [
    ["Limpeza de pele premium", "Facial", "Higienização, extração e hidratação facial.", 90, 260, 20, true],
    ["Botox", "Injetáveis", "Aplicação de toxina botulínica com avaliação personalizada.", 45, 890, 30, true],
    ["Harmonização facial", "Injetáveis", "Protocolo avançado para equilíbrio e naturalidade facial.", 90, 1800, 35, true],
    ["Bioestimulador de colágeno", "Facial", "Estímulo de colágeno para firmeza e rejuvenescimento.", 60, 1200, 30, true],
    ["Microderme corporal", "Corporal", "Tratamento estético corporal com protocolo premium.", 90, 699, 30, true],
    ["Drenagem linfática", "Corporal", "Sessão de drenagem manual.", 60, 180, 0, false],
    ["Extensão de cílios", "Facial", "Aplicação premium para realce do olhar.", 120, 250, 0, false],
  ].map(([nome, categoria, descricao, duracao_minutos, preco, sinal_percentual, destaque_site], index) => ({
    clinica_id: clinic.id,
    nome,
    categoria,
    descricao,
    duracao_minutos,
    preco,
    ativo: true,
    cuidados_antes: "Chegue alguns minutos antes e informe qualquer alergia ou condição de saúde.",
    cuidados_depois: "Siga as orientações da profissional e evite exposição excessiva nas primeiras horas.",
    publicado_site: true,
    destaque_site,
    sinal_percentual,
    sinal_valor: 0,
    ordem_site: index + 1,
  }));

  const { data: procedures, error: procedureError } = await supabaseAdmin
    .from("procedimentos")
    .insert(proceduresPayload)
    .select("id, nome, preco, duracao_minutos");
  if (procedureError) throw procedureError;

  const clientsPayload = [
    ["Mariana Costa", "77988887777", "mariana.demo@nexawi.com.br", "Instagram", "ativo", "Cliente de protocolo facial."],
    ["Ana Paula Ribeiro", "77977776666", "ana.demo@nexawi.com.br", "Indicação", "ativo", "Pacote corporal em andamento."],
    ["Juliana Rocha", "77966665555", "juliana.demo@nexawi.com.br", "Tráfego pago", "lead", "Avaliação marcada."],
    ["Carla Mendes", "77955554444", "carla.demo@nexawi.com.br", "Google", "ativo", "Cliente recorrente."],
    ["Patrícia Almeida", "77944443333", "patricia.demo@nexawi.com.br", "WhatsApp", "ativo", "Interessada em harmonização."],
    ["Renata Souza", "77933332222", "renata.demo@nexawi.com.br", "Instagram", "lead", "Follow-up pendente."],
    ["Fernanda Lima", "77922221111", "fernanda.demo@nexawi.com.br", "Indicação", "ativo", "Fechou pacote premium."],
    ["Luana Martins", "77911110000", "luana.demo@nexawi.com.br", "Google", "ativo", "Retorno recomendado."],
    ["Bianca Teixeira", "77910101010", "bianca.demo@nexawi.com.br", "Instagram", "lead", "Quer saber sobre bioestimulador."],
    ["Aline Barbosa", "77920202020", "aline.demo@nexawi.com.br", "WhatsApp", "ativo", "Cliente de cílios."],
    ["Sofia Nascimento", "77930303030", "sofia.demo@nexawi.com.br", "Tráfego pago", "ativo", "Avaliação corporal."],
    ["Daniela Pires", "77940404040", "daniela.demo@nexawi.com.br", "Indicação", "ativo", "Procedimento pago antecipado."],
  ].map(([nome, telefone, email, origem, status, observacoes], index) => ({
    clinica_id: clinic.id,
    nome,
    telefone,
    email,
    cpf: `000000000${String(index + 10).slice(-2)}`,
    data_nascimento: `199${index % 10}-0${(index % 8) + 1}-1${index % 9}`,
    origem,
    status,
    observacoes,
    consentimento_lgpd: true,
    data_consentimento_lgpd: new Date().toISOString(),
    observacoes_clinicas: "Registro demonstrativo para apresentação do prontuário.",
    alergias: index % 4 === 0 ? "Pele sensível." : null,
    contraindicacoes: index % 5 === 0 ? "Evitar procedimentos agressivos sem avaliação." : null,
    retorno_recomendado_em: new Date(Date.now() + (index + 10) * 86400000).toISOString().slice(0, 10),
    termo_consentimento_aceito: true,
    termo_consentimento_aceito_em: new Date().toISOString(),
    anamnese: {
      objetivo_principal: index % 2 === 0 ? "Rejuvenescimento facial" : "Protocolo corporal",
      gestante: false,
      diabetes: false,
    },
  }));

  const { data: clients, error: clientError } = await supabaseAdmin
    .from("clientes")
    .insert(clientsPayload)
    .select("id, nome, telefone, email");
  if (clientError) throw clientError;

  const clientByName = mapByName(clients);
  const professionalByName = mapByName(professionals);
  const procedureByName = mapByName(procedures);

  const opportunityPayload = [
    ["Renata Souza", "instagram", "lead", 1200, 1, "Enviar proposta do bioestimulador"],
    ["Juliana Rocha", "trafego_pago", "avaliacao_marcada", 699, 0, "Confirmar avaliação corporal"],
    ["Bianca Teixeira", "instagram", "em_negociacao", 1800, 2, "Oferecer pacote facial"],
    ["Mariana Costa", "instagram", "convertido", 890, -2, "Cliente convertida"],
    ["Carla Mendes", "google", "convertido", 260, -3, "Retorno agendado"],
    ["Patrícia Almeida", "whatsapp", "em_negociacao", 1800, 3, "Enviar condições de pagamento"],
    ["Sofia Nascimento", "trafego_pago", "avaliacao_marcada", 699, 1, "Avaliação corporal"],
    ["Aline Barbosa", "whatsapp", "convertido", 250, -1, "Cliente recorrente"],
  ].map(([nome, origem, status, valor_estimado, dias, proxima_acao]) => ({
    clinica_id: clinic.id,
    cliente_id: clientByName.get(nome)?.id || null,
    nome,
    telefone: clientByName.get(nome)?.telefone || "77900000000",
    email: clientByName.get(nome)?.email || null,
    origem,
    status,
    valor_estimado,
    proxima_acao_em: new Date(Date.now() + Number(dias) * 86400000).toISOString().slice(0, 10),
    proxima_acao,
    observacoes: "Oportunidade fictícia para demonstração do CRM.",
    convertido_em: status === "convertido" ? new Date().toISOString() : null,
    created_by: user.id,
  }));

  const { error: opportunityError } = await supabaseAdmin.from("crm_oportunidades").insert(opportunityPayload);
  if (opportunityError) throw opportunityError;

  const agendaSeed = [
    ["Mariana Costa", "Dra. Helena Martins", "Botox", -6, 9, "concluido", "pago", "pix", 890],
    ["Ana Paula Ribeiro", "Camila Duarte", "Microderme corporal", -5, 14, "concluido", "pago", "cartao", 699],
    ["Carla Mendes", "Dra. Helena Martins", "Limpeza de pele premium", -4, 10, "concluido", "pago", "dinheiro", 260],
    ["Fernanda Lima", "Marina Lopes", "Bioestimulador de colágeno", -3, 15, "concluido", "pago", "pix", 1200],
    ["Aline Barbosa", "Rafaela Nunes", "Extensão de cílios", -2, 11, "concluido", "pago", "cartao", 250],
    ["Daniela Pires", "Dra. Helena Martins", "Harmonização facial", -1, 16, "concluido", "parcial", "pix", 900],
    ["Mariana Costa", "Dra. Helena Martins", "Botox", 0, 9, "confirmado", "pendente", null, 0],
    ["Ana Paula Ribeiro", "Camila Duarte", "Drenagem linfática", 0, 11, "agendado", "pendente", null, 0],
    ["Patrícia Almeida", "Dra. Helena Martins", "Harmonização facial", 0, 15, "confirmado", "parcial", "pix", 540],
    ["Luana Martins", "Marina Lopes", "Bioestimulador de colágeno", 1, 10, "agendado", "pendente", null, 0],
    ["Juliana Rocha", "Camila Duarte", "Microderme corporal", 1, 14, "agendado", "pendente", null, 0],
    ["Bianca Teixeira", "Dra. Helena Martins", "Limpeza de pele premium", 2, 9, "confirmado", "pendente", null, 0],
    ["Sofia Nascimento", "Camila Duarte", "Microderme corporal", 3, 16, "agendado", "pendente", null, 0],
    ["Renata Souza", "Marina Lopes", "Bioestimulador de colágeno", 4, 11, "agendado", "pendente", null, 0],
  ];

  const appointmentsPayload = agendaSeed.map(([cliente, profissional, procedimento, day, hour, status, pagamento_status, forma_pagamento, valor_pago]) => {
    const procedure = procedureByName.get(procedimento);
    const inicio = daysFromNow(Number(day), Number(hour));

    return {
      clinica_id: clinic.id,
      cliente_id: clientByName.get(cliente)?.id || null,
      profissional_id: professionalByName.get(profissional)?.id || null,
      procedimento_id: procedure?.id || null,
      inicio,
      fim: addMinutes(inicio, procedure?.duracao_minutos || 60),
      status,
      valor: procedure?.preco || 0,
      pagamento_status,
      forma_pagamento,
      valor_pago,
      data_pagamento: Number(valor_pago) > 0 ? inicio : null,
      observacoes: "Agendamento fictício para demonstração comercial.",
      created_by: user.id,
    };
  });

  const { data: appointments, error: appointmentError } = await supabaseAdmin
    .from("agendamentos")
    .insert(appointmentsPayload)
    .select("id, clinica_id, cliente_id, profissional_id, procedimento_id, valor, valor_pago, pagamento_status, forma_pagamento, data_pagamento");
  if (appointmentError) throw appointmentError;

  const paidAppointments = (appointments || []).filter((item) => Number(item.valor_pago || 0) > 0);
  if (paidAppointments.length) {
    const { error: paymentError } = await supabaseAdmin.from("pagamentos_clinica").insert(
      paidAppointments.map((item) => ({
        clinica_id: clinic.id,
        cliente_id: item.cliente_id,
        agendamento_id: item.id,
        profissional_id: item.profissional_id,
        descricao: "Pagamento demonstrativo de agendamento",
        valor: item.valor,
        valor_pago: item.valor_pago,
        status: item.pagamento_status,
        forma_pagamento: item.forma_pagamento,
        data_vencimento: new Date(item.data_pagamento || Date.now()).toISOString().slice(0, 10),
        data_pagamento: item.data_pagamento,
        observacoes: "Pagamento fictício para demonstração.",
      }))
    );
    if (paymentError) throw paymentError;
  }
}

export async function resetDemoClinicData(userOverride = null) {
  const user = userOverride || (await findAuthUserByEmail(DEMO_EMAIL));
  if (!user?.id) return null;

  const clinic = await ensureDemoClinic();

  const tables = [
    "site_agendamentos_publicos",
    "pagamentos_clinica",
    "cliente_pacotes",
    "pacotes_procedimentos",
    "pacotes_clinica",
    "cliente_fotos",
    "cliente_consentimentos",
    "agendamentos",
    "crm_oportunidades",
    "clientes",
    "profissionais",
    "procedimentos",
    "usuarios_clinica",
  ];

  for (const table of tables) {
    await safeDelete(table, clinic.id);
  }

  await seedDemoData(clinic, user);
  return clinic;
}

export async function ensureDemoAccountAndReset() {
  const user = await ensureDemoAuthUser();
  await resetDemoClinicData(user);
  return user;
}
