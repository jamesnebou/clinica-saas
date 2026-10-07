import { FinanceNav } from "./finance-nav";
import { requireClinicSection, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { clinicHasEntitlement, FINANCE_NAV_ENTITLEMENT } from "@/lib/saas/plan-entitlements.mjs";

export default async function FinanceLayout({ children }) {
  const context = await requireClinicSection("financeiro");
  const clinic = await resolveClinicPlanEntitlements(context);
  const allowedPaths = Object.entries(FINANCE_NAV_ENTITLEMENT)
    .filter(([, capability]) => capability === "financeiro" || clinicHasEntitlement(clinic, capability))
    .map(([path]) => path);
  return <div className="min-w-0"><FinanceNav allowedPaths={allowedPaths} />{children}</div>;
}
