import { createClient } from "@/lib/supabase/server";
import { getCapabilitiesForSegments, getSegmentDefinition, getTerminologyForSegments, isSupportedSegment } from "@/lib/segments/registry";
import { resolveCapabilities, resolvePrimarySegment } from "@/lib/domain/segment-core.mjs";

const LEGACY_SEGMENT = [{ principal: true, segmentos: { slug: "estetica", nome: "Estética", metadata: {} } }];

function metadataSegments(metadata = {}) {
  const primary = isSupportedSegment(metadata?.primary_segment) ? metadata.primary_segment : null;
  const stored = Array.isArray(metadata?.segments) ? metadata.segments.filter(isSupportedSegment) : [];
  const slugs = [...new Set([primary, ...stored].filter(Boolean))];
  if (!slugs.length) return LEGACY_SEGMENT;
  return slugs.map((slug, index) => {
    const definition = getSegmentDefinition(slug);
    return { principal: slug === primary || (!primary && index === 0), segmentos: { slug, nome: definition.name, metadata: {} } };
  });
}

async function fallbackClinicSegments(supabase, clinicaId) {
  const { data } = await supabase.from("clinicas").select("metadata").eq("id", clinicaId).maybeSingle();
  return metadataSegments(data?.metadata);
}

export async function getClinicSegments(clinicaId, client = null) {
  if (!clinicaId) return [];
  const supabase = client || await createClient();
  const { data, error } = await supabase.from("clinica_segmentos")
    .select("id, clinica_id, segmento_id, principal, configuracao, segmentos(id, slug, nome, descricao, metadata)")
    .eq("clinica_id", clinicaId).order("principal", { ascending: false }).order("created_at", { ascending: true });
  if (error || !data?.length) return fallbackClinicSegments(supabase, clinicaId);
  return data;
}

export async function getPrimaryClinicSegment(clinicaId, client = null) {
  const segments = await getClinicSegments(clinicaId, client);
  const slug = resolvePrimarySegment(segments);
  const relation = segments.find((item) => item?.segmentos?.slug === slug) || segments[0];
  return { ...getSegmentDefinition(relation?.segmentos?.slug), relation };
}

export async function getClinicCapabilities({ clinic, plan = null, segments = null, overrides = null, client = null }) {
  const supabase = client || await createClient();
  const clinicSegments = segments || await getClinicSegments(clinic?.id, supabase);
  const segmentCapabilities = new Set(getCapabilitiesForSegments(clinicSegments.map((item) => item.segmentos?.slug).filter(Boolean)));
  const paid = plan?.metadata?.capabilities;
  const commerciallyAllowed = Array.isArray(paid) && paid.length ? new Set(paid) : null;
  let clinicOverrides = overrides;
  if (!clinicOverrides && clinic?.id) {
    const { data } = await supabase.from("clinica_capability_overrides").select("capability, habilitada").eq("clinica_id", clinic.id);
    clinicOverrides = data || [];
  }
  const effective = resolveCapabilities({ segmentCapabilities: [...segmentCapabilities], planCapabilities: commerciallyAllowed ? [...commerciallyAllowed] : null, overrides: clinicOverrides || [] });
  return { segment: [...segmentCapabilities], plan: commerciallyAllowed ? [...commerciallyAllowed] : null, overrides: clinicOverrides || [], effective };
}

export function clinicHasCapability(capabilities, capability) {
  const effective = Array.isArray(capabilities) ? capabilities : capabilities?.effective;
  return Boolean(effective?.includes(capability));
}

export async function getClinicTerminology(clinicaId, client = null) {
  const segments = await getClinicSegments(clinicaId, client);
  const principal = segments.find((item) => item.principal) || segments[0];
  return getTerminologyForSegments([principal, ...segments.filter((item) => item !== principal)].map((item) => item?.segmentos?.slug).filter(Boolean));
}
