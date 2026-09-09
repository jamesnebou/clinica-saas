export function hasContactConsent(input = {}) {
  return input?.contact_consent === "on" || input?.contact_consent === true;
}

export function buildMarketingLeadPayload({
  formPayload = {},
  attribution = {},
  plan,
  sessionId,
  metaEventId,
  segment,
} = {}) {
  return {
    ...formPayload,
    plan_interest: plan,
    session_id: sessionId,
    meta_event_id: metaEventId,
    ...attribution,
    segment,
    contact_consent: formPayload.contact_consent,
    consent: attribution.consent,
  };
}
