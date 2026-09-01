import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveTrustedAppOrigin } from "../src/lib/security/origin-core.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardActions = source("src/app/dashboard/actions.js");
const usersPage = source("src/app/dashboard/usuarios/page.js");
const asaasWebhook = source("src/app/api/webhooks/asaas/route.js");
const storage = source("src/lib/supabase/storage.js");
const authSession = source("src/lib/auth/session.js");
const clinicActions = source("src/app/dashboard/clinic-actions.js");
const publicBookingActions = source("src/app/c/[slug]/actions.js");
const hardeningMigration = source("supabase/migrations/20260901100000_auth_rpc_security_hardening.sql");

test("origem configurada prevalece sobre Host não confiável", () => {
  assert.equal(resolveTrustedAppOrigin({
    configured: "https://clinicas.nexawi.com.br",
    host: "attacker.example",
    protocol: "https",
    nodeEnv: "production",
  }), "https://clinicas.nexawi.com.br");
});

test("produção ignora Host externo quando a origem não foi configurada", () => {
  assert.equal(resolveTrustedAppOrigin({
    host: "attacker.example",
    protocol: "https",
    nodeEnv: "production",
  }), "https://clinicas.nexawi.com.br");
});

test("desenvolvimento aceita somente origem local", () => {
  assert.equal(resolveTrustedAppOrigin({ host: "localhost:3000", protocol: "http", nodeEnv: "development" }), "http://localhost:3000");
  assert.equal(resolveTrustedAppOrigin({ host: "attacker.example", protocol: "https", nodeEnv: "development" }), "https://clinicas.nexawi.com.br");
});

test("convite preserva a senha global de usuário Auth existente", () => {
  const helper = dashboardActions.slice(
    dashboardActions.indexOf("async function upsertAuthUserWithPassword"),
    dashboardActions.indexOf("function safeHexColor"),
  );
  assert.match(helper, /if \(existing\?\.id\)[\s\S]*return \{ user: existing, existed: true \}/);
  assert.doesNotMatch(helper, /updateUserById/);
  assert.match(usersPage, /A credencial atual foi preservada/);
});

test("somente owner pode conceder ou administrar owner", () => {
  assert.match(dashboardActions, /papel === "owner" && actorMembership\?\.papel !== "owner"/);
  assert.match(dashboardActions, /existing\.papel === "owner" \|\| papel === "owner"/);
  assert.match(hardeningMigration, /case when papel = 'owner'[\s\S]*usuario_owner_clinica/);
});

test("contexto multi-tenant usa somente vínculos do usuário autenticado", () => {
  assert.match(authSession, /item\.user_id === user\.id/);
  assert.match(authSession, /String\(item\.email \|\| ""\).*=== userEmail/);
  assert.match(authSession, /selectedMembership\?\.clinicas \|\| memberships\[0\]/);
  assert.match(clinicActions, /context\.memberships\.some\(\(item\) => item\.clinica_id === clinicId\)/);
  assert.match(hardeningMigration, /create policy "usuarios_select_membros"[\s\S]*user_id = auth\.uid\(\)[\s\S]*usuario_pode_secao_clinica\(clinica_id, 'usuarios'\)/);
});

test("RPCs CRM e workers não permanecem executáveis por anônimo", () => {
  assert.match(hardeningMigration, /auth\.uid\(\) is null or not app_private\.usuario_pode_secao_clinica\(p_clinica_id, 'crm'\)/);
  assert.match(hardeningMigration, /revoke all on function public\.crm_create_opportunity[\s\S]*from public, anon/);
  assert.match(hardeningMigration, /revoke all on function public\.claim_automation_runs[\s\S]*from public, anon, authenticated/);
  assert.match(hardeningMigration, /grant execute on function public\.claim_automation_runs[\s\S]*to service_role/);
});

test("RLS operacional respeita papel e abas personalizadas", () => {
  assert.match(hardeningMigration, /create or replace function app_private\.usuario_pode_secao_clinica/);
  assert.match(hardeningMigration, /uc\.papel = 'financeiro'[\s\S]*'financeiro','assinatura'/);
  assert.match(hardeningMigration, /create policy "agendamentos_crud_membros"[\s\S]*usuario_pode_secao_clinica\(clinica_id, 'agenda'\)/);
  assert.match(hardeningMigration, /create policy "procedimentos_crud_membros"[\s\S]*usuario_pode_secao_clinica\(clinica_id, 'procedimentos'\)/);
  assert.match(hardeningMigration, /drop policy if exists "pagamentos_clinica_crud_financeiro"/);
  assert.match(hardeningMigration, /create policy "pagamentos_clinica_crud_financeiro"[\s\S]*usuario_pode_secao_clinica\(clinica_id, 'financeiro'\)/);
});

test("emissão interna de automações não pode ser chamada por membros", () => {
  assert.match(hardeningMigration, /revoke all on function app_private\.emit_automation_event[\s\S]*from public, anon, authenticated/);
  assert.match(hardeningMigration, /revoke all on function public\.publish_automation_v2[\s\S]*from public, anon/);
});

test("RPCs financeiras não preservam execução implícita anônima", () => {
  assert.match(hardeningMigration, /revoke all on function public\.finance_liquidar_recebivel[\s\S]*from public, anon/);
  assert.match(hardeningMigration, /revoke all on function public\.finance_transferir[\s\S]*from public, anon/);
  assert.match(hardeningMigration, /revoke all on function public\.finance_gerar_recorrencias[\s\S]*from public, anon, authenticated/);
  assert.match(hardeningMigration, /grant execute on function public\.finance_gerar_recorrencias\(date\) to service_role/);
});

test("token Asaas por clínica exige identificação e restringe consultas", () => {
  assert.match(asaasWebhook, /timingSafeEqual/);
  assert.match(asaasWebhook, /safeTokenEquals\(token, expectedToken\)/);
  assert.match(asaasWebhook, /if \(!clinicId\) return null/);
  assert.match(asaasWebhook, /authorization\.global \? null : authorization\.clinicId/);
  assert.match(asaasWebhook, /if \(authorizedClinicId\) query = query\.eq\("clinica_id", authorizedClinicId\)/);
  assert.match(asaasWebhook, /if \(authorizedClinicId\) query = query\.eq\("id", authorizedClinicId\)/);
});

test("baixa financeira deriva vínculos do agendamento validado no tenant", () => {
  assert.match(dashboardActions, /updateAgendamentoFinanceiroAction[\s\S]*getScopedSectionSupabase\("financeiro"\)/);
  assert.match(dashboardActions, /from\("agendamentos"\)[\s\S]*eq\("clinica_id", clinicaId\)[\s\S]*if \(!agendamento\)/);
  assert.match(dashboardActions, /const clienteId = agendamento\.cliente_id/);
  assert.match(dashboardActions, /from\("pagamentos_clinica"\)\.update\(pagamentoPayload\)[\s\S]*eq\("clinica_id", clinicaId\)/);
});

test("estorno de sinal zera o financeiro sem gerar confirmação", () => {
  assert.match(asaasWebhook, /\["cancelado", "estornado"\]\.includes\(paymentStatus\)/);
  assert.match(asaasWebhook, /pagamento_status: "cancelado", valor_pago: 0, data_pagamento: null/);
});

test("fotos privadas só são assinadas dentro do prefixo clínica e paciente", () => {
  assert.match(storage, /const expectedPrefix = clinicaId && clienteId \? `\$\{clinicaId\}\/\$\{clienteId\}\/`/);
  assert.match(storage, /TENANT_PATH_MISMATCH/);
  assert.match(dashboardActions, /await requireScopedClient\(supabase, clinicaId, clienteId/);
});

test("integridade clínica-paciente é aplicada a novos prontuários", () => {
  assert.match(hardeningMigration, /cliente_fotos_clinica_cliente_fk[\s\S]*foreign key \(clinica_id, cliente_id\)[\s\S]*not valid/);
  assert.match(hardeningMigration, /cliente_consentimentos_clinica_cliente_fk[\s\S]*foreign key \(clinica_id, cliente_id\)[\s\S]*not valid/);
});

test("referências financeiras legadas não atravessam tenants", () => {
  assert.match(hardeningMigration, /pagamentos_clinica_cliente_tenant_fk[\s\S]*references public\.clientes\(clinica_id, id\)[\s\S]*not valid/);
  assert.match(hardeningMigration, /pagamentos_clinica_agendamento_tenant_fk[\s\S]*references public\.agendamentos\(clinica_id, id\)[\s\S]*not valid/);
  assert.match(hardeningMigration, /cliente_pacotes_pacote_tenant_fk[\s\S]*references public\.pacotes_clinica\(clinica_id, id\)[\s\S]*not valid/);
});

test("agenda serializa concorrência e bloqueia sobreposição no banco", () => {
  assert.match(hardeningMigration, /create or replace function app_private\.prevent_appointment_overlap/);
  assert.match(hardeningMigration, /pg_advisory_xact_lock/);
  assert.match(hardeningMigration, /a\.inicio < new\.fim[\s\S]*a\.fim > new\.inicio/);
  assert.match(hardeningMigration, /errcode = '23P01'/);
  assert.match(dashboardActions, /error\?\.code === "23P01"/);
  assert.match(publicBookingActions, /agendaError\?\.code === "23P01"/);
});
