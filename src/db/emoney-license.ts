/**
 * E-money issuer license framework — COBAC/CEMAC regulatory caps.
 * Server-side enforcement via RPC; client reads status for UX.
 */
import { getSupabase } from "@/src/supabase";

export type LicenseStatus = "sandbox" | "application" | "licensed" | "suspended";

export interface EmoneyLicenseConfig {
  license_number: string | null;
  license_status: LicenseStatus;
  issuer_country: string;
  regulator: string;
  max_float_xaf: number;
  max_user_balance_xaf: number;
  max_daily_outflow_xaf: number;
  max_single_tx_xaf: number;
  effective_from: string;
}

const SANDBOX_DEFAULTS: EmoneyLicenseConfig = {
  license_number: null,
  license_status: "sandbox",
  issuer_country: "CM",
  regulator: "COBAC",
  max_float_xaf: 100_000_000,
  max_user_balance_xaf: 2_000_000,
  max_daily_outflow_xaf: 1_000_000,
  max_single_tx_xaf: 500_000,
  effective_from: new Date().toISOString(),
};

export async function getEmoneyLicenseConfig(): Promise<EmoneyLicenseConfig> {
  const { data } = await getSupabase()
    .from("emoney_license_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return SANDBOX_DEFAULTS;
  return {
    license_number: data.license_number ?? null,
    license_status: (data.license_status ?? "sandbox") as LicenseStatus,
    issuer_country: data.issuer_country ?? "CM",
    regulator: data.regulator ?? "COBAC",
    max_float_xaf: Number(data.max_float_xaf ?? SANDBOX_DEFAULTS.max_float_xaf),
    max_user_balance_xaf: Number(data.max_user_balance_xaf ?? SANDBOX_DEFAULTS.max_user_balance_xaf),
    max_daily_outflow_xaf: Number(data.max_daily_outflow_xaf ?? SANDBOX_DEFAULTS.max_daily_outflow_xaf),
    max_single_tx_xaf: Number(data.max_single_tx_xaf ?? SANDBOX_DEFAULTS.max_single_tx_xaf),
    effective_from: data.effective_from ?? SANDBOX_DEFAULTS.effective_from,
  };
}

export function isLicensedOperation(status: LicenseStatus): boolean {
  return status === "licensed" || status === "sandbox";
}

export function licenseStatusLabel(status: LicenseStatus): string {
  switch (status) {
    case "licensed": return "Licence émetteur monnaie électronique active";
    case "sandbox": return "Environnement sandbox — limites réduites";
    case "application": return "Demande de licence en cours (COBAC)";
    case "suspended": return "Licence suspendue — opérations limitées";
  }
}
