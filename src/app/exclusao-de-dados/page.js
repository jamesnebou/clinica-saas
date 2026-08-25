import Link from "next/link";

const contactEmail = "contato@nexawi.com.br";

export const metadata = {
  title: "Exclusão de Dados | NexaWi Clínicas",
  description:
    "Saiba como solicitar a exclusão ou anonimização de dados pessoais tratados pela plataforma NexaWi Clínicas.",
  alternates: {
    canonical: "/exclusao-de-dados",
  },
  openGraph: {
    title: "Exclusão de Dados | NexaWi Clínicas",
    description:
      "Orientações para solicitar a exclusão ou anonimização de dados pessoais na NexaWi Clínicas.",
    url: "/exclusao-de-dados",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const sections = [
  {
    title: "Como solicitar a exclusão",
    content: (
      <>
        <p>
          O titular pode solicitar a exclusão de seus dados entrando em contato pelo e-mail:{" "}
          <a className="font-semibold text-emerald-700 underline underline-offset-4" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          A solicitação deve conter informações suficientes para permitir a identificação segura do solicitante e dos dados relacionados ao pedido.
        </p>
      </>
    ),
  },
  {
    title: "O que acontece após a solicitação",
    content:
      "Após a confirmação da identidade do solicitante, a NexaWi avaliará o pedido e realizará a exclusão ou anonimização dos dados aplicáveis, respeitando os prazos legais e técnicos necessários.",
  },
  {
    title: "Dados que podem ser mantidos",
    content:
      "Alguns dados poderão ser mantidos quando houver obrigação legal, regulatória, contratual, necessidade de exercício regular de direitos, prevenção a fraude ou outra base legal prevista na LGPD.",
  },
  {
    title: "Dados de clínicas e pacientes",
    content:
      "Quando a NexaWi atuar como operadora de dados em nome de uma clínica, determinadas solicitações poderão precisar ser direcionadas ou confirmadas pela clínica responsável pelo tratamento dos dados.",
  },
  {
    title: "Revogação de integrações",
    content:
      "Quando aplicável, o usuário também pode revogar permissões concedidas a integrações externas, incluindo serviços da Meta e WhatsApp, sem prejuízo do direito de solicitar exclusão dos dados armazenados pela NexaWi.",
  },
];

export default function ExclusaoDeDadosPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-emerald-700">
          Voltar
        </Link>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">LGPD</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Exclusão de Dados</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          A NexaWi Clínicas respeita os direitos dos titulares de dados e disponibiliza meios para solicitar a exclusão de informações pessoais tratadas pela plataforma, nos termos da Lei Geral de Proteção de Dados (LGPD).
        </p>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-2 text-sm leading-7 text-neutral-600">{section.content}</div>
            </section>
          ))}
        </div>

        <section className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
          <h2 className="font-semibold text-neutral-950">Contato</h2>
          <a className="mt-2 inline-block font-semibold text-emerald-700 underline underline-offset-4" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </section>
      </section>
    </main>
  );
}
