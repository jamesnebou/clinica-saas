import { odontologiaContent } from "./odontologia.js";

const sharedModules = [
  { icon: "calendar", title: "Agenda inteligente", description: "Disponibilidade por profissional, múltiplos procedimentos, reagendamento, cancelamento, sinal e status visual em uma única rotina." },
  { icon: "users", title: "CRM 2.0", description: "Pipeline, origem, responsável, próxima ação, ganho, perda e histórico comercial para cada oportunidade." },
  { icon: "clipboard", title: "Prontuário e evolução", description: "Registros clínicos, consentimentos, anexos e evolução com acesso controlado por função e clínica." },
  { icon: "wallet", title: "Financeiro 2.0", description: "Recebíveis, caixa, DRE, conciliação, parcelamentos e comissões conectados à operação da clínica." },
  { icon: "globe", title: "Site e agendamento online", description: "Site público, serviços, agenda disponível e cobrança de sinal conforme a configuração da clínica." },
  { icon: "workflow", title: "Automações", description: "Regras, esperas, tarefas e comunicações auditáveis para reduzir trabalho repetitivo da equipe." },
  { icon: "chart", title: "BI operacional", description: "Indicadores para acompanhar agenda, produção, receita, recorrência e evolução da operação por período." },
  { icon: "shield", title: "Equipe e permissões", description: "Acessos de gestão, recepção, financeiro e profissionais definidos conforme a responsabilidade de cada pessoa." },
];

const sharedFaqs = [
  ["A NexaWi substitui agenda de papel e planilhas?", "A plataforma centraliza agenda, pacientes, CRM, prontuário e financeiro. A implantação pode ser feita por etapas para respeitar a rotina da clínica."],
  ["A clínica recebe um site próprio?", "Sim. A clínica possui site público editável com identidade visual, serviços, informações de contato e agendamento conectado à disponibilidade real."],
  ["É possível cobrar sinal no agendamento?", "Sim. A clínica pode configurar um gateway disponível na plataforma e definir cobrança de sinal para os serviços publicados."],
  ["O dinheiro do paciente vai para a NexaWi?", "Não. Nos pagamentos da clínica, as credenciais do gateway são configuradas pela própria clínica para que o recebimento siga a conta conectada."],
  ["Posso cadastrar mais de um profissional?", "Sim. A plataforma foi estruturada para equipes, com profissionais, usuários e permissões por clínica conforme os limites do plano contratado."],
  ["O sistema permite mais de um serviço no mesmo agendamento?", "Sim. O fluxo público aceita múltiplos procedimentos e calcula duração, disponibilidade e valor do conjunto selecionado."],
  ["Consigo bloquear datas sem atendimento?", "Sim. A clínica pode manter expediente recorrente e cadastrar datas inativas para impedir novos horários naquele período."],
  ["Como funciona o prontuário?", "O prontuário reúne registros clínicos, consentimentos, anexos e evolução. O acesso depende da função e das permissões definidas para a equipe."],
  ["A recepção vê todas as informações clínicas?", "A plataforma trabalha com papéis e permissões. Informações sensíveis devem permanecer disponíveis apenas para as funções autorizadas."],
  ["Existe controle de pacotes e comissões?", "Sim. O Financeiro 2.0 possui estrutura para pacotes, competência, comissões, contas, caixa, DRE e conciliação."],
  ["Posso testar antes de contratar?", "Sim. A demonstração utiliza dados fictícios e permite conhecer os principais módulos sem acessar informações de uma clínica real."],
  ["Qual plano devo escolher?", "A escolha depende do tamanho da equipe e do volume de pacientes e agendamentos. O formulário comercial ajuda a identificar o plano adequado ao cenário atual."],
];

function landing({
  slug,
  name,
  title,
  description,
  heroTitle,
  heroDescription,
  heroPoints,
  pains,
  workflow,
  roles,
  imageAlt,
  transformationAlt,
  heroImage = "/marketing/multisegment-hero.jpg",
  transformationImage = "/marketing/multisegment-hero.jpg",
  extraFaqs = [],
}) {
  return {
    slug,
    name,
    metadata: { title, description },
    hero: {
      eyebrow: `Gestão para ${name.toLocaleLowerCase("pt-BR")}`,
      title: heroTitle,
      description: heroDescription,
      image: heroImage,
      imageAlt,
      primaryCta: { label: "Quero organizar minha clínica", href: "#contato" },
      secondaryCta: { label: "Ver demonstração", href: "/demo" },
      points: heroPoints,
    },
    transformation: {
      image: transformationImage,
      imageAlt: transformationAlt,
    },
    pains,
    modules: sharedModules,
    workflow,
    roles,
    faqs: [...extraFaqs, ...sharedFaqs],
  };
}

export const marketingSegments = [
  { slug: "estetica", name: "Estética", description: "Agenda, avaliação, evolução, pacotes e retorno em uma operação conectada." },
  { slug: "odontologia", name: "Odontologia", description: "Organização de pacientes, agenda por profissional e acompanhamento financeiro." },
  { slug: "fisioterapia", name: "Fisioterapia", description: "Planos de atendimento, evolução e recorrência com visão de equipe." },
  { slug: "medicina", name: "Medicina", description: "Rotina clínica, prontuário, permissões e indicadores em um único ambiente." },
  { slug: "psicologia", name: "Psicologia", description: "Agenda reservada, histórico protegido e controle de pagamentos." },
  { slug: "nutricao", name: "Nutrição", description: "Jornada do paciente, retornos, documentos e relacionamento organizado." },
  { slug: "pilates", name: "Pilates", description: "Horários recorrentes, profissionais, pacotes e relacionamento em uma única rotina." },
  { slug: "multidisciplinar", name: "Multidisciplinar", description: "Várias especialidades operando com dados e permissões por clínica." },
];

export const esteticaLanding = landing({
  slug: "estetica",
  name: "Clínicas de Estética",
  heroImage: "/marketing/estetica/hero.jpg",
  transformationImage: "/marketing/estetica/consultation.jpg",
  title: "Sistema para Clínica de Estética | NexaWi Clínicas",
  description: "Agenda, CRM, prontuário, financeiro, site e automações para clínicas de estética que querem organizar a operação e crescer com controle.",
  heroTitle: "Sua clínica cresce. A operação precisa acompanhar.",
  heroDescription: "A NexaWi conecta captação, agenda, atendimento, prontuário e financeiro para sua equipe trabalhar com clareza do primeiro contato ao próximo retorno.",
  heroPoints: ["Site e agendamento conectados", "CRM, agenda e prontuário integrados", "Financeiro e indicadores por período"],
  imageAlt: "Gestão digital de uma clínica de estética com equipe e pacientes",
  transformationAlt: "Equipe de clínica de estética organizando a jornada de atendimento",
  pains: [
    { title: "Agenda fragmentada", description: "Horários, confirmações e encaixes espalhados entre conversas, papel e planilhas." },
    { title: "Leads sem acompanhamento", description: "Pessoas interessadas pedem informações, mas não existe uma próxima ação visível para a equipe." },
    { title: "Financeiro sem contexto", description: "Sinais, pacotes, comissões e recebimentos ficam desconectados do atendimento que gerou a receita." },
    { title: "Retorno no improviso", description: "A equipe atende bem, mas perde o momento certo de recomendar e acompanhar o próximo procedimento." },
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
});

const odontologiaCurrentLanding = landing({
  slug: "odontologia",
  name: "Clínicas Odontológicas",
  title: "Sistema para Clínica Odontológica | NexaWi Clínicas",
  description: "Agenda por profissional, pacientes, CRM, prontuário, financeiro, site e automações para clínicas odontológicas.",
  heroTitle: "Mais controle da agenda ao fechamento do tratamento.",
  heroDescription: "Organize pacientes, profissionais, oportunidades, atendimentos e recebimentos sem reconstruir o contexto em várias ferramentas.",
  heroPoints: ["Agenda por profissional", "CRM e histórico do paciente", "Financeiro ligado ao atendimento"],
  imageAlt: "Equipe odontológica utilizando uma plataforma de gestão clínica",
  transformationAlt: "Equipe odontológica acompanhando pacientes e agenda em uma operação digital",
  pains: [
    { title: "Agenda por profissional difícil de coordenar", description: "Mudanças, encaixes e horários ficam dependentes de conferência manual entre recepção e equipe." },
    { title: "Orçamentos sem próxima ação", description: "Interesses e retornos se perdem quando não existe pipeline, responsável e histórico comercial." },
    { title: "Recebimentos espalhados", description: "Sinais, parcelas e pagamentos ficam distantes do atendimento e dificultam a visão financeira." },
    { title: "Histórico fragmentado", description: "Informações do paciente ficam distribuídas entre conversas, arquivos e sistemas diferentes." },
  ],
  workflow: [
    { label: "Captar", description: "O site e o CRM registram a origem e o interesse do paciente." },
    { label: "Agendar", description: "A recepção organiza disponibilidade por profissional e serviço." },
    { label: "Atender", description: "O histórico e os registros clínicos acompanham o atendimento." },
    { label: "Receber", description: "Sinal, parcelas e recebíveis ficam ligados à operação." },
    { label: "Retomar", description: "CRM e automações ajudam a manter retornos e próximas ações visíveis." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda por profissional", "Cadastro e histórico de contato", "Pendências e confirmações visíveis"] },
    { title: "Para dentistas", items: ["Agenda individual", "Registros clínicos protegidos", "Produção e comissões relacionadas ao atendimento"] },
    { title: "Para a gestão", items: ["Funil de oportunidades", "Receita e recebíveis", "Visão de equipe e permissões"] },
  ],
  extraFaqs: [
    ["A NexaWi funciona para clínicas com vários dentistas?", "Sim. A estrutura é multiusuário e permite organizar profissionais, agenda, permissões e produção dentro da mesma clínica."],
  ],
});

export const odontologiaLanding = {
  ...odontologiaCurrentLanding,
  ...odontologiaContent,
  faqs: [...odontologiaCurrentLanding.faqs, ...(odontologiaContent.faqs || [])],
};

export const fisioterapiaLanding = landing({
  slug: "fisioterapia",
  name: "Clínicas de Fisioterapia",
  title: "Sistema para Clínica de Fisioterapia | NexaWi Clínicas",
  description: "Agenda recorrente, pacientes, evolução, pacotes, financeiro, CRM e automações para clínicas de fisioterapia.",
  heroTitle: "Sessões recorrentes sem perder evolução, agenda ou recebimento.",
  heroDescription: "A NexaWi conecta a jornada do paciente, os atendimentos da equipe e o financeiro para reduzir retrabalho entre cada sessão.",
  heroPoints: ["Agenda e recorrência organizadas", "Evolução e histórico protegidos", "Pacotes e financeiro conectados"],
  imageAlt: "Equipe de fisioterapia organizando atendimentos com tecnologia",
  transformationAlt: "Profissionais de fisioterapia acompanhando uma rotina de pacientes",
  pains: [
    { title: "Muitas sessões para acompanhar", description: "Reagendamentos, faltas e retornos aumentam o volume operacional da recepção." },
    { title: "Evolução espalhada", description: "A continuidade do atendimento perde contexto quando registros ficam em locais diferentes." },
    { title: "Pacotes difíceis de conciliar", description: "Sessões consumidas, valores e recebimentos exigem conferência manual." },
    { title: "Recorrência sem visão de gestão", description: "A clínica atende continuamente, mas nem sempre enxerga ocupação, receita e retorno por período." },
  ],
  workflow: [
    { label: "Captar", description: "O CRM registra origem, interesse e responsável pelo próximo contato." },
    { label: "Agendar", description: "A agenda organiza profissional, serviço, data e horário." },
    { label: "Atender", description: "A equipe mantém histórico e evolução vinculados ao paciente." },
    { label: "Controlar", description: "Pacotes, pagamentos e produção permanecem conectados." },
    { label: "Reavaliar", description: "Indicadores e próximas ações ajudam a acompanhar continuidade e retorno." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e reagendamentos centralizados", "Pacientes e pendências visíveis", "Menos conferência manual"] },
    { title: "Para fisioterapeutas", items: ["Agenda individual", "Histórico e evolução do paciente", "Produção vinculada aos atendimentos"] },
    { title: "Para a gestão", items: ["Ocupação e receita por período", "Pacotes e recebíveis", "Indicadores de faltas e recorrência"] },
  ],
});

export const medicinaLanding = landing({
  slug: "medicina",
  name: "Clínicas Médicas",
  title: "Sistema para Clínica Médica | NexaWi Clínicas",
  description: "Agenda, pacientes, prontuário, financeiro, permissões, CRM e indicadores para clínicas médicas.",
  heroTitle: "Uma operação clínica organizada antes, durante e depois da consulta.",
  heroDescription: "Centralize agenda, relacionamento, registros clínicos, recebimentos e indicadores com responsabilidades claras para cada função da equipe.",
  heroPoints: ["Prontuário com acesso controlado", "Agenda e pacientes conectados", "Gestão financeira e indicadores"],
  imageAlt: "Equipe de clínica médica utilizando tecnologia para organizar a operação",
  transformationAlt: "Equipe médica acompanhando agenda, pacientes e gestão",
  pains: [
    { title: "Recepção sobrecarregada", description: "Confirmações, encaixes, cadastros e retornos competem pelo tempo da equipe." },
    { title: "Contexto clínico e operacional separado", description: "A consulta acontece em uma rotina e o administrativo em outra, aumentando retrabalho." },
    { title: "Permissões pouco claras", description: "Cada função precisa acessar somente o necessário para cumprir sua responsabilidade." },
    { title: "Gestão sem leitura consolidada", description: "Agenda, produção e financeiro separados atrasam decisões sobre a clínica." },
  ],
  workflow: [
    { label: "Agendar", description: "A recepção organiza disponibilidade e cadastro do paciente." },
    { label: "Preparar", description: "Histórico e informações operacionais ficam disponíveis conforme a permissão." },
    { label: "Atender", description: "O profissional registra evolução no contexto correto do paciente." },
    { label: "Receber", description: "Recebíveis e status financeiro permanecem ligados à operação." },
    { label: "Acompanhar", description: "CRM, agenda e indicadores apoiam retornos e gestão." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e cadastro em um único fluxo", "Confirmações e pendências claras", "Acesso restrito ao necessário"] },
    { title: "Para profissionais", items: ["Agenda individual", "Registros clínicos protegidos", "Histórico organizado por paciente"] },
    { title: "Para a gestão", items: ["Receita e produção", "Indicadores operacionais", "Papéis e permissões por responsabilidade"] },
  ],
});

export const psicologiaLanding = landing({
  slug: "psicologia",
  name: "Clínicas de Psicologia",
  title: "Sistema para Clínica de Psicologia | NexaWi Clínicas",
  description: "Agenda reservada, registros protegidos, financeiro, CRM e gestão para clínicas e equipes de psicologia.",
  heroTitle: "Organização para a clínica sem abrir mão da privacidade.",
  heroDescription: "A NexaWi ajuda a separar responsabilidades administrativas e clínicas, conectando agenda, pacientes, financeiro e histórico com controle de acesso.",
  heroPoints: ["Papéis e permissões", "Agenda e recorrência", "Financeiro e histórico operacional"],
  imageAlt: "Clínica de psicologia utilizando uma plataforma de gestão com privacidade",
  transformationAlt: "Equipe de psicologia organizando atendimentos e administração",
  pains: [
    { title: "Agenda recorrente exige atenção constante", description: "Mudanças de horário, faltas e retornos aumentam o trabalho administrativo." },
    { title: "Privacidade precisa estar no processo", description: "Informações clínicas não devem ficar expostas a quem atua somente no administrativo." },
    { title: "Cobranças manuais consomem tempo", description: "Recebimentos e pendências podem se perder quando não estão ligados ao atendimento." },
    { title: "Histórico comercial e clínico se misturam", description: "A equipe precisa de contexto sem transformar toda informação em acesso geral." },
  ],
  workflow: [
    { label: "Receber", description: "O contato entra pelo site, CRM ou recepção." },
    { label: "Agendar", description: "Horários e profissionais são organizados na agenda." },
    { label: "Atender", description: "Registros clínicos permanecem no contexto protegido do paciente." },
    { label: "Receber pagamento", description: "Pendências e recebimentos ficam visíveis à função autorizada." },
    { label: "Manter vínculo", description: "Retornos e próximas ações permanecem organizados sem expor conteúdo clínico." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e contatos sem acesso clínico desnecessário", "Pendências operacionais visíveis", "Menos informação espalhada"] },
    { title: "Para psicólogos", items: ["Agenda individual", "Registros protegidos", "Histórico organizado por paciente"] },
    { title: "Para a gestão", items: ["Financeiro e ocupação", "Permissões da equipe", "Indicadores operacionais"] },
  ],
});

export const nutricaoLanding = landing({
  slug: "nutricao",
  name: "Clínicas de Nutrição",
  title: "Sistema para Clínica de Nutrição | NexaWi Clínicas",
  description: "Agenda, pacientes, retornos, prontuário, CRM, financeiro e automações para clínicas de nutrição.",
  heroTitle: "Do primeiro contato ao retorno, sem perder a jornada do paciente.",
  heroDescription: "Organize agenda, histórico, relacionamento, pagamentos e indicadores para acompanhar uma rotina que depende de continuidade.",
  heroPoints: ["Retornos organizados", "Histórico e prontuário", "CRM e financeiro conectados"],
  imageAlt: "Clínica de nutrição organizando pacientes e retornos com tecnologia",
  transformationAlt: "Profissional de nutrição acompanhando a jornada de pacientes",
  pains: [
    { title: "Retornos dependem de memória", description: "Sem próxima ação visível, pacientes podem sair do acompanhamento antes do planejado." },
    { title: "Histórico disperso", description: "Informações de atendimento e relacionamento ficam separadas em várias ferramentas." },
    { title: "Agenda e financeiro não conversam", description: "Recebimentos e pendências ficam distantes da consulta que gerou a receita." },
    { title: "Captação sem acompanhamento", description: "Novos contatos chegam, mas a clínica não enxerga claramente quem precisa de retorno comercial." },
  ],
  workflow: [
    { label: "Atrair", description: "Site e tracking registram a origem do interesse." },
    { label: "Converter", description: "O CRM organiza etapa, responsável e próxima ação." },
    { label: "Agendar", description: "Paciente, profissional e horário entram na agenda." },
    { label: "Acompanhar", description: "Histórico e registros permanecem organizados por paciente." },
    { label: "Retornar", description: "CRM, automações e indicadores ajudam a manter a continuidade." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e retornos", "Cadastro sem duplicação", "Pendências mais claras"] },
    { title: "Para nutricionistas", items: ["Agenda individual", "Histórico do paciente", "Registros de evolução protegidos"] },
    { title: "Para a gestão", items: ["Conversão e recorrência", "Receita e recebíveis", "Indicadores da operação"] },
  ],
});

export const pilatesLanding = landing({
  slug: "pilates",
  name: "Estúdios e Clínicas de Pilates",
  title: "Sistema para Pilates | NexaWi Clínicas",
  description: "Agenda recorrente, alunos, profissionais, pacotes, financeiro, CRM e automações para operações de Pilates.",
  heroTitle: "Rotina recorrente organizada sem depender de planilhas.",
  heroDescription: "Acompanhe horários, alunos, profissionais, pacotes, recebimentos e relacionamento em uma plataforma conectada.",
  heroPoints: ["Agenda recorrente", "Pacotes e recebimentos", "Equipe e relacionamento"],
  imageAlt: "Estúdio de Pilates utilizando tecnologia para organizar alunos e horários",
  transformationAlt: "Equipe de Pilates organizando agenda, alunos e financeiro",
  pains: [
    { title: "Horários recorrentes dão trabalho", description: "Mudanças, faltas e reposições aumentam a complexidade operacional ao longo do mês." },
    { title: "Pacotes exigem conferência", description: "Sessões, valores e pagamentos podem depender de controles paralelos." },
    { title: "Relacionamento sem histórico", description: "Contatos, retornos e informações dos alunos ficam espalhados." },
    { title: "Gestão sem visão consolidada", description: "Agenda cheia não significa necessariamente leitura clara de receita e pendências." },
  ],
  workflow: [
    { label: "Captar", description: "O CRM organiza novos contatos e origem." },
    { label: "Agendar", description: "Horários e profissionais ficam visíveis em uma única agenda." },
    { label: "Atender", description: "O histórico do aluno acompanha a operação." },
    { label: "Controlar", description: "Pacotes, recebíveis e pagamentos permanecem conectados." },
    { label: "Relacionar", description: "Automação e CRM ajudam a manter retornos e próximas ações." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda e alterações centralizadas", "Alunos e contatos organizados", "Pendências financeiras visíveis"] },
    { title: "Para profissionais", items: ["Agenda individual", "Histórico do aluno", "Produção vinculada à rotina"] },
    { title: "Para a gestão", items: ["Ocupação e receita", "Pacotes e pagamentos", "Indicadores por período"] },
  ],
});

export const multidisciplinarLanding = landing({
  slug: "multidisciplinar",
  name: "Clínicas Multidisciplinares",
  title: "Sistema para Clínica Multidisciplinar | NexaWi Clínicas",
  description: "Uma plataforma para clínicas com diferentes especialidades, equipes, agendas, permissões, financeiro, CRM e BI.",
  heroTitle: "Várias especialidades. Uma operação que continua organizada.",
  heroDescription: "A NexaWi mantém uma base única de gestão e adapta terminologia, acessos e contexto para equipes com rotinas diferentes dentro da mesma clínica.",
  heroPoints: ["Várias especialidades", "Permissões por responsabilidade", "Gestão consolidada"],
  imageAlt: "Equipe multidisciplinar utilizando uma plataforma única de gestão clínica",
  transformationAlt: "Profissionais de diferentes especialidades organizando uma clínica em conjunto",
  pains: [
    { title: "Cada especialidade cria seu próprio processo", description: "A clínica perde visão consolidada quando cada área depende de uma ferramenta diferente." },
    { title: "Permissões ficam difíceis de administrar", description: "Nem todo profissional deve acessar toda informação da operação ou do prontuário." },
    { title: "Agenda da equipe vira um quebra-cabeça", description: "Profissionais, serviços e horários diferentes aumentam a necessidade de uma visão central." },
    { title: "Gestão fragmentada", description: "Financeiro, CRM e indicadores separados impedem uma leitura única da clínica." },
  ],
  workflow: [
    { label: "Centralizar", description: "Cadastros, contatos e agenda entram em uma base comum por clínica." },
    { label: "Direcionar", description: "Profissional, especialidade e serviço definem o fluxo operacional." },
    { label: "Atender", description: "Cada função acessa o contexto necessário dentro de suas permissões." },
    { label: "Consolidar", description: "Financeiro e CRM reúnem a operação sem duplicar fontes de verdade." },
    { label: "Gerir", description: "BI e automações ajudam a acompanhar a clínica como um todo." },
  ],
  roles: [
    { title: "Para a recepção", items: ["Agenda de diferentes profissionais", "Cadastros e contatos centralizados", "Visão operacional sem acesso clínico desnecessário"] },
    { title: "Para profissionais", items: ["Agenda e pacientes da rotina autorizada", "Prontuário conforme permissões", "Contexto da própria produção"] },
    { title: "Para a gestão", items: ["Financeiro consolidado", "CRM da clínica", "Papéis, permissões e indicadores"] },
  ],
  extraFaqs: [
    ["A mesma clínica pode trabalhar com diferentes especialidades?", "Sim. A arquitetura da NexaWi foi pensada para uma base multi-segmento e permite organizar profissionais, serviços e permissões dentro da mesma clínica."],
  ],
});

const landingBySlug = {
  estetica: esteticaLanding,
  odontologia: odontologiaLanding,
  fisioterapia: fisioterapiaLanding,
  medicina: medicinaLanding,
  psicologia: psicologiaLanding,
  nutricao: nutricaoLanding,
  pilates: pilatesLanding,
  multidisciplinar: multidisciplinarLanding,
};

export function getSegmentLanding(slug) {
  return Object.hasOwn(landingBySlug, slug) ? landingBySlug[slug] : null;
}
