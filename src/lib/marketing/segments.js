export const marketingSegments = [
  { slug: "estetica", name: "Estética", description: "Agenda, avaliação, evolução, pacotes e retorno em uma operação conectada." },
  { slug: "odontologia", name: "Odontologia", description: "Organização de pacientes, agenda por profissional e acompanhamento financeiro." },
  { slug: "fisioterapia", name: "Fisioterapia", description: "Planos de atendimento, evolução e recorrência com visão de equipe." },
  { slug: "medicina", name: "Medicina", description: "Rotina clínica, prontuário, permissões e indicadores em um único ambiente." },
  { slug: "psicologia", name: "Psicologia", description: "Agenda reservada, histórico protegido e controle de pagamentos." },
  { slug: "nutricao", name: "Nutrição", description: "Jornada do paciente, retornos, documentos e relacionamento organizado." },
  { slug: "pilates", name: "Pilates", description: "Turmas, horários, profissionais, mensalidades e relacionamento recorrente." },
  { slug: "multidisciplinar", name: "Multidisciplinar", description: "Várias especialidades operando com dados e permissões por clínica." },
];

export const esteticaLanding = {
  slug: "estetica",
  name: "Clínicas de Estética",
  metadata: {
    title: "Sistema para Clínica de Estética | NexaWi Clínicas",
    description: "Agenda, CRM, prontuário, financeiro, site e automações para clínicas de estética que querem organizar a operação e crescer com controle.",
  },
  hero: {
    eyebrow: "Gestão para clínicas de estética",
    title: "Sua clínica cresce. A operação precisa acompanhar.",
    description: "A NexaWi conecta captação, agenda, atendimento, prontuário e financeiro para sua equipe trabalhar com clareza do primeiro contato ao próximo retorno.",
    image: "/marketing/estetica/hero.jpg",
    imageAlt: "Gestora de clínica de estética organizando a operação em um tablet",
    primaryCta: { label: "Quero organizar minha clínica", href: "#contato" },
    secondaryCta: { label: "Ver demonstração", href: "/demo" },
    points: ["Site e agendamento conectados", "CRM, agenda e prontuário integrados", "Financeiro e indicadores por período"],
  },
  pains: [
    { title: "Agenda fragmentada", description: "Horários, confirmações e encaixes espalhados entre conversas, papel e planilhas." },
    { title: "Leads sem acompanhamento", description: "Pessoas interessadas pedem informações, mas não existe uma próxima ação visível para a equipe." },
    { title: "Financeiro sem contexto", description: "Sinais, pacotes, comissões e recebimentos ficam desconectados do atendimento que gerou a receita." },
    { title: "Retorno no improviso", description: "A equipe atende bem, mas perde o momento certo de recomendar e acompanhar o próximo procedimento." },
  ],
  modules: [
    { icon: "calendar", title: "Agenda inteligente", description: "Disponibilidade por profissional, múltiplos procedimentos, reagendamento, cancelamento, sinal e status visual." },
    { icon: "users", title: "CRM 2.0", description: "Pipeline, origem, responsável, próxima ação, ganho, perda e histórico comercial para cada oportunidade." },
    { icon: "clipboard", title: "Prontuário e evolução", description: "Anamnese, contraindicações, consentimentos, registros e fotos com acesso controlado por função." },
    { icon: "wallet", title: "Financeiro 2.0", description: "Contas a pagar e receber, caixa, DRE, conciliação, pacotes, parcelamento e comissões." },
    { icon: "globe", title: "Site e checkout", description: "Site editável, procedimentos, agenda disponível e pagamento de sinal com gateway configurado pela clínica." },
    { icon: "workflow", title: "Automações", description: "Regras, esperas, tarefas e comunicações auditáveis para reduzir trabalho repetitivo da equipe." },
    { icon: "chart", title: "BI operacional", description: "Indicadores para acompanhar agenda, produção, receita e evolução da operação por período." },
    { icon: "shield", title: "Equipe e permissões", description: "Acessos de gestão, recepção, financeiro e profissionais definidos conforme a responsabilidade de cada pessoa." },
  ],
  workflow: [
    { label: "Atrair", description: "O site apresenta a clínica e registra a origem da oportunidade." },
    { label: "Converter", description: "A pessoa escolhe procedimentos, profissional, data e horário disponíveis." },
    { label: "Confirmar", description: "O sinal e o status do agendamento entram no mesmo fluxo operacional." },
    { label: "Atender", description: "A equipe consulta histórico, registra evolução e mantém o prontuário organizado." },
    { label: "Acompanhar", description: "Financeiro, CRM e automações apoiam cobrança, retorno e relacionamento." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e status em uma única visão", "Dados do paciente sem retrabalho", "Confirmações e pendências mais claras"] },
    { title: "Para profissionais", items: ["Histórico e evolução durante o atendimento", "Agenda individual e serviços vinculados", "Comissões relacionadas à produção"] },
    { title: "Para a gestão", items: ["Receita prevista, recebida e pendente", "Funil comercial e origem das oportunidades", "Permissões e trilha operacional"] },
  ],
  faqs: [
    ["A NexaWi substitui a agenda de papel e as planilhas?", "A plataforma centraliza agenda, pacientes, CRM, prontuário e financeiro. A implantação pode ser feita por etapas para respeitar a rotina da clínica."],
    ["A clínica recebe um site próprio?", "Sim. A clínica possui site público editável com identidade visual, procedimentos, informações de contato e agendamento conectado à disponibilidade real."],
    ["É possível cobrar sinal no agendamento?", "Sim. A clínica pode configurar o gateway disponível na plataforma e definir a cobrança de sinal para seus procedimentos."],
    ["O dinheiro do paciente vai para a NexaWi?", "Não. No fluxo de pagamentos da clínica, as credenciais do gateway são configuradas pela própria clínica para que o recebimento siga a conta conectada."],
    ["Posso cadastrar mais de um profissional?", "Sim. Cada plano possui limites de usuários, profissionais, pacientes e agendamentos apresentados na seção de planos."],
    ["O sistema permite mais de um procedimento no mesmo agendamento?", "Sim. O fluxo público aceita múltiplos procedimentos e calcula duração, disponibilidade e valor do conjunto selecionado."],
    ["Consigo bloquear feriados ou datas sem atendimento?", "Sim. A clínica pode cadastrar datas inativas e um motivo opcional, além de manter o expediente recorrente."],
    ["Como funciona o prontuário?", "O prontuário reúne registros clínicos, consentimentos, anexos e evolução. O acesso depende da função e das permissões definidas para a equipe."],
    ["A recepção vê todas as informações clínicas?", "A plataforma trabalha com papéis e permissões. A visibilidade de informações sensíveis deve seguir a responsabilidade operacional de cada função."],
    ["Existe controle de pacotes e comissões?", "Sim. O Financeiro 2.0 inclui estrutura para pacotes, competência, comissões, contas, caixa, DRE e conciliação."],
    ["Posso testar antes de contratar?", "Sim. A demonstração utiliza dados fictícios e permite conhecer os principais módulos sem acessar informações de uma clínica real."],
    ["Qual plano devo escolher?", "A escolha depende do tamanho da equipe e do volume de pacientes e agendamentos. O formulário permite pedir uma recomendação com base na sua operação."],
  ],
};

export function getSegmentLanding(slug) {
  if (slug === esteticaLanding.slug) return esteticaLanding;
  return null;
}
