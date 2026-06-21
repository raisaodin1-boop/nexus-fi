import { getSupabase } from "@/src/supabase";
import { uid, cached, invalidateCache, throwSb } from "./helpers";
import { getCreditScore } from "./identity";
import { notifyUser } from "./notifications";

export const MIN_INSTANT_SCORE = 750;
export const MIN_INSTANT_AMOUNT = 5_000;
export const INSTANT_FEE_PCT = 2.5;

export interface InstantLoanRow {
  id: string;
  amount_xaf: number;
  fee_xaf: number;
  total_due_xaf: number;
  amount_repaid_xaf: number;
  credit_score_at_issue: number;
  status: "active" | "repaid" | "defaulted";
  due_at: string;
  repaid_at: string | null;
  created_at: string;
}

export function maxInstantLoanForScore(score: number): number {
  if (score >= 850) return 200_000;
  if (score >= 800) return 100_000;
  if (score >= 750) return 50_000;
  return 0;
}

export async function syncTrustScoreSnapshot(score: number) {
  const me = await uid();
  await getSupabase().from("profiles").update({ trust_score: score }).eq("id", me);
}

export async function getInstantCreditEligibility() {
  invalidateCache(`credit-score-${await uid()}`);
  const { score } = await getCreditScore();
  await syncTrustScoreSnapshot(score);

  const max_amount_xaf = maxInstantLoanForScore(score);
  const sb = getSupabase();
  const me = await uid();
  const { data: prof } = await sb.from("profiles").select("kyc_status").eq("id", me).single();
  const kycApproved = (prof as any)?.kyc_status === "approved";

  const { data: active } = await sb
    .from("instant_loans")
    .select("id")
    .eq("user_id", me)
    .eq("status", "active")
    .maybeSingle();

  return {
    score,
    max_amount_xaf,
    min_amount_xaf: MIN_INSTANT_AMOUNT,
    fee_pct: INSTANT_FEE_PCT,
    duration_days: 30,
    kyc_approved: kycApproved,
    is_eligible: score >= MIN_INSTANT_SCORE && kycApproved && max_amount_xaf > 0 && !active,
    has_active_loan: !!active,
    min_score: MIN_INSTANT_SCORE,
  };
}

export async function listInstantLoans(): Promise<InstantLoanRow[]> {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("instant_loans")
    .select("*")
    .eq("user_id", me)
    .order("created_at", { ascending: false });
  throwSb(error);
  return (data ?? []).map(mapLoan);
}

export async function getActiveInstantLoan(): Promise<InstantLoanRow | null> {
  const me = await uid();
  return cached(`instant-loan-active-${me}`, 15_000, async () => {
    const { data, error } = await getSupabase()
      .from("instant_loans")
      .select("*")
      .eq("user_id", me)
      .eq("status", "active")
      .maybeSingle();
    throwSb(error);
    return data ? mapLoan(data) : null;
  });
}

export async function disburseInstantLoan(amount_xaf: number) {
  const me = await uid();
  const eligibility = await getInstantCreditEligibility();
  if (!eligibility.is_eligible) {
    if (!eligibility.kyc_approved) {
      throw { status: 403, detail: "KYC approuvé requis pour le crédit instantané." };
    }
    if (eligibility.has_active_loan) {
      throw { status: 400, detail: "Vous avez déjà un crédit instantané actif." };
    }
    throw {
      status: 403,
      detail: `Score minimum ${MIN_INSTANT_SCORE} requis (votre score : ${eligibility.score}).`,
    };
  }

  const amount = Number(amount_xaf);
  if (!Number.isFinite(amount) || amount < MIN_INSTANT_AMOUNT) {
    throw { status: 400, detail: `Montant minimum : ${MIN_INSTANT_AMOUNT.toLocaleString("fr-FR")} XAF.` };
  }
  if (amount > eligibility.max_amount_xaf) {
    throw {
      status: 400,
      detail: `Plafond : ${eligibility.max_amount_xaf.toLocaleString("fr-FR")} XAF pour votre score.`,
    };
  }

  const { data, error } = await getSupabase().rpc("instant_loan_disburse", { p_amount: amount });
  if (error) throw { status: 400, detail: error.message };

  invalidateCache(`instant-loan-active-${me}`);
  invalidateCache(`wallet-${me}`);
  return data as Record<string, unknown>;
}

export async function repayInstantLoan(loanId: string) {
  const me = await uid();
  const { data, error } = await getSupabase().rpc("instant_loan_repay", { p_loan_id: loanId });
  if (error) throw { status: 400, detail: error.message };

  invalidateCache(`instant-loan-active-${me}`);
  invalidateCache(`wallet-${me}`);
  invalidateCache(`credit-score-${me}`);
  return data as Record<string, unknown>;
}

function mapLoan(row: any): InstantLoanRow {
  return {
    id: row.id,
    amount_xaf: Number(row.amount_xaf),
    fee_xaf: Number(row.fee_xaf),
    total_due_xaf: Number(row.total_due_xaf),
    amount_repaid_xaf: Number(row.amount_repaid_xaf ?? 0),
    credit_score_at_issue: Number(row.credit_score_at_issue),
    status: row.status,
    due_at: row.due_at,
    repaid_at: row.repaid_at,
    created_at: row.created_at,
  };
}
