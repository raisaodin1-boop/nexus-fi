import { describe, expect, it } from "vitest";
import { scoreKyc } from "@/src/credit-score";

describe("KYC — scoreKyc", () => {
  it("scores approved KYC at 100", () => {
    expect(scoreKyc("approved")).toBe(100);
  });

  it("scores pending_review at 40", () => {
    expect(scoreKyc("pending_review")).toBe(40);
  });

  it("scores not_submitted at 0", () => {
    expect(scoreKyc("not_submitted")).toBe(0);
  });
});

describe("compliance — API routes", () => {
  it("registers admin compliance audit route", async () => {
    const { readFileSync } = await import("fs");
    const api = readFileSync("src/api.ts", "utf8");
    expect(api).toContain('s[0] === "admin" && s[1] === "compliance" && s[2] === "audit"');
    expect(api).toContain("fraud-alerts");
    expect(api).toContain('s[2] === "stats"');
  });
});
