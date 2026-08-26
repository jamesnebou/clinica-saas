import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("parcelamento usa centavos, parcelas reais e rateio por liquidação", async () => {
  const [core, rpcs, operations] = await Promise.all([
    read("supabase/migrations/20260827100000_financeiro_2_core.sql"),
    read("supabase/migrations/20260827101000_financeiro_2_rpcs.sql"),
    read("supabase/migrations/20260827101500_financeiro_2_operacoes.sql"),
  ]);
  assert.match(core, /create table public\.finance_liquidacao_parcelas/i);
  assert.match(operations, /v_total_centavos:=round\(p_valor\*100\)::bigint/i);
  assert.match(operations, /finance_criar_recebivel_parcelado/i);
  assert.match(operations, /finance_criar_pagavel/i);
  assert.match(rpcs, /insert into public\.finance_liquidacao_parcelas[\s\S]*recebivel_parcela_id/i);
  assert.match(operations, /insert into public\.finance_liquidacao_parcelas[\s\S]*pagavel_parcela_id/i);
  assert.match(operations, /valor_liquidado=greatest\(0,valor_liquidado-v_rateio\.valor\)/i);
});

test("migration de consolidação cobre instalações que aplicaram o schema antes do rateio", async () => {
  const consolidation = await read("supabase/migrations/20260827103000_financeiro_2_consolidacao.sql");
  assert.match(consolidation, /create table if not exists public\.finance_liquidacao_parcelas/i);
  assert.match(consolidation, /insert into public\.finance_liquidacao_parcelas[\s\S]*recebivel_parcela_id/i);
  assert.match(consolidation, /insert into public\.finance_liquidacao_parcelas[\s\S]*pagavel_parcela_id/i);
  assert.match(consolidation, /valor_liquidado=greatest\(0,valor_liquidado-v_rateio\.valor\)/i);
  assert.match(consolidation, /v_regra_id:=v_regra\.id/i);
  assert.match(consolidation, /coalesce\(current_setting\('request\.jwt\.claim\.role',true\),''\)<>'service_role'/i);
});

test("consumo de pacote é repetível sem consumir uma segunda sessão", async () => {
  const operations = await read("supabase/migrations/20260827101500_financeiro_2_operacoes.sql");
  assert.match(operations, /p_cliente_pacote_id uuid,p_sessao integer/i);
  assert.match(operations, /origem_id=v_pacote\.id::text\|\|':'\|\|p_sessao::text/i);
  assert.match(operations, /'idempotente',true/i);
  assert.match(operations, /p_sessao<>v_numero/i);
});

test("exportação financeira deriva tenant da sessão e limita relatórios", async () => {
  const route = await read("src/app/dashboard/financeiro/export/route.js");
  assert.match(route, /const REPORTS = \{/);
  assert.match(route, /getUserClinics\(\)/);
  assert.match(route, /\.eq\("clinica_id", context\.activeClinic\.id\)/);
  assert.doesNotMatch(route, /searchParams\.get\("clinica_id"\)/);
  assert.match(route, /financeiro\.exportacao_csv/);
});
