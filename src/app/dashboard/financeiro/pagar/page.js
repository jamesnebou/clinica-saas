import { Field, PageHeader, SelectField, SubmitButton } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceSettings, listFinanceRows, money, monthPeriod } from "@/lib/finance/service";
import { createPayableAction, settlePayableAction } from "../actions";
import { ExportCsvLink, FinancePage, FinanceTable, SchemaNotice, StatusPill } from "../shared";

export default async function PagarPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const period = monthPeriod((await searchParams)?.month);
  const [result, settings] = await Promise.all([
    listFinanceRows("finance_pagaveis", activeClinic.id, { start: period.start, end: period.end, dateColumn: "vencimento", limit: 250 }),
    getFinanceSettings(activeClinic.id),
  ]);
  const expenseCategories = settings.categories.filter((category) => ["custo_variavel", "despesa", "outra_despesa"].includes(category.tipo));

  return (
    <FinancePage>
      <PageHeader eyebrow="Financeiro" title="Contas a pagar" description="Despesas, fornecedores e compromissos por vencimento e competência." />
      <div className="mt-4"><ExportCsvLink report="pagar" month={period.month} /></div>
      {!result.available ? <div className="mt-6"><SchemaNotice /></div> : <>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
          <FinanceTable rows={result.rows} columns={[
            { key: "descricao", label: "Descrição" },
            { key: "vencimento", label: "Vencimento" },
            { key: "valor_total", label: "Total", render: (item) => money(item.valor_total) },
            { key: "aberto", label: "Em aberto", render: (item) => money(Number(item.valor_total) - Number(item.valor_pago)) },
            { key: "status", label: "Status", render: (item) => <StatusPill status={item.status} /> },
          ]} />
          <form action={createPayableAction} className="premium-panel rounded-lg p-5">
            <h2 className="text-lg font-black">Nova conta</h2>
            <div className="mt-4 space-y-4">
              <Field label="Descrição" name="descricao" required />
              <Field label="Valor total" name="valor" type="number" min="0.01" step="0.01" required />
              <Field label="Primeiro vencimento" name="vencimento" type="date" required />
              <Field label="Competência" name="competencia" type="date" />
              <Field label="Parcelas" name="parcelas" type="number" min="1" max="120" defaultValue="1" />
              <SelectField label="Fornecedor" name="fornecedor_id"><option value="">Não informado</option>{settings.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</SelectField>
              <SelectField label="Categoria" name="categoria_id" required><option value="">Selecione</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</SelectField>
              <SelectField label="Centro de custo" name="centro_custo_id"><option value="">Sem centro</option>{settings.centers.map((center) => <option key={center.id} value={center.id}>{center.nome}</option>)}</SelectField>
              <SubmitButton>Adicionar conta</SubmitButton>
            </div>
          </form>
        </div>

        <form action={settlePayableAction} className="premium-panel mt-6 rounded-lg p-5">
          <h2 className="text-lg font-black">Registrar pagamento</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <SelectField label="Conta a pagar" name="pagavel_id" required><option value="">Selecione</option>{result.rows.filter((item) => ["aberto", "parcial"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.descricao} · {money(Number(item.valor_total) - Number(item.valor_pago))}</option>)}</SelectField>
            <SelectField label="Conta financeira" name="conta_id"><option value="">Conta padrão</option>{settings.accounts.map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}</SelectField>
            <Field label="Valor" name="valor" type="number" min="0.01" step="0.01" required />
            <SelectField label="Forma" name="forma_pagamento"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="boleto">Boleto</option><option value="outro">Outro</option></SelectField>
            <div className="md:col-span-4"><SubmitButton>Confirmar pagamento</SubmitButton></div>
          </div>
        </form>
      </>}
    </FinancePage>
  );
}
