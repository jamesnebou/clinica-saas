import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(readFileSync(new URL("../src/app/dashboard/ia/chat-panel.js", import.meta.url), "utf8"), {
  fileName: "chat-panel.jsx", compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function target() {
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

function children(node) {
  if (Array.isArray(node)) return node.flatMap(children);
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return children(node.type(node.props));
  return [node, ...children(node.props?.children)];
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function") return text(node.type(node.props));
  return text(node.props?.children);
}

function createChat(scopeKey = "user-a:clinic-a") {
  const document = { ...target(), hidden: false };
  const window = target();
  const requests = [];
  const hooks = [];
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let updatesAfterUnmount = 0;
  let tree;
  let currentScope = scopeKey;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const react = {
    useCallback(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((value, i) => value !== hooks[index].deps[i])) hooks[index] = { kind: "callback", value: callback, deps };
      return hooks[index].value;
    },
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { kind: "state", value: initial };
      return [hooks[index].value, (value) => {
        if (!mounted) { updatesAfterUnmount++; return; }
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
  const exports = {};
  runInNewContext(source, {
    exports, document, window, AbortController, Intl,
    fetch: (url, options) => { const pending = deferred(); requests.push({ url, options, pending }); return pending.promise; },
    require(specifier) {
      if (specifier === "react") return react;
      if (specifier === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (specifier === "lucide-react") return Object.fromEntries(["ArrowUp", "Bot", "LoaderCircle", "RotateCcw", "Sparkles"].map((name) => [name, name]));
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  function render(scope = currentScope) {
    currentScope = scope;
    do {
      dirty = false;
      cursor = 0;
      tree = exports.ClinicChatPanel({ scopeKey: currentScope });
      for (const hook of hooks) if (hook?.pending) {
        hook.cleanup?.();
        const { effect, deps } = hook.pending;
        hook.pending = null;
        hook.deps = deps;
        hook.cleanup = effect();
      }
    } while (dirty);
    return tree;
  }
  function find(predicate) {
    const match = children(tree).find(predicate);
    assert.ok(match, "expected UI element exists");
    return match;
  }
  function button(label) { return find((node) => node.type === "button" && (text(node).includes(label) || node.props?.["aria-label"] === label)); }
  function unmount() { mounted = false; for (const hook of hooks) if (hook?.kind === "effect") hook.cleanup?.(); }
  render();
  return { render, find, button, unmount, document, window, requests,
    get text() { return text(tree); }, get updatesAfterUnmount() { return updatesAfterUnmount; } };
}

async function finish(chat, index, body, status = 200) {
  chat.requests[index].pending.resolve({ ok: status >= 200 && status < 300, json: async () => body });
  await new Promise((resolve) => setImmediate(resolve));
  chat.render();
}

const analysis = { type: "analysis", intent: "agenda", lastIntent: "agenda", confirmed: [{ label: "Agendamentos", value: 12, kind: "count" }],
  interpretation: "Acompanhe a agenda.", nextSteps: ["Revisar horários disponíveis."] };

test("suggestion sends manually, renders confirmed metrics and keeps temporary history for follow-up", async () => {
  const chat = createChat();
  assert.equal(chat.requests.length, 0);
  const first = chat.button("Analisar meus agendamentos").props.onClick();
  assert.equal(chat.requests.length, 1);
  assert.equal(chat.requests[0].url, "/api/ai/chat");
  assert.equal(JSON.parse(chat.requests[0].options.body).lastIntent, null);
  await finish(chat, 0, analysis);
  await first;
  assert.match(chat.text, /Agendamentos12/);
  assert.match(chat.text, /Acompanhe a agenda/);
  const textarea = chat.find((node) => node.type === "textarea");
  textarea.props.onChange({ target: { value: "Explique melhor essa tendência" } });
  chat.render();
  let prevented = false;
  chat.find((node) => node.type === "textarea").props.onKeyDown({ key: "Enter", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(chat.requests.length, 1);
  assert.equal(prevented, false);
  const second = chat.find((node) => node.type === "textarea").props.onKeyDown({ key: "Enter", shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(chat.requests.length, 2);
  assert.equal(JSON.parse(chat.requests[1].options.body).lastIntent, "agenda");
  await finish(chat, 1, { ...analysis, interpretation: "Detalhamento limitado à agenda." });
  await second;
  assert.match(chat.text, /Detalhamento limitado à agenda/);
  assert.match(chat.text, /Analisar meus agendamentos/);
  chat.unmount();
});

test("new conversation and period change clear history without automatic generation", async () => {
  const chat = createChat();
  const action = chat.button("Analisar meus agendamentos").props.onClick();
  await finish(chat, 0, analysis);
  await action;
  chat.button("Nova conversa").props.onClick();
  chat.render();
  assert.doesNotMatch(chat.text, /Acompanhe a agenda/);
  assert.equal(chat.requests.length, 1);
  chat.button("7 dias").props.onClick();
  chat.render();
  assert.equal(chat.requests.length, 1);
  const next = chat.button("Analisar meus agendamentos").props.onClick();
  const sent = JSON.parse(chat.requests[1].options.body);
  assert.equal(sent.days, 7);
  assert.equal(sent.lastIntent, null);
  await finish(chat, 1, analysis);
  await next;
  chat.unmount();
});

test("authorization failure, network failure and partial response clear all prior content", async () => {
  for (const failure of [401, 403, 503, "network", "partial"]) {
    const chat = createChat();
    const first = chat.button("Analisar meus agendamentos").props.onClick();
    await finish(chat, 0, analysis);
    await first;
    chat.find((node) => node.type === "textarea").props.onChange({ target: { value: "Como vai a agenda?" } });
    chat.render();
    const retry = chat.button("Enviar pergunta").props.onClick();
    if (failure === "network") chat.requests[1].pending.reject(new Error("private-network-detail"));
    else await finish(chat, 1, failure === "partial" ? { type: "analysis", confirmed: [] } : { error: failure === 403 ? "AI_FORBIDDEN" : "AI_UNAVAILABLE" }, failure === "partial" ? 200 : failure);
    await retry;
    chat.render();
    assert.doesNotMatch(chat.text, /Acompanhe a agenda|private-network-detail/);
    assert.match(chat.text, failure === 403 ? /Sua sessão ou permissão mudou/ : /Não foi possível responder/);
    chat.unmount();
  }
});

test("scope changes and stale responses cannot restore another tenant's messages", async () => {
  const chat = createChat();
  const first = chat.button("Analisar meus agendamentos").props.onClick();
  await finish(chat, 0, analysis);
  await first;
  chat.find((node) => node.type === "textarea").props.onChange({ target: { value: "Explique melhor" } });
  chat.render();
  const pending = chat.button("Enviar pergunta").props.onClick();
  chat.render("user-a:clinic-b");
  assert.doesNotMatch(chat.text, /Acompanhe a agenda/);
  assert.equal(chat.requests[1].options.signal.aborted, true);
  await finish(chat, 1, { ...analysis, interpretation: "LATE_OLD_TENANT" });
  await pending;
  assert.doesNotMatch(chat.text, /LATE_OLD_TENANT/);
  chat.render("user-b:clinic-b");
  chat.render("user-a:clinic-a");
  assert.doesNotMatch(chat.text, /Acompanhe a agenda/);
  chat.unmount();
});

test("unmount and page lifecycle abort requests and clear visible conversation", async () => {
  for (const event of ["visibilitychange", "pagehide", "pageshow", "blur"]) {
    const chat = createChat();
    const action = chat.button("Analisar meus agendamentos").props.onClick();
    await finish(chat, 0, analysis);
    await action;
    if (event === "visibilitychange") chat.document.hidden = true;
    (event === "visibilitychange" ? chat.document : chat.window).dispatch(event);
    chat.render();
    assert.doesNotMatch(chat.text, /Acompanhe a agenda/);
    assert.equal(chat.requests.length, 1);
    chat.unmount();
  }
  const chat = createChat();
  const pending = chat.button("Analisar meus agendamentos").props.onClick();
  chat.unmount();
  assert.equal(chat.requests[0].options.signal.aborted, true);
  await finish(chat, 0, analysis);
  await pending;
  assert.equal(chat.updatesAfterUnmount, 0);
});

test("rapid duplicate send starts only one request", async () => {
  const chat = createChat();
  const send = chat.button("Analisar meus agendamentos").props.onClick;
  const first = send();
  const second = send();
  assert.equal(chat.requests.length, 1);
  await finish(chat, 0, analysis);
  await Promise.all([first, second]);
  chat.unmount();
});
