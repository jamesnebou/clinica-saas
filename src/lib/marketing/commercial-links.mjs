const WHATSAPP_NUMBER = "5577988656394";
const segmentMessages = {
  odontologia: "Olá, quero conhecer a NexaWi para minha clínica odontológica.",
};
export function marketingSignupHref(plan, segment) {
  const query = new URLSearchParams({ plan: String(plan || "starter").toLowerCase() });
  if (segment) query.set("segment", segment);
  return `/cadastro?${query.toString()}`;
}
export function marketingWhatsAppHref(segment) {
  const message = segmentMessages[segment] || "Olá, quero conhecer a NexaWi Clínicas.";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
export function pricingEventData(plan, segment) {
  return { plan, ...(segment ? { segment } : {}) };
}
