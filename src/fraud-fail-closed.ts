/** Minimum outbound XAF amount that requires live fraud-score (fail-closed if unavailable). */
export const FRAUD_UNAVAILABLE_MIN_XAF = 5_000;

export function shouldBlockOnFraudUnavailable(amountXaf: number): boolean {
  return Number(amountXaf) >= FRAUD_UNAVAILABLE_MIN_XAF;
}
