/** Official HODIX Diaspora payment coordinates — V1 manual validation. */

export const DIASPORA_LEGAL_NAME = "YORIX DIGITAL GROUP SARL";
export const DIASPORA_BRAND = "HODIX";

export const DIASPORA_MOMO = {
  mtn: {
    operator: "MTN Mobile Money",
    holder: "Nguessie Nguemo Raisa",
    number: "+237 676 935 195",
    raw: "676935195",
    country: "Cameroun",
  },
  orange: {
    operator: "Orange Money",
    holder: "Nguessie Nguemo Raisa",
    number: "+237 696 565 654",
    raw: "696565654",
    country: "Cameroun",
  },
} as const;

export const DIASPORA_BANK = {
  holder: DIASPORA_LEGAL_NAME,
  bank: "AFRILAND FIRST BANK – Cameroun",
  account: "10005 00073 00000140440 35",
  iban: "CM21 10005 00073 00000140440 35",
  swift: "CCEICMCX",
  country: "Cameroun",
  currency: "XAF",
} as const;

/** WhatsApp support — fallback channel only */
export const DIASPORA_WHATSAPP = "+237676935195";

export const DIASPORA_VALIDATION_SLA =
  "Votre cotisation est généralement validée sous 24 à 48 heures ouvrées.";

export const DIASPORA_DISCLAIMER =
  "Participez à votre tontine et à votre épargne familiale depuis l'étranger. Ce n'est pas un service de transfert d'argent international.";

export const DIASPORA_MANUAL_BANNER = {
  title: "Mode Diaspora — Validation manuelle",
  body: `Après paiement, envoyez votre preuve. ${DIASPORA_VALIDATION_SLA}`,
};

export function buildDiasporaWhatsAppUrl(opts: {
  reference: string;
  tontine: string;
  amount: string;
  method: string;
  userName: string;
}): string {
  const text = [
    "Bonjour HODIX, j'ai besoin d'aide pour valider une cotisation Diaspora.",
    `Référence : ${opts.reference}`,
    `Tontine : ${opts.tontine}`,
    `Montant : ${opts.amount}`,
    `Méthode : ${opts.method}`,
    `Nom HODIX : ${opts.userName}`,
  ].join("\n");
  const phone = DIASPORA_WHATSAPP.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return `${digits.slice(0, 3)} ••• ${digits.slice(-3)}`;
}
