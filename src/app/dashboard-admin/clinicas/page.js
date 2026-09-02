import { ClinicEditCard, PageHero, loadDashboardAdminData } from "../admin-core";

export const metadata = { title: "Clínicas admin | NexaWi Clínicas" };

const ERROR_MESSAGES = {
  dados_invalidos: "Preencha a confirmação e escolha o tipo de exclusão.",
  clinica_nao_encontrada: "A clínica não foi encontrada.",
  demo_protegida: "A clínica demo oficial é protegida e não pode ser excluída.",
  confirmacao_incorreta: "O nome informado não corresponde ao nome da clínica.",
  migration_pendente: "A migration de exclusão ainda não está disponível no banco.",
  membros_indisponiveis: "Não foi possível conferir os usuários vinculados. Nada foi excluído.",
  asaas_cancelamento: "Não foi possível cancelar a assinatura no Asaas. Nada foi excluído.",
  banco_de_dados: "Não foi possível excluir a clínica do banco de dados.",
};

export default async function DashboardAdminClinicasPage({ searchParams }) {
  const query = await searchParams;
  const { plans, enrichedClinics } = await loadDashboardAdminData();
  const warningCount = Number(query?.warnings || 0);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Clínicas" title="Gestão das clínicas" description="Visualize, edite plano, status comercial, cobrança, isenção e integrações comerciais de cada clínica." />

      {query?.ok === "excluida" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          Clínica e dados relacionados excluídos do banco.{query.scope === "full" ? " Contas de acesso exclusivas também foram removidas." : " As contas de acesso foram preservadas."}
          {warningCount > 0 ? ` ${warningCount} limpeza(s) complementar(es) precisam de revisão.` : ""}
        </div>
      ) : null}

      {query?.erro ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {ERROR_MESSAGES[query.erro] || "Não foi possível excluir a clínica."}
        </div>
      ) : null}

      <section className="space-y-4">
        {enrichedClinics.length ? (
          enrichedClinics.map((clinic) => <ClinicEditCard key={clinic.id} clinic={clinic} plans={plans} />)
        ) : (
          <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">Nenhuma clínica cadastrada.</p>
        )}
      </section>
    </div>
  );
}

