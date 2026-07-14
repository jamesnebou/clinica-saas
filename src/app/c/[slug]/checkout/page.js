import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { isAsaasConfigured } from "@/lib/asaas/client";
import { getStoreConfig } from "@/lib/store/config";
import { StoreCheckout } from "./checkout-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: `Checkout | ${slug}` };
}

export default async function StoreCheckoutPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const { data: clinic, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();
  if (error) throw error;
  if (!clinic || clinic.metadata?.site_publico?.publicado === false || clinic.metadata?.site_publico?.lojinha_ativa === false) notFound();

  const { data: integration } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("clinica_id, asaas_ativo, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, asaas_api_key")
    .eq("clinica_id", clinic.id)
    .eq("asaas_ativo", true)
    .maybeSingle();
  const secrets = integration ? decryptClinicSecrets(integration.asaas_segredos_criptografados) : {};
  const asaasConfig = integration ? { clinica_id: clinic.id, asaas_ativo: integration.asaas_ativo, baseUrl: integration.asaas_configuracao_publica?.baseUrl || integration.asaas_base_url, apiKey: secrets.apiKey || integration.asaas_api_key } : { clinica_id: clinic.id };
  const site = clinic.metadata?.site_publico || {};
  const primary = clinic.metadata?.primary_color || "#2e3a2d";
  const accent = clinic.metadata?.accent_color || "#d99bae";

  return (
    <div style={{ "--clinic-primary": primary, "--clinic-accent": accent }}>
      <StoreCheckout
        slug={slug}
        brandName={clinic.metadata?.brand_name || clinic.nome}
        config={getStoreConfig(site)}
        onlinePaymentAvailable={getStoreConfig(site).checkoutAsaasAtivo && isAsaasConfigured(asaasConfig)}
        cartToken={query?.cart || ""}
        query={query || {}}
      />
    </div>
  );
}
