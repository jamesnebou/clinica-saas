export function mountScrollReveal(root, groups, win = window) {
  if (!root || !win.IntersectionObserver) return () => {};
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  if (media.matches) return () => {};
  const elements = new Set();
  let observer;
  function show(element) {
    element.dataset.revealState = "visible";
    observer?.unobserve(element);
  }
  function showAll() {
    elements.forEach(show);
    observer.disconnect();
  }
  observer = new win.IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) show(entry.target); });
  }, { threshold: 0.08 });
  groups.forEach(({ selector, direction }) => {
    root.querySelectorAll(selector).forEach((element, index) => {
      if (elements.has(element)) return;
      elements.add(element);
      element.dataset.revealDirection = direction === "alternate" ? (index % 2 ? "right" : "left") : direction;
      element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 60}ms`);
      // Content already in view stays visible during hydration and restored scroll positions.
      if (element.getBoundingClientRect().top < win.innerHeight) show(element);
      else {
        element.dataset.revealState = "pending";
        observer.observe(element);
      }
    });
  });
  function onFocus(event) {
    let element = event.target.closest?.('[data-reveal-state="pending"]');
    while (element && root.contains(element)) {
      show(element);
      element = element.parentElement?.closest('[data-reveal-state="pending"]');
    }
  }
  function onPreference() { if (media.matches) showAll(); }
  media.addEventListener("change", onPreference);
  root.addEventListener("focusin", onFocus);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onPreference);
    root.removeEventListener("focusin", onFocus);
    elements.forEach((element) => {
      delete element.dataset.revealDirection;
      delete element.dataset.revealState;
      element.style.removeProperty("--reveal-delay");
    });
  };
}
