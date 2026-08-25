export function resolvePrimarySegment(relations = [], fallback = "estetica") {
  return relations.find((item) => item?.principal)?.segmentos?.slug || relations[0]?.segmentos?.slug || fallback;
}

export function resolveCapabilities({ segmentCapabilities = [], planCapabilities = null, overrides = [] } = {}) {
  const commercial = Array.isArray(planCapabilities) && planCapabilities.length ? new Set(planCapabilities) : null;
  const effective = new Set(segmentCapabilities.filter((capability) => !commercial || commercial.has(capability)));
  for (const override of overrides) {
    if (!override?.capability) continue;
    if (override.habilitada) effective.add(override.capability);
    else effective.delete(override.capability);
  }
  return [...effective].sort();
}
