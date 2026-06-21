import { describe, expect, it } from "vitest";
import { getRegionalProfile, resolveCountryCode, toReferenceXaf } from "@/src/regional-credit";
import { computeAlternativeCredit, scoreMobileVelocity } from "@/src/alternative-credit";

describe("regional credit — zones", () => {
  it("maps Senegal to UEMOA / XOF", () => {
    const p = getRegionalProfile("Sénégal");
    expect(p.zone).toBe("UEMOA");
    expect(p.local_currency).toBe("XOF");
  });

  it("maps Nigeria to WAMZ / NGN", () => {
    const p = getRegionalProfile("Nigeria");
    expect(p.zone).toBe("WAMZ");
    expect(p.local_currency).toBe("NGN");
  });

  it("maps Ghana to GHS", () => {
    const p = getRegionalProfile("Ghana");
    expect(p.local_currency).toBe("GHS");
  });

  it("resolves ISO codes", () => {
    expect(resolveCountryCode("CM")).toBe("CM");
    expect(resolveCountryCode("Cameroun")).toBe("CM");
  });
});

describe("regional credit — FX reference", () => {
  it("treats XOF 1:1 with XAF for scoring", () => {
    expect(toReferenceXaf(1000, "XOF")).toBe(1000);
  });
});

describe("alternative credit scoring", () => {
  it("rewards mobile money velocity", () => {
    const now = new Date().toISOString();
    const pts = scoreMobileVelocity([
      { created_at: now, amount_xaf: 5000 },
      { created_at: now, amount_xaf: 3000 },
    ]);
    expect(pts).toBeGreaterThan(0);
  });

  it("computes composite score with regional profile", () => {
    const result = computeAlternativeCredit({
      country: "Nigeria",
      createdAt: new Date(Date.now() - 180 * 86400000).toISOString(),
      kycStatus: "approved",
      contributions: [{ created_at: new Date().toISOString(), amount: 5000 }],
      savingsTotalLocal: 100_000,
      savingsCurrency: "NGN",
      walletTopups: [{ created_at: new Date().toISOString(), amount_xaf: 10000 }],
      groupsJoined: 2,
      groupsCreated: 0,
      tontineCyclesCompleted: 5,
      infractionCount: 0,
      baseScore: 400,
      memberSince: new Date(Date.now() - 90 * 86400000).toISOString(),
    });
    expect(result.alternative_score).toBeGreaterThan(0);
    expect(result.composite_score).toBeGreaterThanOrEqual(400);
    expect(result.regional.zone).toBe("WAMZ");
  });
});
