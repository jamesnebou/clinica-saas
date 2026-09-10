import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardActionsPath = new URL("../src/app/dashboard/actions.js", import.meta.url);
const agendaPagePath = new URL("../src/app/dashboard/agenda/page.js", import.meta.url);
const sidebarPath = new URL("../src/components/app-shell/sidebar-nav.js", import.meta.url);
const bookingFormPath = new URL("../src/app/c/[slug]/booking-form.js", import.meta.url);
const publicActionsPath = new URL("../src/app/c/[slug]/actions.js", import.meta.url);
const directBookingPagePath = new URL("../src/app/c/[slug]/agendamento/page.js", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260909100000_agenda_safe_delete.sql", import.meta.url);

test("exclusão de agendamento usa RPC atômica e retorna feedback na agenda", async () => {
  const [actions, agendaPage, migration] = await Promise.all([
    readFile(dashboardActionsPath, "utf8"),
    readFile(agendaPagePath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);
  const deleteAction = actions.slice(actions.indexOf("export async function deleteAgendamentoAction"), actions.indexOf("export async function updateClienteFichaAction"));

  assert.match(deleteAction, /rpc\("agenda_excluir_agendamento_v2"/);
  assert.doesNotMatch(deleteAction, /from\("agendamentos"\)\.delete/);
  assert.match(deleteAction, /redirectAgendaError/);
  assert.match(agendaPage, /successMessage/);
  assert.match(migration, /security definer/);
  assert.match(migration, /usuario_pode_secao_clinica\(p_clinica_id, 'agenda'\)/);
  assert.match(migration, /site_agendamentos_publicos[\s\S]*devem ser cancelados/);
  assert.match(migration, /finance_liquidacoes/);
  assert.match(migration, /movimentação financeira não podem ser excluídos/);
  assert.ok(migration.indexOf("delete from public.finance_recebiveis") < migration.indexOf("delete from public.agendamentos"));
});

test("menu mobile bloqueia o fundo e mantém navegação rolável", async () => {
  const source = await readFile(sidebarPath, "utf8");
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /h-\[100dvh\]/);
  assert.match(source, /min-h-0 flex-1[^"]*overflow-y-auto[^"]*overscroll-contain/);
  assert.match(source, /WebkitOverflowScrolling: "touch"/);
});

test("página direta reutiliza o formulário e preserva retorno em agendamento", async () => {
  const [page, form, actions] = await Promise.all([
    readFile(directBookingPagePath, "utf8"),
    readFile(bookingFormPath, "utf8"),
    readFile(publicActionsPath, "utf8"),
  ]);

  assert.match(page, /<PublicBookingForm/);
  assert.match(page, /returnTo="agendamento"/);
  assert.match(page, /PublicAnalyticsTracker/);
  assert.match(page, /hero_image_url/);
  assert.match(form, /name="return_to"/);
  assert.match(actions, /returnTo === "agendamento" \? `\/c\/\$\{slug\}\/agendamento`/);
  assert.match(actions, /revalidatePath\(`\/c\/\$\{slug\}\/agendamento`\)/);
});
