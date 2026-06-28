import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, EmptyState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createProcedimentoAction, deleteProcedimentoAction, toggleProcedimentoAction, updateProcedimentoAction } from "../actions";

export const metadata = { title: "Procedimentos | Clínica SaaS" };

export default async function ProcedimentosPage() {
  const { activeClinic } = await requireClinicSection("procedimentos");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const { data: procedimentos = [] } = await supabase
    .from("procedimentos")
    .select("id, nome, categoria, descricao, duracao_minutos, preco, ativo, publicado_site, destaque_site, sinal_percentual, sinal_valor, ordem_site, cuidados_antes, cuidados_depois, imagem_url, imagem_storage_path")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Serviços" title="Procedimentos" description="Tabela de serviços, duração, preço e orientações." />

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createProcedimentoAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo procedimento</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" name="nome" required />
              <Field label="Categoria" name="categoria" placeholder="Facial, corporal, injetável..." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Duração (min)" name="duracao_minutos" type="number" defaultValue="60" />
                <Field label="Preço" name="preco" type="number" defaultValue="0" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Sinal fixo" name="sinal_valor" type="number" defaultValue="0" />
                <Field label="Sinal (%)" name="sinal_percentual" type="number" defaultValue="0" />
                <Field label="Ordem no site" name="ordem_site" type="number" defaultValue="0" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700">
                  <input type="checkbox" name="publicado_site" defaultChecked />
                  Publicar no site
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700">
                  <input type="checkbox" name="destaque_site" />
                  Destacar no site
                </label>
              </div>
              <TextArea label="Descrição" name="descricao" />
              <TextArea label="Cuidados antes" name="cuidados_antes" />
              <TextArea label="Cuidados depois" name="cuidados_depois" />
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Imagem do procedimento</span>
                <input
                  name="imagem_file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Opcional. Recomendado: 1200x900 px. Limite máximo de 10 MB.</span>
              </label>
              <SubmitButton>Cadastrar procedimento</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Procedimentos cadastrados</h2>
            <div className="mt-4 space-y-3">
              {procedimentos.length === 0 ? (
                <EmptyState title="Nenhum procedimento criado" description="Cadastre serviços com duração e preço para acelerar agendamentos, pacotes e faturamento previsto." />
              ) : procedimentos.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{item.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.categoria || "Sem categoria"} · {item.duracao_minutos} min</p>
                      <p className="mt-1 text-xs text-neutral-500">R$ {Number(item.preco || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Site: {item.publicado_site ? "publicado" : "oculto"} · Sinal: {Number(item.sinal_valor || 0) > 0 ? `R$ ${Number(item.sinal_valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `${Number(item.sinal_percentual || 0)}%`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`#editar-${item.id}`} className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-3 text-sm font-semibold">
                        Editar
                      </a>
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
                  <details id={`editar-${item.id}`} className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <summary className="cursor-pointer text-sm font-bold text-neutral-800">Editar procedimento</summary>
                    <form action={updateProcedimentoAction} className="mt-4 grid gap-4">
                      <input type="hidden" name="id" value={item.id} />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Nome" name="nome" defaultValue={item.nome || ""} required />
                        <Field label="Categoria" name="categoria" defaultValue={item.categoria || ""} placeholder="Facial, corporal, injetável..." />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Duração (min)" name="duracao_minutos" type="number" defaultValue={String(item.duracao_minutos || 60)} />
                        <Field label="Preço" name="preco" type="number" defaultValue={String(item.preco || 0)} />
                        <Field label="Ordem no site" name="ordem_site" type="number" defaultValue={String(item.ordem_site || 0)} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Sinal fixo" name="sinal_valor" type="number" defaultValue={String(item.sinal_valor || 0)} />
                        <Field label="Sinal (%)" name="sinal_percentual" type="number" defaultValue={String(item.sinal_percentual || 0)} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700">
                          <input type="checkbox" name="publicado_site" defaultChecked={item.publicado_site !== false} />
                          Publicar no site
                        </label>
                        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700">
                          <input type="checkbox" name="destaque_site" defaultChecked={Boolean(item.destaque_site)} />
                          Destacar no site
                        </label>
                      </div>
                      <TextArea label="Descrição" name="descricao" defaultValue={item.descricao || ""} />
                      <TextArea label="Cuidados antes" name="cuidados_antes" defaultValue={item.cuidados_antes || ""} />
                      <TextArea label="Cuidados depois" name="cuidados_depois" defaultValue={item.cuidados_depois || ""} />
                      <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-start">
                        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                          {item.imagem_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imagem_url} alt={item.nome} className="h-32 w-full object-cover" />
                          ) : (
                            <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-neutral-500">Sem imagem cadastrada</div>
                          )}
                        </div>
                        <label className="block">
                          <span className="text-sm font-medium text-neutral-700">Imagem do procedimento</span>
                          <input
                            name="imagem_file"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                          />
                          <span className="mt-2 block text-xs leading-5 text-neutral-500">Opcional. Se enviar uma nova imagem, ela substitui a imagem exibida no site. Limite máximo de 10 MB.</span>
                        </label>
                      </div>
                      <div>
                        <SubmitButton>Salvar alterações</SubmitButton>
                      </div>
                    </form>
                  </details>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

