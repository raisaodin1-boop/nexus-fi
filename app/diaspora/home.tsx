import { DiasporaMemberDashboard } from "@/src/diaspora-member-dashboard";
import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";

export default function DiasporaDashboardRoute() {
  const { checking, access } = useDiasporaGuard();

  if (checking) {
    return <DiasporaGuardSpinner checking={checking} />;
  }

  if (!access?.has_access) return null;

  return <DiasporaMemberDashboard skipGuard />;
}
