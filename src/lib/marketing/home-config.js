import { supabaseAdmin } from "@/lib/supabase/admin";

export const MARKETING_HOME_CONFIG_KEY = "marketing_home";

export const defaultMarketingHome = {
  hero: {
    eyebrow: "Gestão, vendas e atendimento para estética",
    title: "A clínica organizada para vender antes, atender melhor e voltar a faturar depois.",
    subtitle:
      "NexaWi Clínicas reúne agenda, CRM, prontuário, financeiro, site premium e checkout de sinal em uma operação simples para clínicas de estética.",
    primaryCtaLabel: "Solicitar demonstração",
    secondaryCtaLabel: "Ver como funciona",
    previewEyebrow: "Painel operacional",
    previewTitle: "Clínica Bella Skin",
    previewStatus: "Ativa",
    previewImageUrl: "/clinic-dashboard-preview.png",
    previewImageAlt: "Prévia do dashboard NexaWi Clínicas",
    metrics: [
      { label: "Confirmados", value: "18" },
      { label: "Receita prevista", value: "R$ 4.680" },
      { label: "Leads novos", value: "12" },
    ],
    topics: [
      "Menos planilhas e menos retrabalho na recepção",
      "Mais controle sobre agenda, faltas e retornos",
      "Venda de pacotes e sinal online no mesmo fluxo",
      "Prontuário organizado para aumentar valor percebido",
    ],
  },
};

function asString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeMetrics(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;

  const metrics = value
    .slice(0, 3)
    .map((item, index) => ({
      label: asString(item?.label, fallback[index]?.label || "Métrica " + (index + 1)),
      value: asString(item?.value, fallback[index]?.value || "0"),
    }))
    .filter((item) => item.label || item.value);

  return metrics.length ? metrics : fallback;
}

function normalizeTopics(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const topics = value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  return topics.length ? topics : fallback;
}

export function normalizeMarketingHomeConfig(value = {}) {
  const sourceHero = value?.hero || {};
  const fallback = defaultMarketingHome.hero;

  return {
    hero: {
      eyebrow: asString(sourceHero.eyebrow, fallback.eyebrow),
      title: asString(sourceHero.title, fallback.title),
      subtitle: asString(sourceHero.subtitle, fallback.subtitle),
      primaryCtaLabel: asString(sourceHero.primaryCtaLabel, fallback.primaryCtaLabel),
      secondaryCtaLabel: asString(sourceHero.secondaryCtaLabel, fallback.secondaryCtaLabel),
      previewEyebrow: asString(sourceHero.previewEyebrow, fallback.previewEyebrow),
      previewTitle: asString(sourceHero.previewTitle, fallback.previewTitle),
      previewStatus: asString(sourceHero.previewStatus, fallback.previewStatus),
      previewImageUrl: asString(sourceHero.previewImageUrl, fallback.previewImageUrl),
      previewImageAlt: asString(sourceHero.previewImageAlt, fallback.previewImageAlt),
      metrics: normalizeMetrics(sourceHero.metrics, fallback.metrics),
      topics: normalizeTopics(sourceHero.topics, fallback.topics),
    },
  };
}

export async function getMarketingHomeConfig() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_configuracoes")
      .select("valor")
      .eq("chave", MARKETING_HOME_CONFIG_KEY)
      .maybeSingle();

    if (error) return defaultMarketingHome;
    return normalizeMarketingHomeConfig(data?.valor || {});
  } catch {
    return defaultMarketingHome;
  }
}
