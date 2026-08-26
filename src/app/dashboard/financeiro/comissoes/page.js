import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceSettings, listFinanceRows, money, monthPeriod } from "@/lib/finance/service";
import { ExportCsvLink, FinancePage, FinanceTable, SchemaNotice, StatusPill } from "../shared";

export default async function ComissoesPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const period = monthPeriod((await searchParams)?.month);
  const [result, settings] = await Promise.all([
    listFinanceRows("finance_comissoes", activeClinic.id, { start: period.start, end: period.end, dateColumn: "competencia", limit: 300 }),
    getFinanceSettings(activeClinic.id),
  ]);
  const professionalNames = new Map(settings.professionals.map((item) => [item.id, item.nome]));

  return (
    <FinancePage>
      <PageHeader eyebrow="Financeiro" title="Comissões" description="Provisões criadas a partir de recebimentos reais, com rastreabilidade até profissional, atendimento e liquidação." />
      <div className="mt-4"><ExportCsvLink report="comissoes" month={period.month} /></div>
      {!result.available ? <div className="mt-6"><SchemaNotice /></div> : (
        <div className="mt-6">
          <FinanceTable rows={result.rows} columns={[
            { key: "competencia", label: "Competência" },
            { key: "profissional_id", label: "Profissional", render: (item) => professionalNames.get(item.profissional_id) || "Profissional inativo" },
            { key: "base_calculo", label: "Base", render: (item) => money(item.base_calculo) },
            { key: "percentual", label: "Percentual", render: (item) => `${Number(item.percentual || 0).toLocaleString("pt-BR")}%` },
            { key: "valor", label: "Comissão", render: (item) => money(item.valor) },
            { key: "status", label: "Status", render: (item) => <StatusPill status={item.status} /> },
          ]} />
        </div>
      )}
    </FinancePage>
  );
}
