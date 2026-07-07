import { Globe2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { requireInternalAdmin } from "@/lib/auth/session";
import { getMarketingHomeConfig } from "@/lib/marketing/home-config";
import { parseInternalAdminEmails } from "@/lib/saas/plans";
import { updateInternalAdminCredentialsAction, updateMarketingHomeHeroAction } from "../actions";

export const metadata = { title: "Configurações admin | NexaWi Clínicas" };

function AdminInput({ label, name, type = "text", defaultValue = "", placeholder = "", autoComplete = "off", readOnly = false }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-neutral-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-[#ed7009] focus:ring-4 focus:ring-orange-100 read-only:bg-neutral-50 read-only:text-neutral-500"
      />
    </label>
  );
}

function AdminTextarea({ label, name, defaultValue = "", placeholder = "", rows = 4 }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-neutral-700">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#ed7009] focus:ring-4 focus:ring-orange-100"
      />
    </label>
  );
}

export default async function AdminConfiguracoesPage({ searchParams }) {
  const user = await requireInternalAdmin();
  const params = await searchParams;
  const allowedEmails = parseInternalAdminEmails();
  const { hero } = await getMarketingHomeConfig();
  const savedCredentials = params?.ok === "credenciais";
  const savedHome = params?.ok === "home";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#1c1c1c] p-7 text-white shadow-[0_30px_100px_rgba(28,28,28,0.24)] lg:p-9">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(237,112,9,0.34),transparent_24rem),radial-gradient(circle_at_90%_0%,rgba(255,255,255,0.12),transparent_24rem)]" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Admin interno</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Configurações do admin</h1>
          <p className="mt-4 text-sm leading-7 text-white/68">
            Gerencie o acesso interno do SaaS e o conteúdo comercial da NexaWi Clínicas sem misturar com a área das clínicas.
          </p>
        </div>
      </section>

      {savedCredentials ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Credenciais administrativas atualizadas.
        </div>
      ) : null}

      {savedHome ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Home comercial atualizada.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <form action={updateInternalAdminCredentialsAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#ed7009]">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black">Login e senha</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">Defina uma nova senha ou informe um novo e-mail de login para o administrador atual.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <AdminInput label="E-mail atual" name="current_email" type="email" defaultValue={user.email || ""} autoComplete="email" readOnly />
            <AdminInput label="Novo e-mail de login (opcional)" name="new_email" type="email" placeholder="Preencha somente se quiser trocar o e-mail" autoComplete="email" />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminInput label="Nova senha" name="password" type="password" placeholder="Mínimo de 8 caracteres" autoComplete="new-password" />
              <AdminInput label="Confirmar nova senha" name="password_confirm" type="password" placeholder="Repita a nova senha" autoComplete="new-password" />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Ao trocar o e-mail, o sistema mantém este usuário marcado como administrador interno no Supabase Auth. Use um e-mail válido e que você controle.
          </div>

          <button type="submit" className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[#ed7009] px-6 text-sm font-black text-white shadow-[0_18px_45px_rgba(237,112,9,0.28)] transition hover:-translate-y-0.5 hover:bg-[#cf5f07]">
            Salvar credenciais
          </button>
        </form>

        <aside className="space-y-4">
          <article className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <ShieldCheck size={22} className="text-[#ed7009]" />
            <h2 className="mt-4 text-lg font-black">Conta atual</h2>
            <p className="mt-2 text-sm font-semibold text-neutral-500">Usuário autenticado como administrador interno.</p>
            <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">E-mail</p>
              <p className="mt-1 break-all text-sm font-black text-neutral-800">{user.email}</p>
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <Mail size={22} className="text-[#ed7009]" />
            <h2 className="mt-4 text-lg font-black">Admins globais</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">Lista de fallback configurada no ambiente. O admin atual também pode ser autorizado pelo próprio Supabase Auth.</p>
            <div className="mt-4 space-y-2">
              {allowedEmails.length ? (
                allowedEmails.map((email) => (
                  <p key={email} className="rounded-2xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-700">
                    {email}
                  </p>
                ))
              ) : (
                <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Nenhum e-mail configurado.</p>
              )}
            </div>
          </article>
        </aside>
      </div>

      <form action={updateMarketingHomeHeroAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#ed7009]">
            <Globe2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black">Home comercial</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">Edite a primeira seção do site de vendas da NexaWi Clínicas sem alterar o código. A lateral direita usa uma imagem real em PNG ou JPEG.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <AdminInput label="Texto do topo" name="hero_eyebrow" defaultValue={hero.eyebrow} />
          <AdminTextarea label="Título principal" name="hero_title" defaultValue={hero.title} rows={3} />
          <AdminTextarea label="Subtítulo" name="hero_subtitle" defaultValue={hero.subtitle} rows={3} />
          <AdminInput label="Texto do botão principal" name="hero_primary_cta_label" defaultValue={hero.primaryCtaLabel} />
          <AdminInput label="Texto do botão secundário" name="hero_secondary_cta_label" defaultValue={hero.secondaryCtaLabel} />
          <div className="lg:col-span-2">
            <span className="text-sm font-bold text-neutral-700">Imagem real da demonstração</span>
            <div className="mt-2 grid gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 lg:grid-cols-[1fr_1.2fr]">
              <input
                name="hero_preview_image_file"
                type="file"
                accept="image/png,image/jpeg"
                className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-[#ed7009] file:px-4 file:py-2 file:text-xs file:font-black file:text-white"
              />
              <AdminInput label="URL atual ou alternativa" name="hero_preview_image_url" defaultValue={hero.previewImageUrl} placeholder="/clinic-dashboard-preview.png ou https://..." />
            </div>
            <p className="mt-2 text-xs font-semibold text-neutral-500">Envie uma imagem PNG ou JPEG de até 20 MB. Se não enviar arquivo, o sistema mantém a URL atual.</p>
          </div>
          <AdminInput label="Texto alternativo da imagem" name="hero_preview_image_alt" defaultValue={hero.previewImageAlt} />
        </div>

        <div className="mt-6">
          <AdminTextarea
            label="Tópicos da hero"
            name="hero_topics"
            defaultValue={hero.topics.join("\n")}
            placeholder="Um tópico por linha"
            rows={6}
          />
          <p className="mt-2 text-xs font-semibold text-neutral-500">Use uma linha para cada tópico. O site exibe até 6 tópicos.</p>
        </div>

        <button type="submit" className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[#ed7009] px-6 text-sm font-black text-white shadow-[0_18px_45px_rgba(237,112,9,0.28)] transition hover:-translate-y-0.5 hover:bg-[#cf5f07]">
          Salvar home comercial
        </button>
      </form>
    </div>
  );
}
