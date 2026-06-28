import { ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { Card, EmptyClinicState, EmptyState, Field, LimitNotice, Notice, PageHeader, SectionTitle, SelectField, SubmitButton } from "@/components/app-shell/ui";
import { getClinicPlan, getClinicUsage } from "@/lib/saas/plans";
import { inviteClinicUserAction, updateClinicUserAction } from "../actions";
import { ACCESS_SECTION_LABELS, ROLE_ACCESS } from "@/lib/auth/permissions";

export const metadata = { title: "Usuarios | Clinica SaaS" };

const roles = [
  ["owner", "Owner"],
  ["admin", "Admin"],
  ["recepcao", "Recepcao"],
  ["financeiro", "Financeiro"],
  ["profissional", "Profissional"],
];

function selectedSections(usuario) {
  const custom = usuario?.permissoes?.secoes;
  if (Array.isArray(custom) && custom.length) return custom;
  return ROLE_ACCESS[usuario?.papel] || [];
}

export default async function UsuariosPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("usuarios");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const [{ data: usuarios = [] }, plan, usage] = await Promise.all([
    supabase
      .from("usuarios_clinica")
      .select("id, nome, email, papel, ativo, permissoes, invited_at, accepted_at, created_at")
      .eq("clinica_id", activeClinic.id)
      .order("created_at", { ascending: true }),
    getClinicPlan(activeClinic),
    getClinicUsage(activeClinic.id),
  ]);

  const remaining = Math.max(0, Number(plan.limite_usuarios || 0) - Number(usage.usuarios || 0));

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Acesso" title="Usuarios da clinica" description="Convide pessoas da equipe, defina papeis e controle usuarios ativos dentro do limite do plano." />

        <div className="mt-6 space-y-3">
          {params?.ok === "convite" ? <Notice type="success">Usuario criado no Auth e vinculado a clinica. Envie manualmente o e-mail e a senha temporaria para ele acessar em `/login-cliente`.</Notice> : null}
          {params?.ok === "senha" ? <Notice type="success">O usuario ja existia no Auth. A senha temporaria foi atualizada e o vinculo com a clinica foi criado/reativado.</Notice> : null}
          {params?.ok === "usuario" ? <Notice type="success">Usuario atualizado com sucesso.</Notice> : null}
          {params?.erro === "limite" ? <LimitNotice resource="usuarios" message={params?.mensagem} /> : null}
          {params?.erro && params?.erro !== "limite" ? <Notice type="warning">{params?.mensagem || "Nao foi possivel concluir esta acao."}</Notice> : null}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card>
            <SectionTitle icon={UserPlus} title="Convidar usuario" description={`Usuarios ativos: ${usage.usuarios}/${plan.limite_usuarios}. Restam ${remaining} no plano ${plan.nome}. O sistema cria o acesso direto; nao depende de e-mail automatico.`} />
            <form action={inviteClinicUserAction} className="mt-4 space-y-4">
              <Field label="Nome" name="nome" />
              <Field label="E-mail" name="email" type="email" required />
              <Field label="Senha temporaria" name="senha_temporaria" type="password" required placeholder="Minimo recomendado: 8 caracteres" />
              <SelectField label="Papel" name="papel" defaultValue="recepcao">
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              <SubmitButton>Convidar usuario</SubmitButton>
            </form>
          </Card>

          <Card>
            <SectionTitle icon={UsersRound} title="Equipe com acesso" />
            <div className="mt-4 space-y-3">
              {usuarios.length === 0 ? (
                <EmptyState title="Nenhum usuario cadastrado" description="Convide os usuarios que vao operar agenda, financeiro e cadastros da clinica." />
              ) : usuarios.map((usuario) => (
                <form key={usuario.id} action={updateClinicUserAction} className="rounded-lg border border-neutral-200 p-4">
                  <input type="hidden" name="id" value={usuario.id} />
                  <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_160px_130px] xl:items-end">
                    <Field label="Nome" name="nome" defaultValue={usuario.nome || ""} />
                    <div>
                      <p className="text-sm font-medium text-neutral-700">E-mail</p>
                      <p className="mt-2 min-h-11 break-all rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3 text-sm text-neutral-600">{usuario.email}</p>
                    </div>
                    <SelectField label="Papel" name="papel" defaultValue={usuario.papel}>
                      {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </SelectField>
                    <SelectField label="Status" name="ativo" defaultValue={usuario.ativo ? "true" : "false"}>
                      <option value="true">Ativo</option>
                      <option value="false">Desativado</option>
                    </SelectField>
                  </div>
                  <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                    <p className="text-sm font-bold text-neutral-800">Abas permitidas</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ACCESS_SECTION_LABELS.map(([section, label]) => (
                        <label key={section} className="inline-flex items-center gap-2 text-sm text-neutral-700">
                          <input
                            type="checkbox"
                            name="secoes_permitidas"
                            value={section}
                            defaultChecked={selectedSections(usuario).includes(section)}
                            disabled={usuario.papel === "owner"}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-xs text-neutral-500"><ShieldCheck size={14} /> {usuario.accepted_at ? "Acesso criado no Auth" : "Vinculo pendente de login/Auth"}</p>
                    <SubmitButton>Salvar usuario</SubmitButton>
                  </div>
                </form>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
