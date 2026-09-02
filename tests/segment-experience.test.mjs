import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SEGMENT_OPTIONS, getSegmentDefinition, getTerminologyForSegments } from "../src/lib/segments/registry.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cada área do onboarding possui uma terminologia operacional completa", () => {
  for (const option of SEGMENT_OPTIONS) {
    const segment = getSegmentDefinition(option.slug);
    for (const key of ["cliente", "clientes", "procedimento", "procedimentos", "profissional", "profissionais", "anamnese"]) {
      assert.ok(segment.labels[key], `${option.slug} sem o rótulo ${key}`);
    }
  }

  assert.deepEqual(
    Object.fromEntries(Object.entries(getTerminologyForSegments(["odontologia"])).filter(([key]) => ["cliente", "clientes", "procedimento", "procedimentos", "profissional", "profissionais"].includes(key))),
    { cliente: "Paciente", clientes: "Pacientes", procedimento: "Tratamento", procedimentos: "Tratamentos", profissional: "Dentista", profissionais: "Dentistas" },
  );
});

test("onboarding persiste o segmento e não cria clínica parcialmente configurada", async () => {
  const onboarding = await source("src/app/onboarding/actions.js");
  assert.match(onboarding, /primary_segment:\s*primarySegment/);
  assert.match(onboarding, /segments:\s*selectedSlugs/);
  assert.match(onboarding, /segmentQueryError \|\| missingSegment/);
  assert.match(onboarding, /from\("clinicas"\)\.delete\(\)\.eq\("id", clinica\.id\)/);
});

test("dashboard aplica a terminologia do segmento às áreas principais", async () => {
  const [layout, agenda, clients, services, professionals] = await Promise.all([
    source("src/app/dashboard/layout.js"),
    source("src/app/dashboard/agenda/page.js"),
    source("src/app/dashboard/clientes/page.js"),
    source("src/app/dashboard/procedimentos/page.js"),
    source("src/app/dashboard/profissionais/page.js"),
  ]);
  assert.match(layout, /terminologyBySection/);
  assert.match(agenda, /label=\{terminology\.cliente\}/);
  assert.match(clients, /title=\{`\$\{terminology\.clientes\} e leads`\}/);
  assert.match(services, /title=\{terminology\.procedimentos\}/);
  assert.match(professionals, /title=\{terminology\.profissionais\}/);
});

test("site público recebe a mesma terminologia escolhida no onboarding", async () => {
  const [page, booking, services] = await Promise.all([
    source("src/app/c/[slug]/page.js"),
    source("src/app/c/[slug]/booking-form.js"),
    source("src/app/c/[slug]/services-section.js"),
  ]);
  assert.match(page, /getPrimaryClinicSegment\(clinic\.id, supabaseAdmin\)/);
  assert.match(page, /terminology=\{terminology\}/);
  assert.match(booking, /servicePlural = terminology\.procedimentos/);
  assert.match(services, /serviceSingular = terminology\.procedimento/);
});
