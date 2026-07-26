import { describe, expect, it } from "vitest";

/**
 * Documents the product rule encoded in can_direct_message / sendMessage.
 * Runtime DB checks live in the migration; this locks the intended matrix.
 */
describe("direct message policy matrix", () => {
  const cases: Array<{
    label: string;
    sender: "member" | "admin" | "manager";
    recipient: "member" | "admin" | "manager";
    sharedTontineManagerLink: boolean;
    allowed: boolean;
  }> = [
    { label: "member → admin", sender: "member", recipient: "admin", sharedTontineManagerLink: false, allowed: true },
    { label: "member → own tontine manager", sender: "member", recipient: "manager", sharedTontineManagerLink: true, allowed: true },
    { label: "member → other member", sender: "member", recipient: "member", sharedTontineManagerLink: false, allowed: false },
    { label: "manager → member same tontine", sender: "manager", recipient: "member", sharedTontineManagerLink: true, allowed: true },
    { label: "admin → anyone", sender: "admin", recipient: "member", sharedTontineManagerLink: false, allowed: true },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const allowed =
        c.sender === "admin" ||
        c.recipient === "admin" ||
        (c.sharedTontineManagerLink && (c.sender === "manager" || c.recipient === "manager"));
      expect(allowed).toBe(c.allowed);
    });
  }
});
