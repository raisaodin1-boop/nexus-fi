/**
 * QR Payment — encode/decode payment requests as QR data strings.
 * Format: hodix://pay?to=<userId>&name=<name>&amount=<optional>
 */

export interface QRPaymentData {
  to: string;        // user id
  name: string;      // display name
  amount?: number;   // optional pre-filled amount
  currency?: string;
}

export function encodeQR(data: QRPaymentData): string {
  const params = new URLSearchParams({ to: data.to, name: data.name });
  if (data.amount) params.set("amount", String(data.amount));
  if (data.currency) params.set("currency", data.currency);
  return `hodix://pay?${params.toString()}`;
}

export function decodeQR(url: string): QRPaymentData | null {
  const raw = url.trim();
  if (raw.startsWith("{")) {
    try {
      const j = JSON.parse(raw);
      const to = j.user_id ?? j.to;
      const name = j.full_name ?? j.name;
      if (to && name) {
        return { to: String(to), name: String(name), currency: j.currency ?? "XAF" };
      }
    } catch { /* fall through */ }
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "hodix:" || u.hostname !== "pay") return null;
    const to = u.searchParams.get("to");
    const name = u.searchParams.get("name");
    if (!to || !name) return null;
    const amount = u.searchParams.get("amount");
    const currency = u.searchParams.get("currency");
    return {
      to,
      name,
      amount: amount ? Number(amount) : undefined,
      currency: currency ?? "XAF",
    };
  } catch {
    return null;
  }
}

/** Mask a display name for leaderboard/public views: "Marie Dupont" → "Marie D." */
export function maskName(fullName: string): string {
  const parts = fullName.trim().split(" ");
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
