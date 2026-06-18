import { CalendarDays, CreditCard, Scissors, UsersRound } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyClinicState, PageHeader } from "@/components/app-shell/ui";

async function countRows(supabase, table, clinicaId) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId);

  if (error) {
    console.error(`Erro ao contar ${table}:`, error);
    return 0;
  }

  return count || 0;
}

export default async function DashboardPage() {
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return (
      <main className="px-5 py-8 sm:px-8 lg:px-10">
        <EmptyClinicState />
      </main>
    );
  }

  const supabase = await createClient();
  const [clientes, profissionais, procedimentos, agendamentos] = await Promise.all([
    countRows(supabase, "clientes", activeClinic.id),
    countRows(supabase, "profissionais", activeClinic.id),
    countRows(supabase, "procedimentos", activeClinic.id),
    countRows(supabase, "agendamentos", activeClinic.id),
  ]);

  const { data: proximos = [] } = await supabase
    .from("agendamentos")
    .select("id, inicio, status, valor, clientes(nome), profissionais(nome), procedimentos(nome)")
    .eq("clinica_id", activeClinic.id)
    .gte("inicio", new Date().toISOString())
    .order("inicio", { ascending: true })
    .limit(5);

  const cards = [
    { label: "Clientes", value: clientes, icon: UsersRound },
    { label: "Profissionais", value: profissionais, icon: UsersRound },
    { label: "Procedimentos", value: procedimentos, icon: Scissors },
    { label: "Agendamentos", value: agendamentos, icon: CalendarDays },
  ];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Dashboard"
          title="Operacao da clinica"
          description={`Visao operacional de ${activeClinic.nome}. A base ja esta conectada ao Supabase.`}
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-500">{card.label}</span>
                  <Icon size={20} className="text-emerald-600" />
                </div>
                <strong className="mt-4 block text-3xl font-semibold">{card.value}</strong>
              </article>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Proximos agendamentos</h2>
            <div className="mt-4 space-y-3">
              {proximos.length === 0 ? (
                <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum agendamento futuro cadastrado.</p>
              ) : proximos.map((item) => (
                <div key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.clientes?.nome || "Cliente nao informado"}</p>
                      <p className="mt-1 text-sm text-neutral-600">{item.procedimentos?.nome || "Procedimento nao informado"}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">{item.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500">
                    {new Date(item.inicio).toLocaleString("pt-BR")} com {item.profissionais?.nome || "profissional nao informado"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-lg border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
            <CreditCard size={24} className="text-emerald-400" />
            <h2 className="mt-4 text-lg font-semibold">Proximas prioridades</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-300">
              <li>1. Criar primeira clinica e vincular usuario no Supabase.</li>
              <li>2. Cadastrar equipe, servicos e clientes reais.</li>
              <li>3. Validar fluxo de agenda antes de financeiro.</li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
