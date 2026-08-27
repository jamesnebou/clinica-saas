// Compatibility facade. New demo logic belongs in the focused modules in this directory.
export {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_SLUG,
  isDemoClinic,
  isDemoLoginEmail,
  isDemoPassword,
} from "./config";

export {
  ensureDemoAccountAndReset,
  prepareDemoClinic,
  resetDemoClinic,
  resetDemoClinicData,
} from "./service";
