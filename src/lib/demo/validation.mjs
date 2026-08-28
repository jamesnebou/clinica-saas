import { DEMO_MUTABLE_TABLES } from "./dataset.mjs";

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function assertReferences(dataset, { sourceTable, sourceColumn, targetTable, targetColumn = "id", nullable = true }) {
  const targetValues = new Set(dataset.tables[targetTable].map((row) => row[targetColumn]).filter(Boolean));

  for (const row of dataset.tables[sourceTable]) {
    const value = row[sourceColumn];
    if ((value === null || value === undefined || value === "") && nullable) continue;
    if (!targetValues.has(value)) {
      throw new Error(
        `Referência inválida em ${sourceTable}.${sourceColumn}: ${value} não existe em ${targetTable}.${targetColumn}.`,
      );
    }
  }
}

export function validateDemoIdentity({ user, clinic, membership, expectedEmail, expectedSlug }) {
  const errors = [];
  const userEmail = normalized(user?.email);
  const clinicEmail = normalized(clinic?.email);
  const membershipEmail = normalized(membership?.email);

  if (!user?.id) errors.push("Usuário Auth ausente.");
  if (user?.app_metadata?.demo_account !== true) errors.push("Usuário Auth sem marcação demo.");
  if (!userEmail || userEmail !== normalized(expectedEmail)) errors.push("E-mail Auth divergente.");
  if (!clinic?.id) errors.push("Clínica ausente.");
  if (normalized(clinic?.slug) !== normalized(expectedSlug)) errors.push("Slug da clínica divergente.");
  if (clinic?.metadata?.demo !== true) errors.push("Clínica sem marcação demo.");
  if (clinicEmail !== normalized(expectedEmail)) errors.push("E-mail da clínica divergente.");
  if (!membership?.ativo) errors.push("Vínculo demo inativo.");
  if (membership?.user_id !== user?.id) errors.push("Vínculo demo pertence a outro usuário.");
  if (membershipEmail !== normalized(expectedEmail)) errors.push("E-mail do vínculo divergente.");

  if (errors.length) {
    const error = new Error(`Identidade demo inválida: ${errors.join(" ")}`);
    error.code = "DEMO_IDENTITY_INVALID";
    throw error;
  }

  return true;
}

export function validateDemoDataset(dataset, { clinicId, version } = {}) {
  if (!dataset || typeof dataset !== "object") throw new Error("Dataset demo ausente.");
  if (dataset.version !== version) throw new Error("Versão do dataset demo incompatível.");
  if (dataset.clinicId !== clinicId) throw new Error("Tenant do dataset demo incompatível.");
  if (!dataset.tables || typeof dataset.tables !== "object") throw new Error("Tabelas do dataset demo ausentes.");

  for (const tableName of DEMO_MUTABLE_TABLES) {
    const rows = dataset.tables[tableName];
    if (!Array.isArray(rows)) throw new Error(`Dataset demo sem a tabela ${tableName}.`);

    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Linha inválida em ${tableName}.`);
      if (row.clinica_id !== clinicId) throw new Error(`Tenant divergente em ${tableName}.`);
      if (row.id) {
        if (ids.has(row.id)) throw new Error(`ID duplicado em ${tableName}: ${row.id}`);
        ids.add(row.id);
      }
    }
  }

  const requiredMinimums = {
    clientes: 10,
    profissionais: 3,
    procedimentos: 5,
    agendamentos: 10,
    crm_oportunidades: 7,
    finance_recebiveis: 5,
    finance_pagaveis: 2,
  };
  for (const [tableName, minimum] of Object.entries(requiredMinimums)) {
    if (dataset.tables[tableName].length < minimum) {
      throw new Error(`Dataset demo insuficiente em ${tableName}.`);
    }
  }

  const references = [
    ["agendamentos", "cliente_id", "clientes"],
    ["agendamentos", "profissional_id", "profissionais"],
    ["agendamentos", "procedimento_id", "procedimentos"],
    ["agendamentos", "crm_oportunidade_id", "crm_oportunidades"],
    ["crm_oportunidades", "cliente_id", "clientes"],
    ["crm_oportunidades", "pipeline_id", "crm_pipelines"],
    ["crm_oportunidades", "stage_id", "crm_pipeline_stages"],
    ["crm_pipeline_stages", "pipeline_id", "crm_pipelines"],
    ["crm_activities", "opportunity_id", "crm_oportunidades"],
    ["crm_opportunity_events", "opportunity_id", "crm_oportunidades"],
    ["crm_opportunity_tags", "opportunity_id", "crm_oportunidades"],
    ["crm_opportunity_tags", "tag_id", "crm_tags"],
    ["crm_opportunity_appointments", "opportunity_id", "crm_oportunidades"],
    ["crm_opportunity_appointments", "agendamento_id", "agendamentos"],
  ];

  for (const [sourceTable, sourceColumn, targetTable] of references) {
    assertReferences(dataset, { sourceTable, sourceColumn, targetTable });
  }

  return true;
}

export function summarizeDemoDataset(dataset) {
  return Object.fromEntries(Object.entries(dataset.tables).map(([table, rows]) => [table, rows.length]));
}
