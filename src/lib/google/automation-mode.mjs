// Billing-dependent Places endpoints remain available only when explicitly re-enabled.
export function googlePlacesAutomationEnabled() {
  return process.env.GOOGLE_PLACES_AUTOMATION_ENABLED === "true";
}
