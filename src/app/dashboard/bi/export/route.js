import { NextResponse } from "next/server";
import { getUserClinics } from "@/lib/auth/session";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveBIPeriod } from "@/lib/bi/periods";
import { getBIData, serializeBIExport } from "@/lib/bi/service";

function cell(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function query(searchParams, key) {
  return String(searchParams.get(key) || "").trim();
}

export async function GET(request) {
  const context = await getUserClinics();
  if (!context.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!context.activeClinic) return NextResponse.json({ error: "Clínica não encontrada." }, { status: 404 });
  const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
  if (!canAccessSection(membership?.papel, "bi", membership)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const period = resolveBIPeriod({ preset: query(searchParams, "periodo") || "30d", customStart: query(searchParams, "inicio"), customEnd: query(searchParams, "fim"), clinic: context.activeClinic });
  const filters = {
    profissional: query(searchParams, "profissional"), procedimento: query(searchParams, "procedimento"),
    categoria: query(searchParams, "categoria"), status: query(searchParams, "status"),
    formaPagamento: query(searchParams, "forma_pagamento"), origem: query(searchParams, "origem"),
    canal: query(searchParams, "canal"), crmStatus: query(searchParams, "crm_status"),
  };
  const supabase = await createClient();
  const result = await getBIData({ supabase, clinic: context.activeClinic, period, filters });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const sections = serializeBIExport(result.data);
  const rows = [
    ["NexaWi Clínicas - Exportação de BI"],
    ["Clínica", context.activeClinic.nome],
    ["Período", `${period.current.startKey} a ${period.current.endKey}`],
    ["Fuso horário", period.timeZone],
    [],
  ];
  for (const [name, sectionRows] of Object.entries(sections)) rows.push([name.toUpperCase()], ...sectionRows, []);
  const { error: auditError } = await supabase.from("auditoria_clinica").insert({
    clinica_id: context.activeClinic.id,
    actor_id: context.user.id,
    acao: "bi.exportacao_csv",
    entidade_tipo: "relatorio_bi",
    metadata: { periodo_inicio: period.current.startKey, periodo_fim: period.current.endKey, filtros: filters },
  });
  if (auditError) console.error("Erro ao auditar exportação de BI:", auditError.message);
  const csv = `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bi-${period.current.startKey}-${period.current.endKey}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
