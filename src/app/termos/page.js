import Link from "next/link";

export const metadata = { title: "Termos de Uso | Clínica SaaS" };

const company = {
  productName: "Clínica SaaS - NexaWi",
  legalName: "NexaWi",
  document: "54.954.915/0001-65",
  contactEmail: "contato@nexawi.com.br",
  whatsapp: "(77) 9 8865-6394",
};

const sections = [
  ["Uso do sistema", `${company.productName} é uma plataforma SaaS para gestão de clínicas de estética, incluindo agenda, clientes, prontuário, anamnese, fotos antes/depois, financeiro, pacotes, usuários e indicadores operacionais.`],
  ["Responsabilidade da clínica", "A clínica contratante é responsável pela veracidade dos dados inseridos, pela autorização dos seus usuários, pela definição de papéis de acesso e pela obtenção de consentimentos necessários de clientes e pacientes."],
  ["Prontuário, fotos e dados sensíveis", "Informações sensíveis, anamnese, fotos antes/depois e termos de consentimento devem ser coletados e armazenados pela clínica conforme a legislação aplicável. O sistema fornece controles técnicos, mas a avaliação clínica e a regularidade dos procedimentos são responsabilidade da clínica."],
  ["Acesso e segurança", "Cada usuário deve usar credenciais próprias. É proibido compartilhar senha, acessar dados sem autorização, exportar informações indevidamente ou utilizar o sistema para finalidade ilícita."],
  ["Planos e cobrança", "O uso pode estar sujeito a planos, limites, período de teste, cobrança recorrente, bloqueio por inadimplência e cancelamento conforme condições comerciais acordadas."],
  ["Disponibilidade", "A plataforma busca operar com estabilidade, mas pode passar por manutenções, indisponibilidades de terceiros, instabilidades de internet, falhas de provedores ou ajustes técnicos necessários à evolução do produto."],
  ["Suporte e contato", `Canais oficiais: ${company.contactEmail} e ${company.whatsapp}. Substitua estes dados antes da publicação comercial.`],
];

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-emerald-700">Voltar</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Contrato</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Termos de Uso</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">Este termo é uma versão inicial, podendo ser alterado a qualquer momento sem aviso prévio.</p>

        <section className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
          <h2 className="font-semibold text-neutral-950">Empresa responsável pelo produto</h2>
          <p className="mt-2">Produto: {company.productName}</p>
          <p>Razão social: {company.legalName}</p>
          <p>CNPJ: {company.document}</p>
          <p>E-mail: {company.contactEmail}</p>
          <p>WhatsApp comercial: {company.whatsapp}</p>
        </section>

        <div className="mt-8 space-y-6">
          {sections.map(([title, text]) => <section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-7 text-neutral-600">{text}</p></section>)}
        </div>
        <p className="mt-8 rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-900">Para mais informações, entre em contato com o suporte.</p>
      </section>
    </main>
  );
}
