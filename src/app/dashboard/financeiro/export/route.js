import { NextResponse } from "next/server";
import { getUserClinics } from "@/lib/auth/session";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { monthPeriod } from "@/lib/finance/service";

const REPORTS = {
  receber: { table: "finance_recebiveis", date: "vencimento", columns: ["descricao", "origem_tipo", "vencimento", "valor_total", "valor_recebido", "status", "provider"] },
  pagar: { table: "finance_pagaveis", date: "vencimento", columns: ["descricao", "origem_tipo", "vencimento", "valor_total", "valor_pago", "status"] },
  movimentacoes: { table: "finance_movimentos", date: "data_movimento", columns: ["data_movimento", "descricao", "tipo", "valor_bruto", "taxa", "desconto", "valor_liquido", "provider", "conciliado"] },
  comissoes: { table: "finance_comissoes", date: "competencia", columns: ["competencia", "profissional_id", "base_calculo", "percentual", "valor", "status"] },
  dre: { table: "finance_competencias", date: "competencia", columns: ["competencia", "descricao", "tipo", "valor", "categoria_id", "centro_custo_id", "origem_tipo", "estornada"] },
};

function csvCell(value) {
  const content = String(value ?? "");
  return /[;"\r\n]/.test(content) ? `"${content.replaceAll('"', '""')}"` : content;
}

export async function GET(request) {
  const context = await getUserClinics();
  if (!context.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!context.activeClinic) return NextResponse.json({ error: "Clínica não encontrada." }, { status: 404 });

  const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
  if (!canAccessSection(membership?.papel, "financeiro", membership)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const reportName = String(searchParams.get("relatorio") || "");
  const report = REPORTS[reportName];
  if (!report) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });

  const period = monthPeriod(searchParams.get("month"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(report.table)
    .select(report.columns.join(","))
    .eq("clinica_id", context.activeClinic.id)
    .gte(report.date, period.start)
    .lte(report.date, period.end)
    .order(report.date, { ascending: true })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [
    ["NexaWi Clínicas - Financeiro 2.0"],
    ["Clínica", context.activeClinic.nome],
    ["Relatório", reportName],
    ["Período", `${period.start} a ${period.end}`],
    [],
    report.columns,
    ...(data || []).map((item) => report.columns.map((column) => item[column])),
  ];

  const { error: auditError } = await supabase.from("auditoria_clinica").insert({
    clinica_id: context.activeClinic.id,
    actor_id: context.user.id,
    acao: "financeiro.exportacao_csv",
    entidade_tipo: "relatorio_financeiro",
    metadata: { relatorio: reportName, inicio: period.start, fim: period.end, quantidade: data?.length || 0 },
  });
  if (auditError) console.error("Erro ao auditar exportação financeira:", auditError.message);

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="financeiro-${reportName}-${period.month}.csv"`, "Cache-Control": "private, no-store" } });
}
