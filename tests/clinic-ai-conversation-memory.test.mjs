import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(readFileSync(new URL("../src/app/dashboard/ia/conversation-memory.js", import.meta.url), "utf8"), {
  fileName: "conversation-memory.jsx", compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function store(scopeKey, clock) {
  const exports = {};
  runInNewContext(source, {
    exports, setTimeout, clearTimeout, Date,
    require(specifier) {
      if (specifier === "react") return { createContext: () => null };
      if (specifier === "react/jsx-runtime") return { jsx: () => null };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  return exports.createScopedConversationMemory(scopeKey, clock);
}

test("conversation memory is volatile, limited, and expires without browser storage", () => {
  let time = 0;
  let expire;
  let expirations = 0;
  const memory = store("user-a:clinic-a", { now: () => time, schedule: (callback) => { expire = callback; return 1; }, cancel() {} });
  memory.subscribe(() => { expirations++; });
  memory.save({ days: 7, messages: Array.from({ length: 20 }, (_, id) => ({ id, text: `answer-${id}` })), lastIntent: "agenda" });
  assert.equal(memory.read().messages.length, 12);
  assert.equal(memory.read().messages[0].id, 8);
  assert.equal(memory.read().days, 7);
  time += 20 * 60 * 1000;
  assert.equal(memory.read(), null);
  memory.save({ days: 30, messages: [{ id: 21 }] });
  expire();
  assert.equal(memory.read(), null);
  assert.equal(expirations, 1);
});

test("new conversation, logout, and scope replacement discard the only in-memory copy", () => {
  const memory = store("user-a:clinic-a", { schedule: () => 1, cancel() {} });
  memory.save({ days: 30, messages: [{ id: 1, text: "private" }] });
  assert.ok(memory.read());
  memory.clear();
  assert.equal(memory.read(), null);
  const other = store("user-b:clinic-b", { schedule: () => 1, cancel() {} });
  assert.equal(other.read(), null);
});

test("dashboard provider drops the snapshot when the authenticated layout unmounts", () => {
  let cleanup;
  const exports = {};
  runInNewContext(source, {
    exports, setTimeout, clearTimeout, Date,
    require(specifier) {
      if (specifier === "react") return {
        createContext: () => ({ Provider: "Provider" }),
        useMemo: (factory) => factory(),
        useEffect: (effect) => { cleanup = effect(); },
      };
      if (specifier === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  const provider = exports.ClinicAiConversationProvider({ scopeKey: "user-a:clinic-a", children: null });
  const memory = provider.props.value;
  memory.save({ days: 30, messages: [{ id: 1, text: "private" }] });
  assert.ok(memory.read());
  cleanup();
  assert.equal(memory.read(), null);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
