import { describe, expect, it } from "vitest";

/** Mirrors src/db/paynote-mtn.ts for smoke tests */
function normalizeMtnMsisdn(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

describe("paynote-mtn msisdn", () => {
  it("strips Cameroon country code", () => {
    expect(normalizeMtnMsisdn("+237 677 94 79 43")).toBe("677947943");
  });

  it("strips leading zero", () => {
    expect(normalizeMtnMsisdn("0677947943")).toBe("677947943");
  });

  it("keeps 9-digit local number", () => {
    expect(normalizeMtnMsisdn("677947943")).toBe("677947943");
  });
});
