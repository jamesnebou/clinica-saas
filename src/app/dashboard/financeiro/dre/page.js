import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildManagerialDre } from "@/lib/finance/core.mjs";
import { getFinanceSettings, isFinanceSchemaMissing, money, monthPeriod } from "@/lib/finance/service";
import { ExportCsvLink, FinancePage, SchemaNotice } from "../shared";

function previousMonth(month) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return monthPeriod(date.toISOString().slice(0, 7));
}

function percent(value, base) {
  if (!base) return "-";
  return `${((Number(value) / Math.abs(Number(base))) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function variation(current, previous) {
  if (!previous) return "-";
  return `${(((current - previous) / Math.abs(previous)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export default async function DrePage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const currentPeriod = monthPeriod((await searchParams)?.month);
  const priorPeriod = previousMonth(currentPeriod.month);
  const supabase = await createClient();
  const [{ data, error }, settings] = await Promise.all([
    supabase.from("finance_competencias").select("valor,categoria_id,competencia").eq("clinica_id", activeClinic.id).gte("competencia", priorPeriod.start).lte("competencia", currentPeriod.end).eq("estornada", false),
    getFinanceSettings(activeClinic.id),
  ]);

  if (isFinanceSchemaMissing(error)) return <FinancePage><PageHeader eyebrow="Financeiro" title="DRE gerencial" /><div className="mt-6"><SchemaNotice /></div></FinancePage>;
  if (error) throw error;

  const categoryGroups = new Map(settings.categories.map((category) => [category.id, category.grupo_dre]));
  const normalized = (data || []).map((item) => ({ ...item, grupo_dre: categoryGroups.get(item.categoria_id) }));
  const current = buildManagerialDre(normalized.filter((item) => item.competencia >= currentPeriod.start));
  const prior = buildManagerialDre(normalized.filter((item) => item.competencia <= priorPeriod.end));
  const lines = [
    ["Receita bruta", "receita_bruta", false],
    ["(-) Deduções", "deducoes", true],
    ["Receita líquida", "receita_liquida", false],
    ["(-) Custos variáveis", "custos_variaveis", true],
    ["Margem de contribuição", "margem_contribuicao", false],
    ["(-) Despesas operacionais", "despesas_operacionais", true],
    ["Resultado gerencial", "resultado_gerencial", false],
  ];

  return (
    <FinancePage>
      <PageHeader eyebrow="Financeiro" title="DRE gerencial" description="Resultado por competência, separado do fluxo de caixa e comparado ao mês anterior." />
      <div className="mt-4"><ExportCsvLink report="dre" month={currentPeriod.month} /></div>
      <section className="premium-panel mt-6 overflow-x-auto rounded-lg p-6">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500"><th className="py-3">Linha gerencial</th><th>Atual</th><th>% receita</th><th>Anterior</th><th>Variação</th><th>Variação %</th></tr></thead>
          <tbody>{lines.map(([label, key, negative]) => {
            const currentValue = Number(current[key] || 0) * (negative ? -1 : 1);
            const priorValue = Number(prior[key] || 0) * (negative ? -1 : 1);
            const delta = currentValue - priorValue;
            const strong = ["receita_liquida", "margem_contribuicao", "resultado_gerencial"].includes(key);
            return <tr key={key} className={`border-b border-neutral-100 ${strong ? "font-black" : ""}`}><td className="py-3">{label}</td><td className={currentValue < 0 ? "text-red-700" : ""}>{money(currentValue)}</td><td>{percent(currentValue, current.receita_bruta)}</td><td>{money(priorValue)}</td><td className={delta < 0 ? "text-red-700" : ""}>{money(delta)}</td><td>{variation(currentValue, priorValue)}</td></tr>;
          })}</tbody>
        </table>
      </section>
    </FinancePage>
  );
}
