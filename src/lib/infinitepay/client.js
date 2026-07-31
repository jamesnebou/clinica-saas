const INFINITEPAY_API_URL = "https://api.checkout.infinitepay.io";

export function normalizeInfinitePayHandle(value) {
  let handle = String(value || "").trim();

  if (!handle) return "";

  try {
    const parsed = new URL(handle);
    handle = parsed.pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    // The value is already an InfiniteTag instead of a URL.
  }

  return handle.replace(/^[@$]+/, "").trim();
}

export function isInfinitePayConfigured(integration = {}) {
  return Boolean(
    integration?.infinitepay_ativo
    && normalizeInfinitePayHandle(integration?.infinitepay_handle),
  );
}

async function infinitePayRequest(path, body) {
  const response = await fetch(`${INFINITEPAY_API_URL}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || payload?.error || "A InfinitePay recusou a solicitação.";
    throw new Error(message);
  }

  return payload;
}

export async function createInfinitePayCheckout({
  handle,
  orderNsu,
  items,
  customer,
  redirectUrl,
  webhookUrl,
}) {
  const normalizedHandle = normalizeInfinitePayHandle(handle);
  const normalizedItems = (items || []).map((item) => ({
    quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
    price: Math.max(1, Math.round(Number(item.price || 0))),
    description: String(item.description || "Pagamento").slice(0, 120),
  })).filter((item) => item.price > 0);

  if (!normalizedHandle) throw new Error("Informe a InfiniteTag da clínica.");
  if (!orderNsu) throw new Error("Não foi possível identificar o pedido.");
  if (!normalizedItems.length) throw new Error("O checkout precisa ter ao menos um item com valor.");

  const payload = await infinitePayRequest("/links", {
    handle: normalizedHandle,
    order_nsu: String(orderNsu),
    redirect_url: redirectUrl,
    webhook_url: webhookUrl,
    items: normalizedItems,
    customer: {
      name: String(customer?.name || "").trim() || undefined,
      email: String(customer?.email || "").trim() || undefined,
      phone_number: String(customer?.phone || "").replace(/\D/g, "") || undefined,
    },
  });

  if (!payload?.url) {
    throw new Error("A InfinitePay não retornou o link do checkout.");
  }

  return payload;
}

export async function checkInfinitePayPayment({
  handle,
  orderNsu,
  transactionNsu,
  slug,
}) {
  const normalizedHandle = normalizeInfinitePayHandle(handle);

  if (!normalizedHandle || !orderNsu || !transactionNsu || !slug) {
    throw new Error("Dados insuficientes para validar o pagamento InfinitePay.");
  }

  return infinitePayRequest("/payment_check", {
    handle: normalizedHandle,
    order_nsu: String(orderNsu),
    transaction_nsu: String(transactionNsu),
    slug: String(slug),
  });
}
