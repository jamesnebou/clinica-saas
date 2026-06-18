import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, EmptyState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createClienteAction, deleteClienteAction, updateClienteStatusAction } from "../actions";

export const metadata = { title: "Clientes | Clinica SaaS" };

export default async function ClientesPage() {
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const { data: clientes = [] } = await supabase
    .from("clientes")
    .select("id, nome, telefone, email, cpf, status, origem, consentimento_lgpd, termo_consentimento_aceito, retorno_recomendado_em, created_at")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Clientes" title="Clientes e leads" description="Cadastro inicial dos clientes da clinica, com consentimento LGPD e origem." />

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createClienteAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo cliente</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" name="nome" required />
              <Field label="Telefone/WhatsApp" name="telefone" />
              <Field label="E-mail" name="email" type="email" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="CPF" name="cpf" />
                <Field label="Nascimento" name="data_nascimento" type="date" />
              </div>
              <Field label="Origem" name="origem" placeholder="Instagram, indicacao, trafego pago..." />
              <TextArea label="Observacoes" name="observacoes" />
              <label className="flex items-start gap-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
                <input className="mt-1" name="consentimento_lgpd" type="checkbox" />
                Cliente autorizou o cadastro e tratamento dos dados pela clinica.
              </label>
              <SubmitButton>Cadastrar cliente</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Lista de clientes</h2>
            <div className="mt-4 space-y-3">
              {clientes.length === 0 ? (
                <EmptyState title="Nenhum cliente cadastrado ainda" description="Cadastre o primeiro cliente para liberar ficha, anamnese, fotos de evolução, histórico de agenda e retorno recomendado." />
              ) : clientes.map((cliente) => (
                <article key={cliente.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{cliente.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{cliente.telefone || "Sem telefone"} {cliente.email ? `· ${cliente.email}` : ""}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Origem: {cliente.origem || "-"} · LGPD: {cliente.consentimento_lgpd ? "sim" : "nao"} · Termo: {cliente.termo_consentimento_aceito ? "aceito" : "pendente"}
                      </p>
                      {cliente.retorno_recomendado_em ? (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Retorno recomendado: {new Date(`${cliente.retorno_recomendado_em}T12:00:00`).toLocaleDateString("pt-BR")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/clientes/${cliente.id}`} className="inline-flex h-9 items-center rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-700">
                        Abrir ficha
                      </Link>
                      <form action={updateClienteStatusAction} className="flex gap-2">
                        <input type="hidden" name="id" value={cliente.id} />
                        <select name="status" defaultValue={cliente.status} className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm">
                          <option value="lead">Lead</option>
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                          <option value="bloqueado">Bloqueado</option>
                        </select>
                        <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">Salvar</button>
                      </form>
                      <form action={deleteClienteAction}>
                        <input type="hidden" name="id" value={cliente.id} />
                        <button type="submit" className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Excluir</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

