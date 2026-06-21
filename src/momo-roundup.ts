/** MoMo round-up spare change computation */
export const ROUNDUP_INCREMENTS = [100, 500, 1000] as const;
export type RoundUpIncrement = (typeof ROUNDUP_INCREMENTS)[number];

export function computeRoundUpSpare(amount: number, increment: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || increment <= 0) return 0;
  const remainder = amount % increment;
  return remainder === 0 ? 0 : increment - remainder;
}

export function previewRoundUpTopup(amount: number, increment: number): {
  spare: number;
  effectiveTopup: number;
} {
  const spare = computeRoundUpSpare(amount, increment);
  return { spare, effectiveTopup: amount + spare };
}
