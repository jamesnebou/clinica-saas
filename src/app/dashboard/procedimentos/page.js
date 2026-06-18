import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createProcedimentoAction, deleteProcedimentoAction, toggleProcedimentoAction } from "../actions";

export const metadata = { title: "Procedimentos | Clinica SaaS" };

export default async function ProcedimentosPage() {
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const { data: procedimentos = [] } = await supabase
    .from("procedimentos")
    .select("id, nome, categoria, descricao, duracao_minutos, preco, ativo")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Servicos" title="Procedimentos" description="Tabela de serviços, duração, preço e orientações." />

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createProcedimentoAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo procedimento</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" name="nome" required />
              <Field label="Categoria" name="categoria" placeholder="Facial, corporal, injetavel..." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Duração (min)" name="duracao_minutos" type="number" defaultValue="60" />
                <Field label="Preço" name="preco" type="number" defaultValue="0" />
              </div>
              <TextArea label="Descrição" name="descricao" />
              <TextArea label="Cuidados antes" name="cuidados_antes" />
              <TextArea label="Cuidados depois" name="cuidados_depois" />
              <SubmitButton>Cadastrar procedimento</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Procedimentos cadastrados</h2>
            <div className="mt-4 space-y-3">
              {procedimentos.length === 0 ? (
                <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum procedimento cadastrado.</p>
              ) : procedimentos.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{item.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.categoria || "Sem categoria"} · {item.duracao_minutos} min</p>
                      <p className="mt-1 text-xs text-neutral-500">R$ {Number(item.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleProcedimentoAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
                        <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">
                          {item.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={deleteProcedimentoAction}>
                        <input type="hidden" name="id" value={item.id} />
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
