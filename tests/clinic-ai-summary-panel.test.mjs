import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const panelSource = transpile("../src/app/dashboard/ia/summary-panel.js");
const pageSource = transpile("../src/app/dashboard/ia/page.js");

function transpile(path) {
  const file = new URL(path, import.meta.url);
  return ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file.pathname,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name) { for (const listener of listeners.get(name) || []) listener(); },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(title = "Resumo da clínica") {
  return {
    analysis: { title, executiveSummary: "Dados sintéticos", highlights: [], alerts: [], opportunities: [], recommendedActions: [] },
    sources: ["fixture"], period: { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z", timezone: "UTC" },
    generatedAt: "2026-11-01T00:00:00Z",
  };
}

function load(source, modules, globals = {}) {
  const exports = {};
  runInNewContext(source, {
    exports,
    require(specifier) {
      if (!(specifier in modules)) throw new Error(`Unexpected import: ${specifier}`);
      return modules[specifier];
    },
    ...globals,
  });
  return exports;
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return content(tree.props?.children);
}

function createPanel(scopeKey = "user-a:clinic-a") {
  const document = { ...eventTarget(), hidden: false };
  const window = eventTarget();
  const requests = [];
  const hooks = [];
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let postUnmountUpdates = 0;
  let tree;
  let currentScope = scopeKey;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });

  const react = {
    useCallback(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((value, i) => value !== hooks[index].deps[i])) {
        hooks[index] = { kind: "callback", value: callback, deps };
      }
      return hooks[index].value;
    },
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { kind: "state", value: initial };
      return [hooks[index].value, (value) => {
        if (!mounted) { postUnmountUpdates++; return; }
        hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value;
        dirty = true;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { kind: "ref", value: { current: initial } };
      return hooks[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { kind: "effect", deps: null, cleanup: null };
      const hook = hooks[index];
      if (!hook.deps || deps.some((value, i) => value !== hook.deps[i])) hook.pending = { effect, deps };
    },
  };
  const { ClinicSummaryPanel } = load(panelSource, {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": Object.fromEntries(["AlertTriangle", "ArrowUpRight", "Lightbulb", "Sparkles"].map((name) => [name, name])),
  }, {
    document, window, AbortController,
    fetch: (url, options) => {
      const pending = deferred();
      requests.push({ url, options, pending });
      return pending.promise;
    },
  });

  function render(scope = currentScope) {
    currentScope = scope;
    do {
      dirty = false;
      cursor = 0;
      tree = ClinicSummaryPanel({ scopeKey: currentScope });
      for (const hook of hooks) {
        if (hook?.pending) {
          hook.cleanup?.();
          const { effect, deps } = hook.pending;
          hook.pending = null;
          hook.deps = deps;
          hook.cleanup = effect();
        }
      }
    } while (dirty);
    return tree;
  }

  function button(label) {
    const match = nodes(tree, (node) => node.type === "button" && content(node).includes(label))[0];
    assert.ok(match, `button ${label} exists`);
    return match;
  }

  function unmount() {
    mounted = false;
    for (const hook of hooks) if (hook?.kind === "effect") hook.cleanup?.();
  }

  render();
  return {
    button, document, window, requests, render, unmount,
    get text() { return content(tree); },
    get postUnmountUpdates() { return postUnmountUpdates; },
  };
}

async function finish(panel, index, status = 200, payload = fixture()) {
  panel.requests[index].pending.resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
  await new Promise((resolve) => setImmediate(resolve));
  panel.render();
}

async function success(panel, title = "Resumo da clínica") {
  const index = panel.requests.length;
  const action = panel.button("Gerar resumo").props.onClick();
  await finish(panel, index, 200, fixture(title));
  await action;
}

test("summary renders after one manual generation and clears immediately on a new attempt", async () => {
  const panel = createPanel();
  assert.equal(panel.requests.length, 0);
  await success(panel);
  assert.match(panel.text, /Resumo da clínica/);
  const action = panel.button("Atualizar análise").props.onClick();
  panel.render();
  assert.doesNotMatch(panel.text, /Resumo da clínica/);
  assert.equal(panel.requests.length, 2);
  assert.equal(panel.requests[1].url, "/api/ai/summary");
  assert.equal(panel.requests[1].options.cache, "no-store");
  assert.equal(JSON.parse(panel.requests[1].options.body).days, 30);
  await finish(panel, 1);
  await action;
  panel.unmount();
});

for (const status of [401, 403, 503]) {
  test(`prior summary stays cleared after HTTP ${status}`, async () => {
    const panel = createPanel();
    await success(panel);
    const action = panel.button("Atualizar análise").props.onClick();
    panel.render();
    await finish(panel, 1, status, { error: status === 403 ? "AI_FORBIDDEN" : "AI_UNAVAILABLE" });
    await action;
    assert.doesNotMatch(panel.text, /Resumo da clínica/);
    assert.match(panel.text, status === 403 ? /Acesso negado/ : /Não foi possível gerar/);
    panel.unmount();
  });
}

test("network and malformed responses clear the prior summary without leaking error details", async () => {
  const panel = createPanel();
  await success(panel);
  const action = panel.button("Atualizar análise").props.onClick();
  panel.requests[1].pending.reject(new Error("private-network-detail"));
  await action;
  panel.render();
  assert.doesNotMatch(panel.text, /Resumo da clínica|private-network-detail/);
  assert.match(panel.text, /Não foi possível gerar/);
  const next = panel.button("Gerar resumo").props.onClick();
  panel.requests[2].pending.resolve({ ok: true, json: async () => { throw new Error("malformed JSON detail"); } });
  await next;
  panel.render();
  assert.doesNotMatch(panel.text, /malformed JSON detail|Resumo da clínica/);
  const validation = panel.button("Gerar resumo").props.onClick();
  await finish(panel, 3, 422, { error: "AI_INVALID_PERIOD" });
  await validation;
  assert.match(panel.text, /Selecione um período válido/);
  const partial = panel.button("Gerar resumo").props.onClick();
  await finish(panel, 4, 200, { analysis: { title: "PARTIAL_SUMMARY" } });
  await partial;
  assert.doesNotMatch(panel.text, /PARTIAL_SUMMARY|Resumo da clínica/);
  assert.match(panel.text, /Não foi possível gerar/);
  panel.unmount();
});

test("rapid repeated submit starts only one request", async () => {
  const panel = createPanel();
  const submit = panel.button("Gerar resumo").props.onClick;
  const first = submit();
  const second = submit();
  assert.equal(panel.requests.length, 1);
  await finish(panel, 0);
  await Promise.all([first, second]);
  panel.unmount();
});

test("period change clears result and a new manual generation uses the selected period", async () => {
  const panel = createPanel();
  await success(panel);
  panel.button("7 dias").props.onClick();
  panel.render();
  assert.doesNotMatch(panel.text, /Resumo da clínica/);
  assert.equal(panel.requests.length, 1);
  const action = panel.button("Gerar resumo").props.onClick();
  assert.equal(JSON.parse(panel.requests[1].options.body).days, 7);
  await finish(panel, 1);
  await action;
  assert.match(panel.text, /Resumo da clínica/);
  panel.unmount();
});

for (const [label, nextScope] of [["clinic", "user-a:clinic-b"], ["user", "user-b:clinic-a"]]) {
  test(`${label} scope change invalidates result and late response`, async () => {
    const panel = createPanel();
    await success(panel, "OLD_TENANT_RESULT");
    const action = panel.button("Atualizar análise").props.onClick();
    panel.render(nextScope);
    assert.doesNotMatch(panel.text, /OLD_TENANT_RESULT/);
    assert.equal(panel.requests[1].options.signal.aborted, true);
    await finish(panel, 1, 200, fixture("LATE_OLD_TENANT_RESULT"));
    await action;
    assert.doesNotMatch(panel.text, /LATE_OLD_TENANT_RESULT/);
    const retry = panel.button("Gerar resumo").props.onClick();
    await finish(panel, 2, 200, fixture("NEW_SCOPE_RESULT"));
    await retry;
    assert.match(panel.text, /NEW_SCOPE_RESULT/);
    panel.unmount();
  });
}

test("returning to a prior scope never resurrects its old result", async () => {
  const panel = createPanel();
  await success(panel, "OLD_SCOPE_RESULT");
  panel.render("user-a:clinic-b");
  panel.render("user-a:clinic-a");
  assert.doesNotMatch(panel.text, /OLD_SCOPE_RESULT/);
  assert.equal(panel.requests.length, 1);
  panel.unmount();
});

test("unmount aborts a pending request and ignores its late response", async () => {
  const panel = createPanel();
  const action = panel.button("Gerar resumo").props.onClick();
  panel.unmount();
  assert.equal(panel.requests[0].options.signal.aborted, true);
  await finish(panel, 0, 200, fixture("LATE_RESULT"));
  await action;
  assert.equal(panel.postUnmountUpdates, 0);
});

for (const event of ["visibilitychange", "pagehide", "pageshow", "blur"]) {
  test(`${event} invalidates the summary and does not auto-generate`, async () => {
    const panel = createPanel();
    await success(panel);
    if (event === "visibilitychange") panel.document.hidden = true;
    (event === "visibilitychange" ? panel.document : panel.window).dispatch(event);
    panel.render();
    assert.doesNotMatch(panel.text, /Resumo da clínica/);
    assert.equal(panel.requests.length, 1);
    panel.unmount();
  });
}

test("the server page keys the panel by authenticated user and resolved clinic", async () => {
  let userId = "user-a";
  let clinicId = "clinic-a";
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const Workspace = () => null;
  const { default: page } = load(pageSource, {
    "node:crypto": require("node:crypto"),
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/auth/session": {
      requireClinic: async () => ({ user: { id: userId } }),
      resolveClinicPlanEntitlements: async () => ({ id: clinicId }),
    },
    "@/lib/ai/access.mjs": { canUseClinicAi: () => true },
    "@/components/app-shell/ui": { PageHeader: () => null },
    "./ai-workspace": { AiWorkspace: Workspace },
    "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  const scope = async () => nodes(await page(), (node) => node.type === Workspace)[0];
  const first = await scope();
  assert.equal(first.key, first.props.scopeKey);
  assert.doesNotMatch(first.key, /user-a|clinic-a/);
  clinicId = "clinic-b";
  const otherClinic = await scope();
  assert.notEqual(otherClinic.key, first.key);
  userId = "user-b";
  const otherUser = await scope();
  assert.notEqual(otherUser.key, otherClinic.key);
});
