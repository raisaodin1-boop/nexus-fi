import { describe, expect, it } from "vitest";

/** Mirrors supabase/functions/_shared/cinetpay.ts pure helpers for smoke tests */
function parsePhone(raw: string, defaultPrefix = "237"): { prefix: string; phone: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length >= 12) {
    return { prefix: "237", phone: digits.slice(3) };
  }
  if (digits.startsWith("225") && digits.length >= 11) {
    return { prefix: "225", phone: digits.slice(3) };
  }
  return { prefix: defaultPrefix, phone: digits.replace(/^0+/, "") };
}

function mapTransferMethod(provider: string, prefix: string): string {
  const p = provider.toLowerCase();
  if (p.includes("mtn")) return prefix === "237" ? "MTNCM" : "MOMO";
  if (p.includes("orange")) return prefix === "237" ? "OMCM" : "OM";
  if (p.includes("moov")) return prefix === "225" ? "FLOOZ" : "MOOV";
  return prefix === "237" ? "MTNCM" : "MOMO";
}

function roundTransferAmount(amount: number): number {
  return Math.max(5, Math.round(amount / 5) * 5);
}

describe("CinetPay transfer utils", () => {
  it("parses Cameroon MTN phone", () => {
    const { prefix, phone } = parsePhone("+237 6 77 12 34 56");
    expect(prefix).toBe("237");
    expect(phone).toBe("677123456");
  });

  it("maps MTN Cameroon to MTNCM", () => {
    expect(mapTransferMethod("MTN MoMo", "237")).toBe("MTNCM");
  });

  it("maps Orange Cameroon to OMCM", () => {
    expect(mapTransferMethod("Orange Money", "237")).toBe("OMCM");
  });

  it("rounds transfer amount to multiple of 5", () => {
    expect(roundTransferAmount(1003)).toBe(1005);
    expect(roundTransferAmount(3)).toBe(5);
  });
});
