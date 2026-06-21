import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const apiSource = readFileSync(path.join(process.cwd(), "src/api.ts"), "utf8");

describe("api router — critical financial routes", () => {
  it("registers wallet withdraw", () => {
    expect(apiSource).toContain('s[0] === "wallet" && s[1] === "withdraw"');
  });

  it("registers CinetPay initiate and confirm", () => {
    expect(apiSource).toContain('s[0] === "payments" && s[1] === "cinetpay" && s[2] === "initiate"');
    expect(apiSource).toContain('s[0] === "payments" && s[1] === "cinetpay" && s[2] === "confirm"');
  });

  it("registers payment status polling", () => {
    expect(apiSource).toMatch(/payments.*status/s);
  });

  it("registers trust score", () => {
    expect(apiSource).toContain('"trust-score"');
  });
});

describe("api router — payment guardrails", () => {
  it("blocks direct wallet topup", () => {
    expect(apiSource).toContain('s[0] === "wallet" && s[1] === "topup"');
    expect(apiSource).toContain("rejectDirectPayment()");
  });

  it("blocks direct tontine contribution", () => {
    expect(apiSource).toContain('s[0] === "tontines" && s[1] && s[2] === "contribute"');
    expect(apiSource).toContain("rejectDirectPayment()");
  });

  it("blocks direct savings deposit", () => {
    expect(apiSource).toContain('s[0] === "savings" && s[1] && s[2] === "deposit"');
  });
});
