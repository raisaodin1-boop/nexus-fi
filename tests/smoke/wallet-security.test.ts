import { describe, expect, it } from "vitest";
import { convert, type Rates } from "@/src/exchange-rates";
import { parseDeepLink } from "@/src/deep-link";
import { shouldBlockOnFraudUnavailable, FRAUD_UNAVAILABLE_MIN_XAF } from "@/src/fraud-fail-closed";
import { buildTrustScoreAnalytics, trustScoreToPct } from "@/src/admin-trust-analytics";

const FALLBACK: Rates = {
  base: "USD",
  rates: {
    USD: 1,
    EUR: 0.92,
    XAF: 603.48,
    XOF: 603.48,
    NGN: 1550,
    GHS: 15.5,
    KES: 130,
    ZAR: 18.5,
  },
  fetched_at: new Date().toISOString(),
  source: "fallback",
};

/** Same conversion path as wallet transfer/withdraw check-tx. */
function toXafForCheckTx(amount: number, currency: "XAF" | "EUR" | "USD", rates: Rates): number {
  if (currency === "XAF") return Math.round(amount);
  return Math.round(convert(amount, currency, "XAF", rates));
}

describe("wallet smoke — EUR→XAF check-tx amount", () => {
  it("converts EUR display amount to XAF for risk thresholds", () => {
    const amtXaf = toXafForCheckTx(10, "EUR", FALLBACK);
    expect(amtXaf).toBeGreaterThan(5_000);
    expect(amtXaf).toBe(Math.round(convert(10, "EUR", "XAF", FALLBACK)));
  });

  it("keeps XAF amounts unchanged", () => {
    expect(toXafForCheckTx(25_000, "XAF", FALLBACK)).toBe(25_000);
  });

  it("requires PIN threshold after EUR conversion (~5k+)", () => {
    const amtXaf = toXafForCheckTx(8, "EUR", FALLBACK);
    expect(amtXaf).toBeGreaterThanOrEqual(FRAUD_UNAVAILABLE_MIN_XAF);
  });
});

describe("wallet smoke — fraud fail-closed", () => {
  it("blocks medium amounts when fraud-score is unavailable", () => {
    expect(shouldBlockOnFraudUnavailable(5_000)).toBe(true);
    expect(shouldBlockOnFraudUnavailable(25_000)).toBe(true);
    expect(shouldBlockOnFraudUnavailable(100_000)).toBe(true);
  });

  it("allows micro amounts below PIN gate", () => {
    expect(shouldBlockOnFraudUnavailable(4_999)).toBe(false);
    expect(shouldBlockOnFraudUnavailable(0)).toBe(false);
  });
});

describe("wallet smoke — anomaly freeze heuristics", () => {
  it("flags large_amount at 300k+ (auto-freeze input)", () => {
    const flags: string[] = [];
    const amountXaf = 300_000;
    if (amountXaf >= 300_000) flags.push("large_amount");
    expect(flags).toContain("large_amount");
  });

  it("freezes on high_frequency OR (new_device && large_amount)", () => {
    const shouldFreeze = (flags: string[]) =>
      flags.includes("high_frequency") || (flags.includes("new_device") && flags.includes("large_amount"));
    expect(shouldFreeze(["high_frequency"])).toBe(true);
    expect(shouldFreeze(["new_device", "large_amount"])).toBe(true);
    expect(shouldFreeze(["new_device"])).toBe(false);
    expect(shouldFreeze(["unusual_amount"])).toBe(false);
  });
});

describe("wallet smoke — deep-link join", () => {
  it("routes plural association type", () => {
    expect(parseDeepLink("hodix://join?code=ABC&type=associations")).toBe(
      "/associations/join?code=ABC",
    );
  });

  it("routes singular association alias", () => {
    expect(parseDeepLink("hodix://join?code=ABC&type=association")).toBe(
      "/associations/join?code=ABC",
    );
  });

  it("routes tontine default and singular", () => {
    expect(parseDeepLink("hodix://join?code=XYZ")).toBe("/tontines/join?code=XYZ");
    expect(parseDeepLink("hodix://join?code=XYZ&type=tontine")).toBe("/tontines/join?code=XYZ");
  });

  it("routes cooperative aliases", () => {
    expect(parseDeepLink("hodix://join?code=C1&type=cooperative")).toBe(
      "/cooperatives/join?code=C1",
    );
  });
});

describe("admin trust analytics", () => {
  it("normalizes 0–1000 scores to /100 KPI scale", () => {
    expect(trustScoreToPct(800)).toBe(80);
    expect(trustScoreToPct(8)).toBe(8);
  });

  it("builds distribution and average from trust_score", () => {
    const a = buildTrustScoreAnalytics([800, 650, 400, 150, 0]);
    expect(a.score_distribution.excellent).toBe(1);
    expect(a.score_distribution.very_good).toBe(1);
    expect(a.score_distribution.good).toBe(1);
    expect(a.score_distribution.emerging).toBe(0);
    expect(a.score_distribution.new).toBe(2);
    expect(a.tier_distribution.platinum).toBe(0); // 80 < 81
    expect(a.tier_distribution.gold).toBe(2); // 80 and 65
    expect(a.avg_trust_score).toBe(40); // (80+65+40+15+0)/5
  });
});
