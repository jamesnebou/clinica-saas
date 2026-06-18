import Link from "next/link";

export const metadata = { title: "Política de Privacidade | Clinica SaaS" };

const sections = [
  ["Dados tratados", "Podemos tratar dados cadastrais da clínica, usuários autorizados, clientes, agendamentos, prontuário, anamnese, fotos de evolução, pagamentos e registros de consentimento."],
  ["Finalidade", "Os dados são utilizados para operar agenda, atendimento, relacionamento com clientes, controle financeiro, cumprimento de obrigações legais e melhoria do serviço."],
  ["Base legal", "O tratamento pode ocorrer por execução de contrato, legítimo interesse, obrigação legal e consentimento, especialmente para dados sensíveis, fotos, anamnese e termos de autorização."],
  ["Segurança", "O sistema usa autenticação, segregação por clínica e controles de acesso. Usuários da clínica devem manter senhas protegidas e conceder acesso apenas a pessoas autorizadas."],
  ["Direitos dos titulares", "Clientes podem solicitar confirmação de tratamento, acesso, correção, exclusão, portabilidade e revisão de consentimento diretamente à clínica responsável pelos dados."],
  ["Retenção", "Os dados são mantidos enquanto necessários para a prestação do serviço, obrigações legais, defesa de direitos ou conforme orientação da clínica controladora."],
];

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-emerald-700">← Voltar</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">LGPD</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">Este texto é uma base operacional para demonstração do Clinica SaaS. Antes da venda em produção, recomenda-se revisão jurídica para adequar responsabilidades da plataforma, da clínica contratante e dos titulares dos dados.</p>
        <div className="mt-8 space-y-6">
          {sections.map(([title, text]) => <section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-7 text-neutral-600">{text}</p></section>)}
        </div>
        <p className="mt-8 rounded-lg bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">Contato para privacidade: informe nesta página o e-mail oficial da empresa responsável pelo produto antes de publicar comercialmente.</p>
      </section>
    </main>
  );
}
