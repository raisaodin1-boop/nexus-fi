import { describe, expect, it } from "vitest";
import { computeRoundUpSpare, previewRoundUpTopup } from "@/src/momo-roundup";
import { maxInstantLoanForScore, MIN_INSTANT_SCORE } from "@/src/db/instant-loan";

describe("momo-roundup", () => {
  it("computes spare to next 500 XAF increment", () => {
    expect(computeRoundUpSpare(4875, 500)).toBe(125);
    expect(computeRoundUpSpare(5000, 500)).toBe(0);
  });

  it("computes spare for 1000 increment", () => {
    expect(computeRoundUpSpare(7500, 1000)).toBe(500);
  });

  it("preview includes spare in effective topup", () => {
    const p = previewRoundUpTopup(4875, 500);
    expect(p.spare).toBe(125);
    expect(p.effectiveTopup).toBe(5000);
  });
});

describe("instant-loan limits", () => {
  it("requires score 750+ for any amount", () => {
    expect(maxInstantLoanForScore(MIN_INSTANT_SCORE - 1)).toBe(0);
    expect(maxInstantLoanForScore(MIN_INSTANT_SCORE)).toBe(50_000);
  });

  it("scales max by tier", () => {
    expect(maxInstantLoanForScore(800)).toBe(100_000);
    expect(maxInstantLoanForScore(850)).toBe(200_000);
  });
});
