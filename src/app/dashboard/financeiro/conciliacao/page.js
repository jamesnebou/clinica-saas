import { PageHeader, SubmitButton } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { listFinanceRows, money } from "@/lib/finance/service";
import { FinancePage, FinanceTable, SchemaNotice, StatusPill } from "../shared";
import { reconcileAction } from "../actions";

const errors = {
  registro_invalido: "Registro de conciliação inválido.",
  sem_permissao: "Você não tem permissão para conciliar este registro.",
  ja_conciliado: "Esta liquidação já foi conciliada ou usada em outra conciliação.",
  divergencia: "Não foi possível conciliar: confira a liquidação, o movimento e os valores.",
};

export default async function ConciliacaoPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const params = await searchParams;
  const result = await listFinanceRows("finance_conciliacoes", activeClinic.id, { dateColumn: "created_at", limit: 300 });

  return <FinancePage>
    <PageHeader eyebrow="Financeiro" title="Conciliação" description="Compare referências dos gateways com liquidações e movimentos internos." />
    {errors[params?.erro] && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{errors[params.erro]}</p>}
    {params?.resultado === "conciliado" && <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">Liquidação conciliada.</p>}
    {!result.available ? <div className="mt-6"><SchemaNotice /></div> : <div className="mt-6">
      <FinanceTable rows={result.rows} columns={[
        { key: "provider", label: "Provedor" },
        { key: "provider_reference", label: "Referência" },
        { key: "valor_provider", label: "Valor", render: (row) => money(row.valor_provider) },
        { key: "data_provider", label: "Data", render: (row) => row.data_provider ? new Date(row.data_provider).toLocaleDateString("pt-BR") : "-" },
        { key: "status", label: "Status", render: (row) => <StatusPill status={row.status} /> },
        { key: "acao", label: "Ação", render: (row) => {
          if (row.status === "conciliado") return "Conferido";
          if (row.status !== "pendente") return "Revisão necessária";
          if (!row.liquidacao_id || !row.movimento_id) return "Sem vínculo financeiro";
          return <form action={reconcileAction}>
            <input type="hidden" name="id" value={row.id} />
            <SubmitButton>Conciliar</SubmitButton>
          </form>;
        } },
      ]} />
    </div>}
  </FinancePage>;
}
