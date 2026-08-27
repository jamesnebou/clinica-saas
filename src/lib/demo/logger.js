function safeContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => !/password|token|secret|key/i.test(key))
  );
}

export function logDemoEvent(event, context = {}) {
  console.info(JSON.stringify({ scope: "demo", event, at: new Date().toISOString(), ...safeContext(context) }));
}

export function logDemoError(event, error, context = {}) {
  console.error(JSON.stringify({
    scope: "demo",
    event,
    at: new Date().toISOString(),
    ...safeContext(context),
    error: {
      name: error?.name || "Error",
      code: error?.code || null,
      message: error?.message || "Erro desconhecido",
      details: error?.details || null,
    },
  }));
}
