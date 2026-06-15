import { getSupabase } from "@/src/supabase";
import { uid } from "./helpers";
import { getIdentity } from "./identity";
import {
  buildIdentityCertificateHtml,
  buildSavingsCertificateHtml,
  buildTrustScoreCertificateHtml,
} from "@/src/hodix-certificate-pdf";

function verificationCode(seed: string): string {
  return seed.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function getReportHtml(kind: "identity" | "trust-score" | "savings") {
  const me = await uid();
  const sb = getSupabase();
  const code = verificationCode(me);

  if (kind === "identity") {
    const identity = await getIdentity().catch(() => null);
    const user = identity?.user;
    const ts = identity?.trust_score;
    const html = buildIdentityCertificateHtml(
      {
        fullName: user?.full_name ?? "Membre HODIX",
        email: user?.email,
        phone: user?.phone,
        city: user?.city,
        country: user?.country,
        occupation: user?.occupation,
        kycStatus: (await sb.from("profiles").select("kyc_status").eq("id", me).maybeSingle()).data?.kyc_status ?? "non soumis",
        memberSince: user?.created_at
          ? new Date(user.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          : "—",
        score: ts?.score ?? 0,
        scoreLevel: ts?.level ?? "Bronze",
        scoreColor: ts?.color ?? "#1B5E20",
        totalSavings: identity?.totals?.total_savings ?? 0,
        groups: identity?.totals?.groups ?? 0,
        tontines: identity?.totals?.tontines ?? 0,
        currency: identity?.currency ?? "XAF",
      },
      code,
    );
    return { filename: `hodix-identite-${code}.pdf`, html };
  }

  if (kind === "trust-score") {
    const identity = await getIdentity().catch(() => null);
    const ts = identity?.trust_score;
    const html = buildTrustScoreCertificateHtml(
      {
        fullName: identity?.user?.full_name ?? "Membre HODIX",
        score: ts?.score ?? 0,
        level: ts?.level ?? "Bronze",
        color: ts?.color ?? "#CD7F32",
        risk: ts?.risk,
        regularity: ts?.components?.regularity,
        longevity: ts?.components?.longevity,
        participation: ts?.components?.participation,
        engagement: ts?.components?.engagement,
      },
      code,
    );
    return { filename: `hodix-trust-${code}.pdf`, html };
  }

  const { data: profile } = await sb.from("profiles").select("full_name").eq("id", me).maybeSingle();
  const { data: savings } = await sb.from("savings_transactions")
    .select("amount").eq("user_id", me).eq("type", "deposit");
  const total = (savings ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const { count: goals } = await sb.from("savings_goals").select("*", { count: "exact", head: true }).eq("user_id", me);

  const html = buildSavingsCertificateHtml(
    {
      fullName: profile?.full_name ?? "Membre HODIX",
      totalSaved: total,
      depositsCount: savings?.length ?? 0,
      goalsCount: goals ?? 0,
      currency: "XAF",
    },
    code,
  );
  return { filename: `hodix-epargne-${code}.pdf`, html };
}
