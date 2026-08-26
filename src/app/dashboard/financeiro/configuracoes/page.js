import { Field, PageHeader, SelectField, SubmitButton } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceSettings, money } from "@/lib/finance/service";
import {
  createAccountAction,
  createCommissionRuleAction,
  createCostCenterAction,
  createFinanceCategoryAction,
  createRecurrenceAction,
  createSupplierAction,
  saveFinanceSettingsAction,
} from "../actions";
import { FinancePage, FinanceTable, SchemaNotice, StatusPill } from "../shared";

const today = new Date().toISOString().slice(0, 10);

function Panel({ title, description, children }) {
  return (
    <section className="premium-panel min-w-0 rounded-lg p-5">
      <h2 className="text-lg font-black">{title}</h2>
      {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ConfigPage() {
  const { activeClinic } = await requireClinicSection("financeiro");
  const finance = await getFinanceSettings(activeClinic.id);

  if (!finance.available) {
    return <FinancePage><PageHeader eyebrow="Financeiro" title="Configurações financeiras" /><div className="mt-6"><SchemaNotice /></div></FinancePage>;
  }

  const professionalNames = new Map(finance.professionals.map((item) => [item.id, item.nome]));
  const procedureNames = new Map(finance.procedures.map((item) => [item.id, item.nome]));
  const categoryNames = new Map(finance.categories.map((item) => [item.id, item.nome]));

  return (
    <FinancePage>
      <PageHeader eyebrow="Financeiro" title="Configurações financeiras" description="Estruture contas, classificação gerencial, fornecedores, comissões e lançamentos recorrentes da clínica." />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Política financeira" description="Define a leitura gerencial padrão sem alterar os registros históricos.">
          <form action={saveFinanceSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Regime padrão" name="regime" defaultValue={finance.settings?.regime || "caixa"}><option value="caixa">Caixa</option><option value="competencia">Competência</option></SelectField>
            <Field label="Dia de fechamento" name="dia_fechamento" type="number" min="1" max="28" defaultValue={String(finance.settings?.dia_fechamento || 1)} />
            <SelectField label="Reconhecer atendimento em" name="reconhecer_receita_agendamento_em" defaultValue={finance.settings?.reconhecer_receita_agendamento_em || "conclusao"}><option value="agendamento">Agendamento</option><option value="conclusao">Conclusão</option><option value="recebimento">Recebimento</option></SelectField>
            <Field label="Comissão padrão (%)" name="comissao_padrao_percentual" type="number" min="0" max="100" step="0.01" defaultValue={String(finance.settings?.comissao_padrao_percentual || 0)} />
            <div className="sm:col-span-2"><SubmitButton>Salvar política</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Nova conta financeira" description="Cadastre caixa, banco, carteira digital ou conta de gateway.">
          <form action={createAccountAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="nome" required />
            <SelectField label="Tipo" name="tipo"><option value="caixa">Caixa</option><option value="banco">Banco</option><option value="carteira_digital">Carteira digital</option><option value="gateway">Gateway</option><option value="outro">Outro</option></SelectField>
            <Field label="Instituição" name="instituicao" />
            <Field label="Saldo inicial" name="saldo_inicial" type="number" step="0.01" defaultValue="0" />
            <div className="sm:col-span-2"><SubmitButton>Adicionar conta</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Categoria financeira" description="Classifique receitas e despesas para a DRE gerencial.">
          <form action={createFinanceCategoryAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="nome" required />
            <Field label="Código interno" name="codigo" placeholder="Ex.: DESP_MARKETING" />
            <SelectField label="Natureza" name="tipo"><option value="receita">Receita</option><option value="deducao">Dedução</option><option value="custo_variavel">Custo variável</option><option value="despesa">Despesa</option><option value="outra_receita">Outra receita</option><option value="outra_despesa">Outra despesa</option></SelectField>
            <SelectField label="Grupo da DRE" name="grupo_dre"><option value="receita_bruta">Receita bruta</option><option value="deducoes">Deduções</option><option value="custos_variaveis">Custos variáveis</option><option value="despesas_operacionais">Despesas operacionais</option><option value="outras_receitas">Outras receitas</option><option value="outras_despesas">Outras despesas</option><option value="nao_dre">Fora da DRE</option></SelectField>
            <div className="sm:col-span-2"><SubmitButton>Criar categoria</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Centro de custo" description="Separe o resultado por unidade, operação ou área da clínica.">
          <form action={createCostCenterAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="nome" required />
            <Field label="Código interno" name="codigo" placeholder="Ex.: UNIDADE_CENTRO" />
            <div className="sm:col-span-2"><SubmitButton>Criar centro</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Fornecedor" description="Centralize os favorecidos usados em contas a pagar e recorrências.">
          <form action={createSupplierAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="nome" required />
            <Field label="CPF/CNPJ" name="documento" />
            <Field label="Telefone" name="telefone" />
            <Field label="E-mail" name="email" type="email" />
            <div className="sm:col-span-2"><SubmitButton>Cadastrar fornecedor</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Regra de comissão" description="Regras específicas têm prioridade sobre o percentual padrão.">
          <form action={createCommissionRuleAction} className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Profissional" name="profissional_id"><option value="">Todos</option>{finance.professionals.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Procedimento" name="procedimento_id"><option value="">Todos</option>{finance.procedures.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Tipo" name="tipo"><option value="percentual">Percentual</option><option value="fixo">Valor fixo</option></SelectField>
            <SelectField label="Base de cálculo" name="base_calculo"><option value="recebido_liquido">Recebido líquido</option><option value="recebido_bruto">Recebido bruto</option><option value="competencia">Competência</option></SelectField>
            <Field label="Percentual (%)" name="percentual" type="number" min="0" max="100" step="0.01" defaultValue="0" />
            <Field label="Valor fixo" name="valor_fixo" type="number" min="0" step="0.01" defaultValue="0" />
            <Field label="Prioridade" name="prioridade" type="number" defaultValue="0" />
            <Field label="Início da vigência" name="vigencia_inicio" type="date" />
            <Field label="Fim da vigência" name="vigencia_fim" type="date" />
            <div className="sm:col-span-2"><SubmitButton>Criar regra</SubmitButton></div>
          </form>
        </Panel>

        <Panel title="Lançamento recorrente" description="O cron gera contas a receber ou pagar sem duplicar competências.">
          <form action={createRecurrenceAction} className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Tipo" name="tipo"><option value="pagar">Conta a pagar</option><option value="receber">Conta a receber</option></SelectField>
            <Field label="Descrição" name="descricao" required />
            <SelectField label="Categoria" name="categoria_id" required><option value="">Selecione</option>{finance.categories.filter((item) => item.ativa).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Fornecedor" name="fornecedor_id"><option value="">Não informado</option>{finance.suppliers.filter((item) => item.ativo).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Centro de custo" name="centro_custo_id"><option value="">Não informado</option>{finance.centers.filter((item) => item.ativo).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <SelectField label="Conta prevista" name="conta_financeira_id"><option value="">Não informada</option>{finance.accounts.filter((item) => item.ativa).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
            <Field label="Valor" name="valor" type="number" min="0.01" step="0.01" required />
            <SelectField label="Periodicidade" name="periodicidade"><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></SelectField>
            <Field label="Próximo vencimento" name="proximo_vencimento" type="date" defaultValue={today} required />
            <Field label="Próxima competência" name="proxima_competencia" type="date" defaultValue={`${today.slice(0, 7)}-01`} required />
            <Field label="Dia do vencimento" name="dia_vencimento" type="number" min="1" max="31" defaultValue={String(Number(today.slice(8, 10)))} />
            <Field label="Encerrar em" name="termina_em" type="date" />
            <div className="sm:col-span-2"><SubmitButton>Criar recorrência</SubmitButton></div>
          </form>
        </Panel>
      </div>

      <div className="mt-8 space-y-8">
        <section><h2 className="mb-3 text-lg font-black">Contas cadastradas</h2><FinanceTable rows={finance.accounts} columns={[{ key: "nome", label: "Conta" }, { key: "tipo", label: "Tipo" }, { key: "instituicao", label: "Instituição" }, { key: "saldo_inicial", label: "Saldo inicial", render: (item) => money(item.saldo_inicial) }, { key: "ativa", label: "Status", render: (item) => item.ativa ? "Ativa" : "Inativa" }]} /></section>
        <section><h2 className="mb-3 text-lg font-black">Regras de comissão</h2><FinanceTable rows={finance.commissionRules} columns={[{ key: "profissional_id", label: "Profissional", render: (item) => professionalNames.get(item.profissional_id) || "Todos" }, { key: "procedimento_id", label: "Procedimento", render: (item) => procedureNames.get(item.procedimento_id) || "Todos" }, { key: "tipo", label: "Regra", render: (item) => item.tipo === "fixo" ? money(item.valor_fixo) : `${Number(item.percentual).toLocaleString("pt-BR")}%` }, { key: "base_calculo", label: "Base" }, { key: "ativa", label: "Status", render: (item) => <StatusPill status={item.ativa ? "ativa" : "inativa"} /> }]} /></section>
        <section><h2 className="mb-3 text-lg font-black">Recorrências</h2><FinanceTable rows={finance.recurrences} columns={[{ key: "descricao", label: "Descrição" }, { key: "tipo", label: "Tipo" }, { key: "categoria_id", label: "Categoria", render: (item) => categoryNames.get(item.categoria_id) || "-" }, { key: "periodicidade", label: "Periodicidade" }, { key: "valor", label: "Valor", render: (item) => money(item.valor) }, { key: "proximo_vencimento", label: "Próximo vencimento" }, { key: "ativa", label: "Status", render: (item) => item.ativa ? "Ativa" : "Inativa" }]} /></section>
      </div>
    </FinancePage>
  );
}
