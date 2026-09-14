import assert from "node:assert/strict";
import test from "node:test";
import { mountScrollReveal } from "../src/lib/marketing/scroll-reveal.mjs";

function fixture(reduced = false) {
  let callback; const observed = new Set(); const listeners = {};
  const media = { matches: reduced, addEventListener: (_, fn) => { listeners.change = fn; }, removeEventListener: () => { delete listeners.change; } };
  const elements = [100, 1200, 1400].map((top) => ({
    dataset: {}, style: { setProperty() {}, removeProperty() {} }, getBoundingClientRect: () => ({ top }),
    closest() { return this.dataset.revealState === "pending" ? this : null; }, parentElement: null,
  }));
  const root = { querySelectorAll: () => elements, contains: (el) => elements.includes(el), addEventListener: (_, fn) => { listeners.focus = fn; }, removeEventListener: () => { delete listeners.focus; } };
  const win = { innerHeight: 800, matchMedia: () => media, IntersectionObserver: class {
    constructor(fn) { callback = fn; } observe(el) { observed.add(el); } unobserve(el) { observed.delete(el); } disconnect() { observed.clear(); }
  } };
  return { root, win, media, elements, observed, listeners, enter: (el) => callback([{ target: el, isIntersecting: true }]) };
}
test("reveal deixa conteudo inicial visivel e anima abaixo da dobra apenas uma vez", () => {
  const f = fixture(); const cleanup = mountScrollReveal(f.root, [{ selector: "article", direction: "alternate" }], f.win);
  assert.equal(f.elements[0].dataset.revealState, "visible");
  assert.equal(f.elements[1].dataset.revealState, "pending");
  assert.equal(f.elements[1].dataset.revealDirection, "right");
  assert.equal(f.elements[2].dataset.revealDirection, "left");
  f.enter(f.elements[1]);
  assert.equal(f.elements[1].dataset.revealState, "visible");
  assert.equal(f.observed.has(f.elements[1]), false);
  cleanup();assert.equal(f.observed.size, 0);assert.deepEqual(f.elements[1].dataset, {});
});
test("reduced motion ou ausencia de observer nao oculta conteudo", () => {
  const f = fixture(true);mountScrollReveal(f.root, [{ selector: "article", direction: "up" }], f.win);
  assert.ok(f.elements.every(el => Object.keys(el.dataset).length === 0));
  f.win.IntersectionObserver = null;
  assert.doesNotThrow(() => mountScrollReveal(f.root, [], f.win)());
});
test("mudanca para reduced motion revela todos e desliga observer", () => {
  const f = fixture();mountScrollReveal(f.root, [{ selector: "article", direction: "up" }], f.win);
  f.media.matches = true;f.listeners.change();
  assert.ok(f.elements.every(el => el.dataset.revealState === "visible"));assert.equal(f.observed.size, 0);
});
test("foco por teclado revela elemento pendente sem depender de scroll", () => {
  const f = fixture();mountScrollReveal(f.root, [{ selector: "article", direction: "up" }], f.win);
  f.listeners.focus({ target: f.elements[2] });
  assert.equal(f.elements[2].dataset.revealState, "visible");
});
