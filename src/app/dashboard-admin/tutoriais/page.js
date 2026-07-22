import Link from "next/link";
import { BookOpenCheck, Clock3, Eye, EyeOff, Film, Layers3, PencilLine, Sparkles } from "lucide-react";
import { upsertClinicTutorialAction } from "@/app/admin/actions";
import { Field, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageHero, StatusPill } from "../admin-core";
import { DeleteTutorialButton } from "./delete-tutorial-button";

export const metadata = { title: "Tutoriais admin | NexaWi Clínicas" };
export const dynamic = "force-dynamic";

function stepsText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function TutorialForm({ tutorial }) {
  return (
    <form action={upsertClinicTutorialAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      {tutorial?.id ? <input type="hidden" name="id" value={tutorial.id} /> : null}
      <div className="flex flex-col gap-3 border-b border-neutral-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ed7009]">{tutorial ? "Edição" : "Novo conteúdo"}</p>
          <h2 className="mt-2 text-xl font-black">{tutorial ? `Editar ${tutorial.titulo}` : "Cadastrar tutorial"}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">Use vídeos do YouTube, Vimeo ou um link direto para MP4/WebM. Os passos deixam a explicação mais simples para quem está começando.</p>
        </div>
        {tutorial ? <Link href="/dashboard-admin/tutoriais" className="text-sm font-black text-[#ed7009] hover:underline">Cancelar edição</Link> : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Título" name="titulo" defaultValue={tutorial?.titulo || ""} placeholder="Ex.: Como configurar a agenda" required />
        <Field label="Categoria" name="categoria" defaultValue={tutorial?.categoria || "Primeiros passos"} placeholder="Ex.: Agenda e atendimento" required />
        <Field label="URL do vídeo" name="video_url" type="url" defaultValue={tutorial?.video_url || ""} placeholder="https://youtube.com/watch?v=..." required />
        <Field label="URL da capa (opcional)" name="thumbnail_url" type="url" defaultValue={tutorial?.thumbnail_url || ""} placeholder="https://.../capa.jpg" />
        <Field label="Duração em minutos" name="duracao_minutos" type="number" defaultValue={tutorial?.duracao_minutos ?? 1} required />
        <Field label="Ordem de exibição" name="ordem" type="number" defaultValue={tutorial?.ordem ?? 0} required />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TextArea label="Resumo para o card" name="descricao_curta" defaultValue={tutorial?.descricao_curta || ""} placeholder="Explique em uma frase o que a pessoa aprenderá." />
        <TextArea label="Descrição completa" name="descricao" defaultValue={tutorial?.descricao || ""} placeholder="Contexto, cuidados e resultado esperado." />
      </div>
      <div className="mt-4">
        <TextArea label="Passo a passo (um item por linha)" name="passos" defaultValue={stepsText(tutorial?.passos)} placeholder={"Abra a agenda\nEscolha a data\nConfirme os dados da paciente"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700">
          <input name="ativo" type="checkbox" defaultChecked={tutorial?.ativo ?? true} />
          Visível para as clínicas
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
          <input name="destaque" type="checkbox" defaultChecked={tutorial?.destaque ?? false} />
          Destacar no início
        </label>
      </div>

      <div className="mt-5">
        <SubmitButton>{tutorial ? "Salvar alterações" : "Publicar tutorial"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function DashboardAdminTutorialsPage({ searchParams }) {
  const params = await searchParams;
  const { data, error } = await supabaseAdmin
    .from("clinica_tutoriais")
    .select("id, titulo, descricao_curta, descricao, categoria, video_url, thumbnail_url, duracao_minutos, ordem, passos, destaque, ativo, created_at, updated_at")
    .order("destaque", { ascending: false })
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const tutorials = data || [];
  const editing = params?.editar ? tutorials.find((item) => item.id === params.editar) : null;
  const activeCount = tutorials.filter((item) => item.ativo).length;
  const categories = new Set(tutorials.map((item) => item.categoria).filter(Boolean)).size;
  const totalMinutes = tutorials.filter((item) => item.ativo).reduce((total, item) => total + Number(item.duracao_minutos || 0), 0);
  const successMessages = {
    criado: "Tutorial publicado com sucesso.",
    atualizado: "Tutorial atualizado com sucesso.",
    excluido: "Tutorial excluído com sucesso.",
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Academia NexaWi"
        title="Ensine cada clínica a dominar o sistema"
        description="Organize vídeos e guias curtos para que proprietários, recepcionistas e profissionais encontrem respostas sem depender de suporte para cada etapa."
      />

      {successMessages[params?.ok] ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">{successMessages[params.ok]}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Tutoriais ativos", value: activeCount, icon: BookOpenCheck },
          { label: "Categorias", value: categories, icon: Layers3 },
          { label: "Minutos de conteúdo", value: totalMinutes, icon: Clock3 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-bold text-neutral-500">{item.label}</p><strong className="mt-2 block text-3xl font-black">{item.value}</strong></div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#ed7009]"><Icon size={21} /></span>
              </div>
            </article>
          );
        })}
      </section>

      <TutorialForm tutorial={editing} />

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1c1c1c] text-orange-300"><Film size={21} /></span>
          <div><h2 className="text-xl font-black">Biblioteca publicada</h2><p className="mt-1 text-sm text-neutral-500">A ordem menor aparece primeiro; destaques sempre ganham prioridade.</p></div>
        </div>

        <div className="mt-5 space-y-3">
          {tutorials.length ? tutorials.map((tutorial) => (
            <article key={tutorial.id} className="rounded-2xl border border-neutral-200 bg-neutral-50/75 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-black text-neutral-950">{tutorial.titulo}</h3>
                    <StatusPill tone={tutorial.ativo ? "ok" : "neutral"}>{tutorial.ativo ? "ativo" : "oculto"}</StatusPill>
                    {tutorial.destaque ? <StatusPill tone="accent">destaque</StatusPill> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{tutorial.descricao_curta || tutorial.descricao || "Sem descrição cadastrada."}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-neutral-500">
                    <span className="rounded-full bg-white px-3 py-1">{tutorial.categoria}</span>
                    <span className="rounded-full bg-white px-3 py-1">{tutorial.duracao_minutos} min</span>
                    <span className="rounded-full bg-white px-3 py-1">Ordem {tutorial.ordem}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">{tutorial.ativo ? <Eye size={13} /> : <EyeOff size={13} />}{tutorial.ativo ? "Disponível" : "Oculto"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={tutorial.video_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 transition hover:border-[#ed7009] hover:text-[#ed7009]"><Sparkles size={15} /> Ver vídeo</a>
                  <Link href={`/dashboard-admin/tutoriais?editar=${tutorial.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1c1c1c] px-3 text-xs font-black text-white transition hover:bg-[#ed7009]"><PencilLine size={15} /> Editar</Link>
                  <DeleteTutorialButton id={tutorial.id} title={tutorial.titulo} />
                </div>
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-5 py-10 text-center"><BookOpenCheck className="mx-auto text-neutral-400" size={32} /><h3 className="mt-3 font-black">Nenhum tutorial cadastrado</h3><p className="mt-2 text-sm text-neutral-500">Cadastre o primeiro vídeo usando o formulário acima.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
