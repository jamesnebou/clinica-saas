import Link from "next/link";

export const metadata = { title: "Termos de Uso | Clinica SaaS" };

const sections = [
  ["Uso do sistema", "O Clinica SaaS é uma plataforma para gestão de clínicas de estética, incluindo agenda, clientes, prontuário, financeiro, pacotes, usuários e indicadores operacionais."],
  ["Responsabilidade da clínica", "A clínica contratante é responsável pela veracidade dos dados inseridos, pela autorização de seus usuários e pela obtenção de consentimentos necessários de clientes e pacientes."],
  ["Acesso e segurança", "Cada usuário deve usar credenciais próprias. É proibido compartilhar senha, acessar dados sem autorização ou utilizar o sistema para finalidade ilícita."],
  ["Planos e cobrança", "O uso pode estar sujeito a planos, limites, período de teste, bloqueio por inadimplência e cancelamento conforme condições comerciais acordadas."],
  ["Disponibilidade", "A plataforma busca operar com estabilidade, mas pode passar por manutenções, indisponibilidades de terceiros ou ajustes técnicos necessários à evolução do produto."],
  ["Dados clínicos e fotos", "Informações sensíveis, anamnese, fotos antes/depois e termos de consentimento devem ser coletados e armazenados pela clínica conforme a legislação aplicável."],
];

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold text-emerald-700">← Voltar</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Contrato</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Termos de Uso</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-600">Este texto é uma versão inicial para demonstração e deve ser revisado juridicamente antes da comercialização formal do SaaS.</p>
        <div className="mt-8 space-y-6">
          {sections.map(([title, text]) => <section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-7 text-neutral-600">{text}</p></section>)}
        </div>
      </section>
    </main>
  );
}
