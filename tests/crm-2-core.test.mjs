import test from "node:test";
import assert from "node:assert/strict";
import { calculateCrmMetrics, legacyStatusForStage, normalizeCrmEmail, normalizeCrmPhone } from "../src/lib/crm/core.mjs";

test("CRM normaliza telefone e e-mail para deduplicação", () => {
  assert.equal(normalizeCrmPhone("(77) 98865-6394"), "5577988656394");
  assert.equal(normalizeCrmPhone("+55 77 98865-6394"), "5577988656394");
  assert.equal(normalizeCrmEmail("  CONTATO@CLINICA.COM  "), "contato@clinica.com");
});

test("métricas usam etapas dinâmicas e atividades reais", () => {
  const stages = [
    { id: "open", tipo: "open", probabilidade: 25 },
    { id: "won", tipo: "won", probabilidade: 100 },
    { id: "lost", tipo: "lost", probabilidade: 0 },
  ];
  const opportunities = [
    { stage_id: "open", valor_estimado: 1000, next_activity_at: null },
    { stage_id: "open", valor_estimado: 500, next_activity_at: "2099-01-01T10:00:00Z" },
    { stage_id: "won", valor_estimado: 800, valor_fechado: 900 },
    { stage_id: "lost", valor_estimado: 300 },
  ];
  const activities = [
    { status: "pending", due_at: "2025-01-01T10:00:00Z" },
    { status: "completed", due_at: "2025-01-01T10:00:00Z" },
  ];
  const result = calculateCrmMetrics(opportunities, stages, activities, new Date("2026-01-01T00:00:00Z"));
  assert.equal(result.openCount, 2);
  assert.equal(result.pipelineValue, 1500);
  assert.equal(result.weightedValue, 375);
  assert.equal(result.conversionRate, 50);
  assert.equal(result.averageTicket, 900);
  assert.equal(result.overdueActivities, 1);
  assert.equal(result.withoutNextActivity, 1);
});

test("compatibilidade legada deriva status sem depender do nome exibido", () => {
  assert.equal(legacyStatusForStage({ tipo: "won" }), "convertido");
  assert.equal(legacyStatusForStage({ tipo: "lost" }), "perdido");
  assert.equal(legacyStatusForStage({ tipo: "open", semantic_key: "evaluation_scheduled" }), "avaliacao_marcada");
  assert.equal(legacyStatusForStage({ tipo: "open", semantic_key: "negotiation" }), "em_negociacao");
  assert.equal(legacyStatusForStage({ tipo: "open", semantic_key: "contacted" }), "lead");
});
