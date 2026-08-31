"use client";

import { useEffect, useRef } from "react";
import { createMarketingEventId, getMarketingSessionId, serializeMarketingAttribution } from "@/lib/tracking/client-attribution";

export function MarketingAttributionHiddenFields({ segment = null, pageType = "onboarding", includeRegistrationEvent = true, includeSession = false } = {}) {
  const attributionRef = useRef(null);
  const eventIdRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (attributionRef.current) {
      attributionRef.current.value = serializeMarketingAttribution({ segment, pageType });
    }
    if (includeRegistrationEvent && eventIdRef.current && !eventIdRef.current.value) {
      eventIdRef.current.value = createMarketingEventId("complete_registration");
    }
    if (includeSession && sessionRef.current) {
      sessionRef.current.value = getMarketingSessionId() || "";
    }
  }, [includeRegistrationEvent, includeSession, pageType, segment]);

  return (
    <>
      <input ref={attributionRef} type="hidden" name="marketing_attribution" defaultValue="" />
      {includeRegistrationEvent ? <input ref={eventIdRef} type="hidden" name="meta_registration_event_id" defaultValue="" /> : null}
      {includeSession ? <input ref={sessionRef} type="hidden" name="marketing_session_id" defaultValue="" /> : null}
    </>
  );
}
