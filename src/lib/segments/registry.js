export const CORE_CAPABILITIES = Object.freeze([
  "agenda", "clientes", "profissionais", "procedimentos", "crm", "financeiro",
  "estoque", "ecommerce", "site", "pagamentos", "bi", "marketing",
  "automacoes", "integracoes", "whatsapp",
]);

const DEFAULT_TERMINOLOGY = Object.freeze({
  cliente: "Cliente", clientes: "Clientes", procedimento: "Procedimento",
  procedimentos: "Procedimentos", profissional: "Profissional", profissionais: "Profissionais",
});

/**
 * @typedef {Object} SegmentDefinition
 * @property {string} slug
 * @property {string} name
 * @property {Record<string, string>} labels
 * @property {readonly string[]} capabilities
 * @property {readonly string[]} defaultModules
 * @property {readonly string[]} clinicalForms
 * @property {readonly string[]} priorityKpis
 */

/** @type {Readonly<Record<string, SegmentDefinition>>} */
export const SEGMENT_REGISTRY = Object.freeze({
  estetica: Object.freeze({
    slug: "estetica", name: "Estética", labels: DEFAULT_TERMINOLOGY,
    capabilities: Object.freeze([...CORE_CAPABILITIES, "fotos_antes_depois", "protocolos_esteticos"]),
    defaultModules: Object.freeze(["agenda", "clientes", "crm", "financeiro", "bi", "site"]),
    clinicalForms: Object.freeze(["anamnese_estetica", "consentimento", "evolucao_fotografica"]),
    priorityKpis: Object.freeze(["receita_recebida", "ocupacao", "retencao_90", "conversao_crm"]),
  }),
  fisioterapia: Object.freeze({
    slug: "fisioterapia", name: "Fisioterapia",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Atendimento", procedimentos: "Atendimentos", profissional: "Fisioterapeuta", profissionais: "Fisioterapeutas" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "evolucao_fisioterapeutica", "avaliacao_funcional", "plano_terapeutico", "perimetria"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["avaliacao_funcional", "evolucao_fisioterapeutica"]),
    priorityKpis: Object.freeze(["ocupacao", "retencao_30", "sessoes_realizadas", "receita_recebida"]),
  }),
  odontologia: Object.freeze({
    slug: "odontologia", name: "Odontologia",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Tratamento", procedimentos: "Tratamentos", profissional: "Dentista", profissionais: "Dentistas" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "odontograma", "plano_tratamento_odonto", "receituario", "prescricoes"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["odontograma", "anamnese_odontologica"]),
    priorityKpis: Object.freeze(["planos_tratamento", "conversao_crm", "receita_recebida", "retencao_180"]),
  }),
  medicina: Object.freeze({
    slug: "medicina", name: "Medicina / Consultório",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Consulta", procedimentos: "Consultas" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "receituario", "prescricoes", "teleatendimento"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["anamnese_clinica", "evolucao_clinica"]),
    priorityKpis: Object.freeze(["ocupacao", "retencao_90", "no_show", "receita_recebida"]),
  }),
  psicologia: Object.freeze({
    slug: "psicologia", name: "Psicologia",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Sessão", procedimentos: "Sessões", profissional: "Psicólogo", profissionais: "Psicólogos" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "teleatendimento", "plano_terapeutico"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["evolucao_psicologica"]),
    priorityKpis: Object.freeze(["retencao_30", "no_show", "ocupacao", "receita_recebida"]),
  }),
  nutricao: Object.freeze({
    slug: "nutricao", name: "Nutrição",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Consulta", procedimentos: "Consultas", profissional: "Nutricionista", profissionais: "Nutricionistas" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "avaliacao_funcional", "plano_terapeutico", "teleatendimento"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["anamnese_nutricional", "evolucao_nutricional"]),
    priorityKpis: Object.freeze(["retencao_30", "retencao_90", "ocupacao", "receita_recebida"]),
  }),
  pilates: Object.freeze({
    slug: "pilates", name: "Pilates",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Aluno", clientes: "Alunos", procedimento: "Aula", procedimentos: "Aulas", profissional: "Instrutor", profissionais: "Instrutores" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "avaliacao_funcional", "plano_terapeutico", "perimetria"]),
    defaultModules: Object.freeze(["agenda", "clientes", "financeiro", "bi"]), clinicalForms: Object.freeze(["avaliacao_funcional", "evolucao_pilates"]),
    priorityKpis: Object.freeze(["ocupacao", "retencao_30", "sessoes_realizadas", "inadimplencia"]),
  }),
  multidisciplinar: Object.freeze({
    slug: "multidisciplinar", name: "Multidisciplinar",
    labels: Object.freeze({ ...DEFAULT_TERMINOLOGY, cliente: "Paciente", clientes: "Pacientes", procedimento: "Atendimento", procedimentos: "Atendimentos" }),
    capabilities: Object.freeze([...CORE_CAPABILITIES, "multiunidade"]),
    defaultModules: Object.freeze(["agenda", "clientes", "crm", "financeiro", "bi"]), clinicalForms: Object.freeze([]),
    priorityKpis: Object.freeze(["receita_recebida", "ocupacao", "retencao_90", "participacao_profissional"]),
  }),
});

export const SEGMENT_OPTIONS = Object.freeze(Object.values(SEGMENT_REGISTRY).map(({ slug, name }) => ({ slug, name })));

export function getSegmentDefinition(slug = "estetica") {
  return SEGMENT_REGISTRY[slug] || SEGMENT_REGISTRY.estetica;
}

export function getTerminologyForSegments(slugs = []) {
  const primary = getSegmentDefinition(slugs[0] || "estetica");
  return { ...DEFAULT_TERMINOLOGY, ...primary.labels };
}

export function getCapabilitiesForSegments(slugs = []) {
  const selected = slugs.length ? slugs : ["estetica"];
  return [...new Set(selected.flatMap((slug) => getSegmentDefinition(slug).capabilities))];
}
