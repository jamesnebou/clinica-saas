import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(readFileSync(new URL("../src/app/dashboard/ia/ai-workspace.js", import.meta.url), "utf8"), {
  fileName: "ai-workspace.jsx", compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("chat is the primary tab and the existing summary remains available without automatic generation", () => {
  let tab = "chat";
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const Chat = () => null;
  const Summary = () => null;
  const exports = {};
  runInNewContext(source, {
    exports,
    require(specifier) {
      if (specifier === "react") return { useState: () => [tab, (value) => { tab = value; }] };
      if (specifier === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (specifier === "lucide-react") return { MessageCircle: "MessageCircle", Sparkles: "Sparkles" };
      if (specifier === "./chat-panel") return { ClinicChatPanel: Chat };
      if (specifier === "./summary-panel") return { ClinicSummaryPanel: Summary };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
    : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
  const first = nodes(exports.AiWorkspace({ scopeKey: "scope-a" }));
  assert.equal(first.filter((node) => node.type === Chat).length, 1);
  assert.equal(first.filter((node) => node.type === Summary).length, 0);
  const tabs = first.filter((node) => node.props?.role === "tab");
  assert.equal(tabs[0].props["aria-selected"], true);
  assert.equal(tabs[1].props["aria-selected"], false);
  tabs[1].props.onClick();
  const second = nodes(exports.AiWorkspace({ scopeKey: "scope-a" }));
  assert.equal(second.filter((node) => node.type === Summary).length, 1);
  assert.equal(second.filter((node) => node.type === Chat).length, 1);
  assert.equal(second.find((node) => node.props?.id === "ai-chat-panel").props.hidden, true);
  assert.equal(second.find((node) => node.type === Summary).props.scopeKey, "scope-a");
});

test("dashboard AI entry is shared by desktop and mobile and gated server-side", () => {
  const layout = readFileSync(new URL("../src/app/dashboard/layout.js", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../src/components/app-shell/sidebar-nav.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/app/dashboard/page.js", import.meta.url), "utf8");
  assert.match(layout, /href: "\/dashboard\/ia", label: "NexaWi IA", icon: "ai"/);
  assert.match(layout, /!item\.aiOnly \|\| canUseClinicAi\(context\)/);
  assert.match(nav, /export function SidebarNav/);
  assert.match(nav, /export function MobileSidebarMenu/);
  assert.match(nav, /ai: Sparkles/);
  assert.match(dashboard, /Conversar com NexaWi IA/);
  assert.doesNotMatch(dashboard, />Gerar análise<\/Link>/);
});
