import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyClinicState, Notice, PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveBIPeriod } from "@/lib/bi/periods";

const TYPES = {
  no_show: { title: "Faltas no período", description: "Atendimentos marcados como faltou." },
  cancelamentos: { title: "Cancelamentos no período", description: "Atendimentos cancelados dentro do intervalo analisado." },
  leads_perdidos: { title: "Leads perdidos", description: "Oportunidades marcadas como perdidas no CRM." },
  sem_retorno: { title: "Pacientes sem retorno", description: "Pacientes sem atendimento válido nos últimos 90 dias." },
};

function value(params, key) { return typeof params?.[key] === "string" ? params[key].trim() : ""; }
function money(entry) { return Number(entry || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function date(entry, timeZone) { return entry ? new Date(entry).toLocaleString("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }) : "Nunca atendido"; }

export default async function BIDetailPage({ searchParams }) {
  const params = await searchParams;
  const type = TYPES[value(params, "tipo")] ? value(params, "tipo") : "no_show";
  const definition = TYPES[type];
  const page = Math.max(1, Number.parseInt(value(params, "pagina") || "1", 10) || 1);
  const limit = 50;
  const { activeClinic } = await requireClinicSection("bi");
  if (!activeClinic) return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;

  const period = resolveBIPeriod({ preset: value(params, "periodo") || "30d", customStart: value(params, "inicio"), customEnd: value(params, "fim"), clinic: activeClinic });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bi_detalhes_clinica", {
    p_clinica_id: activeClinic.id, p_tipo: type,
    p_inicio: period.current.start.toISOString(), p_fim: period.current.end.toISOString(),
    p_timezone: period.timeZone, p_limite: limit, p_offset: (page - 1) * limit,
  });
  const rows = data?.rows || [];
  const total = Number(data?.total || 0);
  const query = new URLSearchParams({ tipo: type, periodo: period.preset });
  if (period.preset === "custom") { query.set("inicio", period.current.startKey); query.set("fim", period.current.endKey); }



  return (
    <main className="min-w-0 overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <section className="mx-auto max-w-[1680px]">
        <PageHeader eyebrow="Drill-down de BI" title={definition.title} description={`${definition.description} Período: ${period.current.startKey.split("-").reverse().join("/")} a ${period.current.endKey.split("-").reverse().join("/")}.`} action={<Link href="/dashboard/bi" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-bold"><ArrowLeft size={17} /> Voltar ao BI</Link>} />
        {error ? <div className="mt-6"><Notice type="warning" title="Detalhamento indisponível">{error.message}</Notice></div> : (
          <section className="premium-panel mt-6 overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4"><h2 className="font-black">{total.toLocaleString("pt-BR")} registro(s)</h2><span className="text-xs text-neutral-500">Página {page}</span></div>
            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-[0.1em] text-neutral-500"><tr>{type === "leads_perdidos" ? <><th className="px-5 py-3">Lead</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Origem</th><th className="px-5 py-3">Potencial</th><th className="px-5 py-3">Criado em</th></> : type === "sem_retorno" ? <><th className="px-5 py-3">Paciente</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Último atendimento</th></> : <><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Atendimento</th><th className="px-5 py-3">Profissional</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Valor</th></>}</tr></thead>
                <tbody className="divide-y divide-neutral-100">{rows.length ? rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50">
                    {type === "leads_perdidos" ? <><td className="px-5 py-4 font-bold">{row.nome}</td><td className="px-5 py-4 text-neutral-600">{row.telefone || row.email || "Não informado"}</td><td className="px-5 py-4">{row.source || row.origem || "Não informada"}</td><td className="px-5 py-4">{money(row.valor_estimado)}</td><td className="px-5 py-4">{date(row.created_at, period.timeZone)}</td></> : type === "sem_retorno" ? <><td className="px-5 py-4 font-bold">{row.nome}</td><td className="px-5 py-4 text-neutral-600">{row.telefone || row.email || "Não informado"}</td><td className="px-5 py-4">{date(row.ultimo_atendimento, period.timeZone)}</td></> : <><td className="px-5 py-4 font-bold">{row.cliente}</td><td className="px-5 py-4">{row.procedimento}</td><td className="px-5 py-4">{row.profissional}</td><td className="px-5 py-4">{date(row.inicio, period.timeZone)}</td><td className="px-5 py-4">{money(row.valor)}</td></>}
                  </tr>
                )) : <tr><td colSpan={5} className="px-5 py-12 text-center text-neutral-500">Nenhum registro encontrado neste período.</td></tr>}</tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-4">
              {page > 1 ? <Link href={`/dashboard/bi/detalhes?${query}&pagina=${page - 1}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 px-3 text-sm font-bold"><ChevronLeft size={16} /> Anterior</Link> : null}
              {page * limit < total ? <Link href={`/dashboard/bi/detalhes?${query}&pagina=${page + 1}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 px-3 text-sm font-bold">Próxima <ChevronRight size={16} /></Link> : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
