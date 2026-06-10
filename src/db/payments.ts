import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { contributeTontineSecure } from "./tontines";

type MobileMoneyPayload = {
  tontine_id?: string;
  goal_id?: string;
  amount_xaf: number;
  provider: string;
  phone: string;
  reference?: string;
};

function paymentMeta(payload: MobileMoneyPayload) {
  return JSON.stringify({
    kind: payload.tontine_id ? "tontine_contribution" : "savings_deposit",
    tontine_id: payload.tontine_id ?? null,
    goal_id: payload.goal_id ?? null,
    provider: payload.provider,
    phone: payload.phone,
  });
}

function parseMeta(description: string | null) {
  if (!description) return null;
  try {
    return JSON.parse(description) as {
      kind?: string;
      tontine_id?: string | null;
      goal_id?: string | null;
      provider?: string;
      phone?: string;
    };
  } catch {
    return null;
  }
}

async function assertTontineMember(tontineId: string, userId: string) {
  const { count } = await getSupabase()
    .from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontineId)
    .eq("user_id", userId);
  if (!count) throw { status: 403, detail: "Non membre de cette tontine." };
}

async function resolveContributionAmount(tontineId: string, fallback: number) {
  const { data: tontine } = await getSupabase()
    .from("tontines")
    .select("amount_per_cycle, contribution_amount")
    .eq("id", tontineId)
    .single();
  if (!tontine) throw { status: 404, detail: "Tontine introuvable." };
  const amount = Number(tontine.amount_per_cycle ?? tontine.contribution_amount ?? fallback);
  if (!amount || amount <= 0) throw { status: 400, detail: "Montant de cotisation invalide." };
  return amount;
}

export async function initiateMobileMoneyPayment(payload: MobileMoneyPayload) {
  const me = await uid();
  const provider = (payload.provider ?? "").toLowerCase();
  const phone = (payload.phone ?? "").trim();

  if (!payload.amount_xaf || !provider || !phone) {
    throw { status: 400, detail: "amount_xaf, provider et phone requis." };
  }
  if (!["orange", "mtn"].includes(provider)) {
    throw { status: 400, detail: "Provider invalide (orange|mtn)." };
  }
  if (!payload.tontine_id && !payload.goal_id) {
    throw { status: 400, detail: "tontine_id ou goal_id requis." };
  }

  let amount = Number(payload.amount_xaf);
  if (payload.tontine_id) {
    await assertTontineMember(payload.tontine_id, me);
    amount = await resolveContributionAmount(payload.tontine_id, amount);
  }

  const paymentId = crypto.randomUUID();
  const { error } = await getSupabase().from("payments").insert({
    id: paymentId,
    user_id: me,
    amount,
    currency: "XAF",
    direction: "out",
    description: paymentMeta({ ...payload, amount_xaf: amount }),
    status: "pending_mm",
  });
  throwSb(error);

  return {
    payment_id: paymentId,
    status: "pending_mm",
    message: `Demande envoyée au ${phone}. Validez puis entrez le code de confirmation.`,
    reference_prefix: paymentId.slice(0, 8).toUpperCase(),
  };
}

export async function confirmMobileMoneyPayment(payload: MobileMoneyPayload) {
  const me = await uid();
  const reference = (payload.reference ?? "").trim();
  if (!reference) throw { status: 400, detail: "Code de référence obligatoire." };

  const { data: payment, error } = await getSupabase()
    .from("payments")
    .select("*")
    .eq("user_id", me)
    .eq("status", "pending_mm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwSb(error);
  if (!payment) throw { status: 404, detail: "Aucun paiement en attente trouvé." };

  const meta = parseMeta(payment.description);
  const tontineId = payload.tontine_id ?? meta?.tontine_id ?? undefined;
  const goalId = payload.goal_id ?? meta?.goal_id ?? undefined;
  const amount = Number(payment.amount);

  const { error: updErr } = await getSupabase()
    .from("payments")
    .update({
      status: "succeeded",
      description: `${payment.description ?? ""} · ref:${reference}`,
    })
    .eq("id", payment.id);
  throwSb(updErr);

  if (tontineId) {
    await assertTontineMember(tontineId, me);
    await contributeTontineSecure(tontineId, amount);
    await getSupabase().from("notifications").insert({
      user_id: me,
      title: "Paiement Mobile Money confirmé",
      body: `Cotisation de ${amount.toLocaleString("fr-FR")} XAF enregistrée (réf: ${reference}).`,
      type: "success",
    });
  }

  return { payment_id: payment.id, status: "succeeded", tontine_id: tontineId, goal_id: goalId, amount_xaf: amount };
}

export async function createContributionCheckout(payload: { tontine_id?: string; amount_xaf?: number }) {
  const me = await uid();
  const tontineId = (payload.tontine_id ?? "").trim();
  if (!tontineId) throw { status: 400, detail: "tontine_id requis." };

  await assertTontineMember(tontineId, me);
  const amount = await resolveContributionAmount(tontineId, Number(payload.amount_xaf ?? 0));

  const paymentId = crypto.randomUUID();
  const { error } = await getSupabase().from("payments").insert({
    id: paymentId,
    user_id: me,
    amount,
    currency: "XAF",
    direction: "out",
    description: JSON.stringify({ kind: "tontine_contribution", tontine_id: tontineId, method: "stripe" }),
    status: "pending",
  });
  throwSb(error);

  throw {
    status: 501,
    detail: "Paiement carte bancaire bientôt disponible. Utilisez votre portefeuille Hodix ou Mobile Money.",
  };
}

export async function getPaymentStatus(paymentId: string) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("payments")
    .select("id, status, amount, currency, description, created_at")
    .eq("id", paymentId)
    .eq("user_id", me)
    .maybeSingle();
  throwSb(error);
  if (!data) throw { status: 404, detail: "Paiement introuvable." };
  return data;
}
