import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createProfissionalAction, deleteProfissionalAction, toggleProfissionalAction } from "../actions";

export const metadata = { title: "Profissionais | Clinica SaaS" };

export default async function ProfissionaisPage() {
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const { data: profissionais = [] } = await supabase
    .from("profissionais")
    .select("id, nome, telefone, email, especialidade, comissao_percentual, ativo, observacoes")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Equipe" title="Profissionais" description="Cadastre especialistas, comissoes e status de atendimento." />

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createProfissionalAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo profissional</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" name="nome" required />
              <Field label="Telefone" name="telefone" />
              <Field label="E-mail" name="email" type="email" />
              <Field label="Especialidade" name="especialidade" placeholder="Esteticista, biomédica, fisioterapeuta..." />
              <Field label="Comissao (%)" name="comissao_percentual" type="number" defaultValue="0" />
              <TextArea label="Observacoes" name="observacoes" />
              <SubmitButton>Cadastrar profissional</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Equipe cadastrada</h2>
            <div className="mt-4 space-y-3">
              {profissionais.length === 0 ? (
                <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum profissional cadastrado.</p>
              ) : profissionais.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{item.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.especialidade || "Sem especialidade"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.telefone || "Sem telefone"} · Comissão: {Number(item.comissao_percentual || 0)}%</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleProfissionalAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
                        <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">
                          {item.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={deleteProfissionalAction}>
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
