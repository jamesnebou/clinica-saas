import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { compareDrePeriods } from "@/lib/finance/dre-periods.mjs";
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
  const { activeClinic } = await requireClinicCapability("financeiro", "dre", { redirectOnDenied: true });
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
  const { currentRows, current, prior } = compareDrePeriods(normalized, currentPeriod, priorPeriod);
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
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="dre-month">Competência
            <input id="dre-month" name="month" type="month" required defaultValue={currentPeriod.month} className="mt-1 block h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-bold text-neutral-800">Ver período</button>
        </form>
        <ExportCsvLink report="dre" month={currentPeriod.month} />
      </div>
      {!currentRows.length ? <p className="mt-4 text-sm text-neutral-600">Nenhum lançamento de competência neste mês.</p> : null}
      <section className="premium-panel mt-6 overflow-x-auto rounded-lg p-6">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500"><th className="py-3">Linha gerencial</th><th>Selecionado</th><th>% receita</th><th>Anterior</th><th>Variação</th><th>Variação %</th></tr></thead>
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
