import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, FileText, HeartPulse, MessageCircle, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createSignedPhotoUrl } from "@/lib/supabase/storage";
import {
  createClienteFotoAction,
  createClienteFotoUploadAction,
  deleteClienteFotoAction,
  updateClienteAnamneseAction,
  updateClienteFichaAction,
} from "../../actions";

export const metadata = { title: "Ficha do cliente | Clinica SaaS" };

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function whatsappUrl(phone, name) {
  const digits = onlyDigits(phone);
  if (!digits) return "";
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(`Olá, ${name || "tudo bem"}! Aqui é da clínica.`)}`;
}

function CheckboxField({ name, label, defaultChecked = false }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
      <input name={name} type="checkbox" defaultChecked={Boolean(defaultChecked)} />
      {label}
    </label>
  );
}

function SelectField({ label, name, defaultValue = "", children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select name={name} defaultValue={defaultValue || ""} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600">
        {children}
      </select>
    </label>
  );
}

export default async function ClienteDetalhePage({ params }) {
  const { id } = await params;
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const [{ data: cliente }, { data: agendamentos = [] }, { data: fotos = [] }, { data: pacotes = [] }] = await Promise.all([
    supabase.from("clientes").select("*").eq("clinica_id", activeClinic.id).eq("id", id).maybeSingle(),
    supabase
      .from("agendamentos")
      .select("id, inicio, fim, status, valor, pagamento_status, valor_pago, observacoes, profissionais(nome), procedimentos(nome)")
      .eq("clinica_id", activeClinic.id)
      .eq("cliente_id", id)
      .order("inicio", { ascending: false })
      .limit(30),
    supabase
      .from("cliente_fotos")
      .select("id, tipo, titulo, url, storage_path, observacoes, data_foto")
      .eq("clinica_id", activeClinic.id)
      .eq("cliente_id", id)
      .order("data_foto", { ascending: false }),
    supabase
      .from("cliente_pacotes")
      .select("id, nome_pacote, sessoes_total, sessoes_utilizadas, valor_total, status, data_compra, validade_em")
      .eq("clinica_id", activeClinic.id)
      .eq("cliente_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!cliente) notFound();

  const fotosComUrl = await Promise.all((fotos || []).map(async (foto) => ({
    ...foto,
    displayUrl: foto.storage_path ? await createSignedPhotoUrl(foto.storage_path) : foto.url,
  })));
  const anamnese = cliente.anamnese || {};
  const whats = whatsappUrl(cliente.telefone, cliente.nome);
  const proximoRetorno = cliente.retorno_recomendado_em ? new Date(`${cliente.retorno_recomendado_em}T12:00:00`) : null;
  const retornoAtrasado = proximoRetorno ? proximoRetorno < new Date() : false;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <Link href="/dashboard/clientes" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-950">
          <ArrowLeft size={16} /> Voltar para clientes
        </Link>

        <div className="mt-5">
          <PageHeader
            eyebrow="Ficha do cliente"
            title={cliente.nome}
            description={`${cliente.telefone || "Sem telefone"}${cliente.email ? ` · ${cliente.email}` : ""}`}
            action={whats ? <a className="inline-flex h-11 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700" href={whats} target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a> : null}
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">Status</p><strong className="mt-2 block capitalize">{cliente.status}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">Agendamentos</p><strong className="mt-2 block">{agendamentos.length}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">Retorno</p><strong className={`mt-2 block ${retornoAtrasado ? "text-red-700" : ""}`}>{formatDate(cliente.retorno_recomendado_em)}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">Consentimento</p><strong className="mt-2 block">{cliente.termo_consentimento_aceito ? "Aceito" : "Pendente"}</strong></div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <form action={updateClienteFichaAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="id" value={cliente.id} />
              <div className="flex items-center gap-2"><FileText size={20} className="text-emerald-700" /><h2 className="text-lg font-semibold">Ficha cadastral e clínica</h2></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Nome" name="nome" defaultValue={cliente.nome || ""} required />
                <Field label="Telefone" name="telefone" defaultValue={cliente.telefone || ""} />
                <Field label="E-mail" name="email" type="email" defaultValue={cliente.email || ""} />
                <Field label="CPF" name="cpf" defaultValue={cliente.cpf || ""} />
                <Field label="Nascimento" name="data_nascimento" type="date" defaultValue={cliente.data_nascimento || ""} />
                <Field label="Origem" name="origem" defaultValue={cliente.origem || ""} />
                <Field label="Endereço" name="endereco" defaultValue={cliente.endereco || ""} />
                <SelectField label="Status" name="status" defaultValue={cliente.status}>
                  <option value="lead">Lead</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="bloqueado">Bloqueado</option>
                </SelectField>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextArea label="Observações gerais" name="observacoes" defaultValue={cliente.observacoes || ""} />
                <TextArea label="Observações clínicas" name="observacoes_clinicas" defaultValue={cliente.observacoes_clinicas || ""} />
                <TextArea label="Alergias" name="alergias" defaultValue={cliente.alergias || ""} />
                <TextArea label="Contraindicações" name="contraindicacoes" defaultValue={cliente.contraindicacoes || ""} />
                <TextArea label="Medicamentos em uso" name="medicamentos_uso" defaultValue={cliente.medicamentos_uso || ""} />
                <TextArea label="Procedimentos prévios" name="procedimentos_previos" defaultValue={cliente.procedimentos_previos || ""} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Retorno recomendado" name="retorno_recomendado_em" type="date" defaultValue={cliente.retorno_recomendado_em || ""} />
                <Field label="Data/hora aceite termo" name="termo_consentimento_aceito_em" type="datetime-local" defaultValue={cliente.termo_consentimento_aceito_em ? cliente.termo_consentimento_aceito_em.slice(0, 16) : ""} />
              </div>
              <div className="mt-4 space-y-4">
                <label className="flex items-start gap-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
                  <input className="mt-1" name="termo_consentimento_aceito" type="checkbox" defaultChecked={cliente.termo_consentimento_aceito} />
                  Cliente assinou/aceitou o termo de consentimento para procedimentos e uso de imagens.
                </label>
                <TextArea label="Observação do termo" name="termo_consentimento_observacao" defaultValue={cliente.termo_consentimento_observacao || ""} />
              </div>
              <div className="mt-5"><SubmitButton>Salvar ficha</SubmitButton></div>
            </form>

            <form action={updateClienteAnamneseAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="id" value={cliente.id} />
              <div className="flex items-center gap-2"><HeartPulse size={20} className="text-emerald-700" /><h2 className="text-lg font-semibold">Anamnese estética</h2></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <TextArea label="Objetivo principal" name="objetivo_principal" defaultValue={anamnese.objetivo_principal || ""} />
                <TextArea label="Queixa principal" name="queixa_principal" defaultValue={anamnese.queixa_principal || ""} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <CheckboxField name="gestante" label="Gestante" defaultChecked={anamnese.gestante} />
                <CheckboxField name="lactante" label="Lactante" defaultChecked={anamnese.lactante} />
                <CheckboxField name="diabetes" label="Diabetes" defaultChecked={anamnese.diabetes} />
                <CheckboxField name="hipertensao" label="Hipertensão" defaultChecked={anamnese.hipertensao} />
                <CheckboxField name="marcapasso" label="Marcapasso" defaultChecked={anamnese.marcapasso} />
                <CheckboxField name="cancer_tratamento" label="Tratamento oncológico" defaultChecked={anamnese.cancer_tratamento} />
                <CheckboxField name="tendencia_queloide" label="Tendência a queloide" defaultChecked={anamnese.tendencia_queloide} />
                <CheckboxField name="usa_acidos" label="Usa ácidos" defaultChecked={anamnese.usa_acidos} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <TextArea label="Exposição solar" name="exposicao_solar" defaultValue={anamnese.exposicao_solar || ""} />
                <TextArea label="Rotina de skincare" name="rotina_skincare" defaultValue={anamnese.rotina_skincare || ""} />
                <TextArea label="Observações da anamnese" name="anamnese_observacoes" defaultValue={anamnese.observacoes || ""} />
              </div>
              <div className="mt-5"><SubmitButton>Salvar anamnese</SubmitButton></div>
            </form>
          </div>

          <aside className="space-y-6">
            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><CalendarDays size={20} className="text-emerald-700" /><h2 className="text-lg font-semibold">Histórico</h2></div>
              <div className="mt-4 space-y-3">
                {agendamentos.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Sem histórico.</p> : agendamentos.map((item) => (
                  <div key={item.id} className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-sm font-semibold">{item.procedimentos?.nome || "Procedimento"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(item.inicio)} · {item.profissionais?.nome || "Profissional"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.status} · {formatMoney(item.valor)} · Pagamento: {item.pagamento_status || "pendente"}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Camera size={20} className="text-emerald-700" /><h2 className="text-lg font-semibold">Fotos antes/depois</h2></div>
              <form action={createClienteFotoUploadAction} className="mt-4 space-y-3 rounded-lg bg-neutral-50 p-3">
                <input type="hidden" name="cliente_id" value={cliente.id} />
                <SelectField label="Tipo" name="tipo" defaultValue="evolucao">
                  <option value="antes">Antes</option>
                  <option value="depois">Depois</option>
                  <option value="evolucao">Evolução</option>
                  <option value="documento">Documento</option>
                </SelectField>
                <Field label="Título" name="titulo" />
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">Arquivo da imagem</span>
                  <input className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" name="arquivo" type="file" accept="image/png,image/jpeg,image/webp" required />
                </label>
                <Field label="Data da foto" name="data_foto" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                <TextArea label="Observações" name="observacoes" />
                <SubmitButton>Enviar foto</SubmitButton>
              </form>

              <details className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Adicionar por URL externa</summary>
                <form action={createClienteFotoAction} className="mt-3 space-y-3">
                  <input type="hidden" name="cliente_id" value={cliente.id} />
                  <SelectField label="Tipo" name="tipo" defaultValue="evolucao">
                    <option value="antes">Antes</option>
                    <option value="depois">Depois</option>
                    <option value="evolucao">Evolução</option>
                    <option value="documento">Documento</option>
                  </SelectField>
                  <Field label="Título" name="titulo" />
                  <Field label="URL da imagem" name="url" required />
                  <Field label="Data da foto" name="data_foto" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                  <TextArea label="Observações" name="observacoes" />
                  <SubmitButton>Adicionar por URL</SubmitButton>
                </form>
              </details>

              <div className="mt-4 space-y-3">
                {fotosComUrl.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhuma foto cadastrada.</p> : fotosComUrl.map((foto) => (
                  <div key={foto.id} className="rounded-lg border border-neutral-200 p-3">
                    <a href={foto.displayUrl || foto.url || "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.displayUrl || foto.url} alt={foto.titulo || foto.tipo} className="h-44 w-full object-cover" />
                    </a>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{foto.titulo || foto.tipo}</p>
                        <p className="text-xs text-neutral-500">{foto.tipo} · {formatDate(foto.data_foto)}</p>
                      </div>
                      <form action={deleteClienteFotoAction}>
                        <input type="hidden" name="id" value={foto.id} />
                        <input type="hidden" name="cliente_id" value={cliente.id} />
                        <button type="submit" className="text-xs font-semibold text-red-700">Excluir</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Pacotes comprados</h2>
              <div className="mt-4 space-y-3">
                {pacotes.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum pacote vendido.</p> : pacotes.map((pacote) => (
                  <div key={pacote.id} className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-sm font-semibold">{pacote.nome_pacote}</p>
                    <p className="mt-1 text-xs text-neutral-500">Sessões: {pacote.sessoes_utilizadas}/{pacote.sessoes_total} · {formatMoney(pacote.valor_total)}</p>
                    <p className="mt-1 text-xs text-neutral-500">Status: {pacote.status} · Validade: {formatDate(pacote.validade_em)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <div className="flex items-center gap-2"><ShieldCheck size={20} /><h2 className="text-lg font-semibold">Termo e LGPD</h2></div>
              <p className="mt-3 text-sm leading-6">Registre autorização de tratamento de dados, procedimentos e uso de imagens. Depois podemos evoluir para assinatura digital com PDF.</p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
