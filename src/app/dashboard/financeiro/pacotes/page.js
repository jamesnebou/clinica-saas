import { Field, PageHeader, SelectField, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { money } from "@/lib/finance/service";
import { createClient } from "@/lib/supabase/server";
import { createPacoteAction, sellClientePacoteAction } from "../../actions";
import { recognizePackageSessionAction } from "../actions";
import { FinancePage, FinanceTable } from "../shared";

export default async function PacotesPage() {
  const { activeClinic } = await requireClinicSection("financeiro");
  const supabase = await createClient();
  const [procedures, clients, packages, sales] = await Promise.all([
    supabase.from("procedimentos").select("id,nome").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    supabase.from("clientes").select("id,nome").eq("clinica_id", activeClinic.id).eq("status", "ativo").order("nome"),
    supabase.from("pacotes_clinica").select("*").eq("clinica_id", activeClinic.id).order("nome"),
    supabase.from("cliente_pacotes").select("*,clientes(nome)").eq("clinica_id", activeClinic.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const error = [procedures.error, clients.error, packages.error, sales.error].find(Boolean);
  if (error) throw error;

  return (
    <FinancePage>
      <PageHeader eyebrow="Financeiro" title="Pacotes e sessões" description="Acompanhe venda, recebimento, consumo e receita reconhecida por sessão." />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form action={createPacoteAction} className="premium-panel rounded-lg p-5">
          <h2 className="text-lg font-black">Criar pacote</h2>
          <div className="mt-4 space-y-4">
            <Field label="Nome" name="nome" required />
            <div>
              <p className="text-sm font-medium">Procedimentos</p>
              <div className="mt-2 max-h-52 space-y-2 overflow-auto rounded-lg border border-neutral-200 p-3">
                {(procedures.data || []).map((procedure) => (
                  <label key={procedure.id} className="flex gap-2 text-sm"><input type="checkbox" name="procedimento_ids" value={procedure.id} />{procedure.nome}</label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sessões" name="quantidade_sessoes" type="number" defaultValue="5" />
              <Field label="Valor" name="valor" type="number" defaultValue="0" />
              <Field label="Validade (dias)" name="validade_dias" type="number" defaultValue="90" />
            </div>
            <TextArea label="Descrição" name="descricao" />
            <SubmitButton>Criar pacote</SubmitButton>
          </div>
        </form>

        <form action={sellClientePacoteAction} className="premium-panel rounded-lg p-5">
          <h2 className="text-lg font-black">Vender pacote</h2>
          <div className="mt-4 space-y-4">
            <SelectField label="Cliente" name="cliente_id" required><option value="">Selecione</option>{(clients.data || []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Pacote" name="pacote_id" required><option value="">Selecione</option>{(packages.data || []).map((item) => <option key={item.id} value={item.id}>{item.nome} · {money(item.valor)}</option>)}</SelectField>
            <Field label="Valor pago" name="valor_pago" type="number" defaultValue="0" />
            <SelectField label="Forma" name="forma_pagamento"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="boleto">Boleto</option><option value="outro">Outro</option></SelectField>
            <Field label="Data da compra" name="data_compra" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <TextArea label="Observações" name="observacoes" />
            <SubmitButton>Registrar venda</SubmitButton>
          </div>
        </form>
      </div>

      <section className="mt-6">
        <FinanceTable rows={sales.data || []} columns={[
          { key: "nome_pacote", label: "Pacote" },
          { key: "cliente", label: "Cliente", render: (item) => item.clientes?.nome || "-" },
          { key: "sessoes", label: "Sessões", render: (item) => `${item.sessoes_utilizadas}/${item.sessoes_total}` },
          { key: "valor_total", label: "Valor", render: (item) => money(item.valor_total) },
          { key: "status", label: "Status" },
          { key: "competencia", label: "Reconhecimento", render: (item) => item.status === "ativo" ? (
            <form action={recognizePackageSessionAction} className="flex min-w-52 items-end gap-2">
              <input type="hidden" name="cliente_pacote_id" value={item.id} />
              <input type="hidden" name="sessao" value={Number(item.sessoes_utilizadas || 0) + 1} />
              <input aria-label="Data da competência" className="min-w-0 rounded-md border border-neutral-200 px-2 py-2 text-xs" name="competencia" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              <SubmitButton>Usar sessão</SubmitButton>
            </form>
          ) : "Encerrado" },
        ]} />
      </section>
    </FinancePage>
  );
}
