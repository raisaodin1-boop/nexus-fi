import { describe, expect, it } from "vitest";
import { parsePaymentMeta, rejectDirectPayment } from "@/src/db/payments";

describe("payments — parsePaymentMeta", () => {
  it("parses JSON metadata from description", () => {
    const meta = { kind: "wallet_topup", amount_xaf: 5000, provider: "mtn" };
    const desc = `${JSON.stringify(meta)} · ref:CP123456`;
    const parsed = parsePaymentMeta(desc);
    expect(parsed?.kind).toBe("wallet_topup");
    expect(parsed?.amount_xaf).toBe(5000);
  });

  it("returns null for invalid JSON", () => {
    expect(parsePaymentMeta("not-json")).toBeNull();
    expect(parsePaymentMeta(null)).toBeNull();
  });
});

describe("payments — rejectDirectPayment", () => {
  it("blocks direct wallet credits", () => {
    expect(() => rejectDirectPayment()).toThrow();
    try {
      rejectDirectPayment();
    } catch (e: any) {
      expect(e.status).toBe(403);
      expect(e.detail).toMatch(/CinetPay|paiement/i);
    }
  });
});
