"use client";
import { useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export function CoexistenceImportPanel({ authorizedAt, requestStatuses = [], importedContacts = 0, importedMessages = 0, historyUnavailable = false, schemaReady = true }) {
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (!authorized || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch("/api/whatsapp/coexistence/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorizeImport: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nao foi possivel solicitar a importacao.");
      setSubmitted(true);
      setMessage(Object.values(body.requests || {}).includes("uncertain")
        ? "A Meta nao confirmou uma das solicitacoes. Nao repita a importacao; solicite verificacao ao suporte. Mensagens novas continuam ativas."
        : "Solicitacao registrada. A disponibilidade dos dados depende da Meta e do compartilhamento autorizado no aplicativo.");
    } catch (error) {
      setMessage(error.message);
    } finally { setBusy(false); lock.current = false; }
  }
  return <section className="mt-6 border-t border-neutral-200 pt-6">
    <h3 className="text-lg font-bold">Importação opcional do WhatsApp Business App</h3>
    {authorizedAt ? <div className="mt-3 space-y-2 text-sm">
      <p>Autorizada em {new Date(authorizedAt).toLocaleString("pt-BR")}. Contatos importados: {importedContacts}. Mensagens históricas: {importedMessages}.</p>
      <p>{requestStatuses.includes("uncertain") || requestStatuses.includes("requested") ? "Solicitação sem confirmação final. Consulte o suporte antes de tentar novamente." : "Solicitação enviada à Meta. A entrega dos dados pode ser parcial."}</p>
      {historyUnavailable ? <p>A Meta informou que o histórico não foi compartilhado. Mensagens novas continuam ativas.</p> : null}
    </div> : <form onSubmit={submit} className="mt-3 max-w-3xl space-y-4 text-sm">
      <p>Opcional e desativada por padrão. A conexão e as mensagens novas não dependem desta importação.</p>
      <p>Você autoriza solicitar à Meta os nomes e números dos contatos e as mensagens históricas disponíveis para esta clínica. A Meta também precisa receber sua autorização no WhatsApp Business App. Contatos importados não viram pacientes automaticamente.</p>
      <p>O histórico fica separado das mensagens novas e não dispara automações, IA, notificações ou respostas. O conteúdo textual respeita a configuração de privacidade da clínica; arquivos de mídia não são baixados.</p>
      <p>A Meta limita a solicitação às primeiras 24 horas após a conexão e pode não disponibilizar o histórico. A solicitação não será repetida automaticamente.</p>
      {!schemaReady ? <p role="status">Importação indisponível até a preparação do banco. A conexão permanece ativa.</p> : null}
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={authorized} disabled={busy || submitted || !schemaReady} onChange={(event) => setAuthorized(event.target.checked)} className="mt-1 shrink-0"/>
        <span>Como owner/admin, autorizo explicitamente a importação dos contatos e histórico disponíveis para esta clínica. Estou ciente do escopo acima e autorizado a tratar esses dados.</span>
      </label>
      <button type="submit" disabled={!authorized || busy || submitted || !schemaReady} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 font-bold text-white disabled:opacity-50">
        {busy ? <LoaderCircle size={18} className="animate-spin"/> : <Download size={18}/>}
        Autorizar e solicitar importação
      </button>
    </form>}
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
  </section>;
}
