import { getSupabase } from "@/src/supabase";
import { uid } from "./helpers";
import { getCreditScore } from "./identity";
import { generateCertificateHtml } from "@/src/certificate-html";

function verificationCode(seed: string): string {
  return seed.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function getReportHtml(kind: "identity" | "trust-score" | "savings") {
  const me = await uid();
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("full_name, created_at, kyc_status").eq("id", me).single();
  const name = profile?.full_name ?? "Membre HODIX";
  const code = verificationCode(me);

  if (kind === "identity") {
    const identity = await getCreditScore().catch(() => null);
    const html = generateCertificateHtml({
      title: "Certificat d'Identité Financière",
      subtitle: "Profil financier vérifié — HODIX",
      holderName: name,
      lines: [
        `Score Hodix : ${identity?.score ?? "—"}/1000 (${identity?.tier?.label ?? "—"})`,
        `KYC : ${profile?.kyc_status ?? "non soumis"}`,
        `Membre depuis : ${profile?.created_at ? new Date(profile.created_at).toLocaleDateString("fr-FR") : "—"}`,
      ],
      footer: "Atteste l'historique financier et la fiabilité communautaire du porteur.",
      verificationCode: code,
    });
    return { filename: `hodix-identite-${code}.pdf`, html };
  }

  if (kind === "trust-score") {
    const identity = await getCreditScore().catch(() => null);
    const html = generateCertificateHtml({
      title: "Certificat Trust Score HODIX",
      subtitle: "Identité financière participative",
      holderName: name,
      lines: [
        `Score actuel : ${identity?.score ?? 0} / 1000`,
        `Régularité : ${identity?.breakdown?.regularity ?? "—"}`,
        `Épargne : ${identity?.breakdown?.savings_volume ?? "—"}`,
        `Réseau : ${identity?.breakdown?.network ?? "—"}`,
        `KYC : ${identity?.breakdown?.kyc ?? "—"}`,
      ],
      footer: "Score basé sur l'historique d'épargne et de contribution communautaire.",
      verificationCode: code,
    });
    return { filename: `hodix-trust-${code}.pdf`, html };
  }

  const { data: savings } = await sb.from("savings_transactions")
    .select("amount").eq("user_id", me).eq("type", "deposit");
  const total = (savings ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const { count: goals } = await sb.from("savings_goals").select("*", { count: "exact", head: true }).eq("user_id", me);

  const html = generateCertificateHtml({
    title: "Certificat d'Épargne",
    subtitle: "Historique d'épargne personnelle",
    holderName: name,
    lines: [
      `Total épargné : ${Math.round(total).toLocaleString("fr-FR")} XAF`,
      `Nombre de dépôts : ${savings?.length ?? 0}`,
      `Objectifs créés : ${goals ?? 0}`,
    ],
    footer: "Atteste l'engagement d'épargne du porteur sur la plateforme HODIX.",
    verificationCode: code,
  });
  return { filename: `hodix-epargne-${code}.pdf`, html };
}
