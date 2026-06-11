import { getSupabase } from "@/src/supabase";
import { uid, throwSb, invalidateCache } from "./helpers";
import { getCreditScore } from "./identity";
import { notifyUser } from "./notifications";

const MIN_LOAN_SCORE = 700;
const PARTNER_NAME = "HODIX Finance Partners";

export async function submitLoanApplication(payload: {
  amount_xaf: number;
  duration_months?: number;
  purpose?: string;
  /** @deprecated Ignored — score recalculated server-side. */
  credit_score?: number;
}) {
  const me = await uid();
  const amount = Number(payload.amount_xaf);
  if (!Number.isFinite(amount) || amount < 50_000) {
    throw { status: 400, detail: "Montant minimum : 50 000 XAF." };
  }

  // Never trust client-supplied score — recompute from live profile data.
  invalidateCache(`credit-score-${me}`);
  const { score } = await getCreditScore();
  if (score < MIN_LOAN_SCORE) {
    throw { status: 403, detail: `Score minimum requis : ${MIN_LOAN_SCORE}/1000 (votre score : ${score}).` };
  }

  const { data: existing } = await getSupabase().from("loan_applications")
    .select("id").eq("user_id", me).eq("status", "pending").maybeSingle();
  if (existing) throw { status: 400, detail: "Vous avez déjà une demande en cours." };

  const partnerRef = `HFX-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await getSupabase().from("loan_applications").insert({
    user_id: me,
    amount_xaf: amount,
    duration_months: payload.duration_months ?? 12,
    purpose: payload.purpose ?? null,
    credit_score: score,
    status: "pending",
    partner_ref: partnerRef,
  }).select().single();
  throwSb(error);

  await notifyUser({
    user_id: me,
    title: "Demande de financement envoyée",
    body: `${amount.toLocaleString("fr-FR")} XAF — Réf. ${partnerRef}. ${PARTNER_NAME} examine votre dossier sous 48h.`,
    type: "loan",
  });

  return {
    application_id: data.id,
    partner_ref: partnerRef,
    partner: PARTNER_NAME,
    status: "pending",
    detail: "Demande transmise à notre partenaire financier.",
  };
}

export async function getLoanApplications() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("loan_applications").select("*").eq("user_id", me).order("created_at", { ascending: false });
  throwSb(error);
  return data ?? [];
}
