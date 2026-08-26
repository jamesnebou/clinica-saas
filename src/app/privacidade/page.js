import Link from "next/link";

export const metadata = { title: "Política de Privacidade | Sistema de Gestão para Clínicas" };

const company = {
  productName: "NexaWi Clínicas",
  legalName: "NexaWi",
  document: "54.954.915/0001-65",
  contactEmail: "contato@nexawi.com.br",
  commercialEmail: "contato@nexawi.com.br",
  whatsapp: "(77) 9 8865-6394",
};

const sections = [
  ["Controlador e operador", `${company.productName} atua como plataforma de apoio operacional para clínicas. A clínica contratante normalmente atua como controladora dos dados dos seus clientes, enquanto a plataforma pode atuar como operadora, conforme contrato e configuração do serviço.`],
  ["Dados tratados", "Podemos tratar dados cadastrais da clínica, usuários autorizados, clientes, agendamentos, prontuário, anamnese, fotos de evolução, pagamentos, logs operacionais e registros de consentimento."],
  ["Dados sensíveis", "Dados de saúde, anamnese, alergias, contraindicações, fotos antes/depois e informações clínicas devem ser acessados apenas por usuários autorizados pela clínica e usados exclusivamente para atendimento, acompanhamento, obrigações legais e defesa de direitos."],
  ["Finalidade", "Os dados são utilizados para operar agenda, atendimento, relacionamento com clientes, controle financeiro, cumprimento de obrigações legais, suporte técnico, segurança e melhoria do serviço."],
  ["Base legal", "O tratamento pode ocorrer por execução de contrato, legítimo interesse, obrigação legal e consentimento, especialmente para dados sensíveis, fotos, anamnese e termos de autorização."],
  ["Segurança", "O sistema usa autenticação, segregação por clínica, controles de acesso por papel e armazenamento privado para fotos clínicas. Usuários da clínica devem manter senhas protegidas e conceder acesso apenas a pessoas autorizadas."],
  ["Direitos dos titulares", "Clientes podem solicitar confirmação de tratamento, acesso, correção, exclusão, portabilidade, informação sobre compartilhamento e revisão de consentimento diretamente à clínica responsável pelos dados."],
  ["Retenção", "Os dados são mantidos enquanto necessários para a prestação do serviço, obrigações legais, defesa de direitos ou conforme orientação da clínica controladora."],
];

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-emerald-700">Voltar</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">LGPD</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">Este termo é uma versão inicial, podendo ser alterado a qualquer momento sem aviso prévio.</p>

        <section className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
          <h2 className="font-semibold text-neutral-950">Empresa responsável pelo produto</h2>
          <p className="mt-2">Produto: Sistema de Gestão de clínicas - NexaWi</p>
          <p>Empresa: NexaWi Clínicas</p>
          <p>CNPJ: {company.document}</p>
          <p>E-mail de privacidade: {company.contactEmail}</p>
          <p>E-mail comercial: {company.commercialEmail}</p>
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
