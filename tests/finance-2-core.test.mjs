import test from "node:test";
import assert from "node:assert/strict";
import { agingBucket, buildManagerialDre, calculateCommission, splitInstallments, summarizeCashFlow, summarizeReceivables } from "../src/lib/finance/core.mjs";

test("parcelas preservam centavos e total",()=>{ const parts=splitInstallments(100,3); assert.deepEqual(parts,[33.34,33.33,33.33]); assert.equal(parts.reduce((a,b)=>a+b,0),100); });
test("aging separa vencidos por faixa",()=>{ assert.equal(agingBucket("2026-08-20","2026-08-25"),"1_7"); assert.equal(agingBucket("2026-05-01","2026-08-25"),"mais_90"); assert.equal(agingBucket("2026-08-30","2026-08-25"),"a_vencer"); });
test("recebíveis cancelados não inflam carteira",()=>{ const s=summarizeReceivables([{valor_total:100,valor_recebido:20,status:"parcial",vencimento:"2026-08-01",cliente_id:"a"},{valor_total:900,valor_recebido:0,status:"cancelado"}],"2026-08-25"); assert.equal(s.total,100); assert.equal(s.aberto,80); assert.equal(s.vencido,80); assert.equal(s.clientes_inadimplentes,1); });
test("transferências não alteram saldo operacional",()=>{ const s=summarizeCashFlow([{tipo:"entrada",valor_liquido:500,taxa:10},{tipo:"saida",valor_liquido:100},{tipo:"transferencia_saida",valor_liquido:80},{tipo:"transferencia_entrada",valor_liquido:80}]); assert.equal(s.saldo,400); assert.equal(s.transferencias_liquidas,0); assert.equal(s.taxas,10); });
test("DRE separa caixa de competência",()=>{ const d=buildManagerialDre([{grupo_dre:"receita_bruta",valor:1000},{grupo_dre:"deducoes",valor:50},{grupo_dre:"custos_variaveis",valor:200},{grupo_dre:"despesas_operacionais",valor:300}]); assert.equal(d.receita_liquida,950); assert.equal(d.margem_contribuicao,750); assert.equal(d.resultado_gerencial,450); });
test("comissão percentual usa base monetária",()=>assert.equal(calculateCommission({baseValue:997.5,rate:12}),119.7));
