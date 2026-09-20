import { registerHooks } from "node:module";

export let supabaseAdmin;
export function setDatabase(db) { supabaseAdmin = db; }

export function installWhatsAppTestHooks() {
  const dataModule = (source) => "data:text/javascript," + encodeURIComponent(source);
  return registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") return { url: dataModule("export {};"), shortCircuit: true };
      if (specifier === "@/lib/supabase/admin") return { url: import.meta.url, shortCircuit: true };
      if (specifier === "./meta/provider") return { url: dataModule("export class MetaCloudProvider { async syncTemplates() { return []; } }"), shortCircuit: true };
      if (specifier === "./broker") return { url: dataModule('export const getMetaConnectOrigin=()=> "https://connect.example.com"; export async function resolveClinicReturnOrigin({requestOrigin}) { return requestOrigin; }'), shortCircuit: true };
      try { return next(specifier, context); } catch (error) {
        if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(specifier + ".js", context);
        throw error;
      }
    },
  });
}

export function memoryDatabase(seed = {}) {
  const tables = structuredClone(seed);
  const calls = [];
  let sequence = 0;
  let failMessage = false;
  return {
    tables, calls,
    failNextMessage() { failMessage = true; },
    from(table) {
      tables[table] ||= [];
      let action = "select", payload, options = {}, returning = false;
      const filters = [];
      const query = {
        select() { returning = true; return query; },
        insert(row) { action = "insert"; payload = row; return query; },
        upsert(row, config = {}) { action = "upsert"; payload = row; options = config; return query; },
        update(row) { action = "update"; payload = row; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        lt(key, value) { filters.push((row) => row[key] < value); return query; },
        or(expression) {
          const clauses = expression.split(",").map((part) => part.split(".eq."));
          filters.push((row) => clauses.some(([key, value]) => row[key] === value));
          return query;
        },
        limit() { return query; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };
      async function execute(single) {
        calls.push({ table, action, payload: structuredClone(payload) });
        const rows = tables[table];
        let matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (action === "insert" || action === "upsert") {
          if (table === "whatsapp_messages" && failMessage) { failMessage = false; return { data: null, error: { code: "08006" } }; }
          const unique = { whatsapp_messages: "meta_message_id", whatsapp_coexistence_imports: "connection_id,phone_number_id", whatsapp_imported_contacts: "connection_id,phone_normalized" };
          const key = unique[table] || options.onConflict;
          const keys = key?.split(",");
          const existing = keys && rows.find((row) => keys.every((column) => row[column] === payload[column]));
          if (existing && action === "insert") return { data: null, error: { code: "23505" } };
          if (existing && options.ignoreDuplicates) matches = [];
          else if (existing) { Object.assign(existing, structuredClone(payload)); matches = [existing]; }
          else {
            const row = { id: "row-" + ++sequence, status: table === "whatsapp_onboarding_sessions" ? "pending" : "received", ...structuredClone(payload) };
            rows.push(row); matches = [row];
          }
        } else if (action === "update") {
          for (const row of matches) Object.assign(row, structuredClone(payload));
        }
        return { data: single ? matches[0] || null : returning ? matches : null, error: null };
      }
      return query;
    },
  };
}

export function graphMock(mode = "cloud_only") {
  const calls = [];
  const client = {
    calls,
    async exchangeEmbeddedSignupCode() { calls.push("exchange"); return { access_token: "temporary-test" }; },
    async debugToken(token) { return { data: { is_valid: true, app_id: "10001", type: token === "temporary-test" ? "BUSINESS" : "SYSTEM_USER", scopes: ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"] } }; },
    async getWaba(id) { return { id }; },
    async listPhoneNumbers() { return { data: [{ id: "50005", display_phone_number: "5511999990000", platform_type: "CLOUD_API" }] }; },
    async getPhoneMode(id) { return { id, is_on_biz_app: mode === "coexistence", platform_type: "CLOUD_API" }; },
    async listSystemUsers() { return { data: [{ id: "30003" }] }; },
    async listClientWabas() { return { data: [{ id: "40004" }] }; },
    async assignSystemUser() { calls.push("assign"); return { success: true }; },
    async listAssignedUsers() { calls.push("assigned"); return { data: [{ id: "30003" }] }; },
    async subscribeApp() { calls.push("subscribe"); return { success: true }; },
    async listSubscribedApps() { return { data: [{ id: "10001" }] }; },
    async registerPhoneNumber() { calls.push("register"); return { success: true }; },
    async listTemplates() { return { data: [] }; },
  };
  return client;
}
