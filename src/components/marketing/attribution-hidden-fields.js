"use client";

import { useEffect, useRef } from "react";
import { createMarketingEventId, serializeMarketingAttribution } from "@/lib/tracking/client-attribution";

export function MarketingAttributionHiddenFields({ segment = null, pageType = "onboarding" } = {}) {
  const attributionRef = useRef(null);
  const eventIdRef = useRef(null);

  useEffect(() => {
    if (attributionRef.current) {
      attributionRef.current.value = serializeMarketingAttribution({ segment, pageType });
    }
    if (eventIdRef.current && !eventIdRef.current.value) {
      eventIdRef.current.value = createMarketingEventId("complete_registration");
    }
  }, [pageType, segment]);

  return (
    <>
      <input ref={attributionRef} type="hidden" name="marketing_attribution" defaultValue="" />
      <input ref={eventIdRef} type="hidden" name="meta_registration_event_id" defaultValue="" />
    </>
  );
}
