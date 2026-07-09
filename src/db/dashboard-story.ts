import { getSupabase } from "@/src/supabase";
import { uid } from "./helpers";
import { getIdentity } from "./identity";

export type DashboardAction = {
  id: string;
  title: string;
  subtitle?: string;
  route: string;
  priority: number;
};

export type DashboardStory = {
  greeting_name: string;
  trust_score: number;
  trust_level: string;
  trust_quality: string;
  score_delta_today: number;
  users_below_pct: number;
  top_pct: number;
  savings_days: number;
  groups_count: number;
  primary_goal: {
    id: string;
    name: string;
    progress_pct: number;
    current_amount: number;
    target_amount: number;
  } | null;
  next_contribution: {
    label: string;
    tontine_name: string;
    due_label: string;
    tontine_id: string;
  } | null;
  recommended_actions: DashboardAction[];
  wallet_balance_xaf: number;
};

function trustQualityLabel(score: number): string {
  if (score >= 700) return "Excellent";
  if (score >= 500) return "Très bon";
  if (score >= 300) return "Bon";
  if (score >= 150) return "En progression";
  return "Débutant";
}

function dueLabel(deadline: Date | null): string {
  if (!deadline) return "Bientôt";
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays <= 7) return `Dans ${diffDays} jours`;
  return deadline.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

async function trustPercentile(myScore: number) {
  const { data: rows } = await getSupabase().from("identity_scores").select("score");
  const scores = (rows ?? []).map((r) => Number((r as { score?: number }).score ?? 0)).filter((n) => n > 0);
  if (scores.length < 2) {
    return { users_below_pct: 50, top_pct: 50 };
  }
  const below = scores.filter((s) => s < myScore).length;
  const usersBelowPct = Math.round((below / scores.length) * 100);
  const topPct = Math.max(1, Math.min(99, 100 - usersBelowPct));
  return { users_below_pct: usersBelowPct, top_pct: topPct };
}

async function scoreDeltaToday(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await getSupabase()
    .from("identity_events")
    .select("points_delta")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString());
  return (data ?? []).reduce((s, e) => s + Number((e as { points_delta?: number }).points_delta ?? 0), 0);
}

async function savingsDays(userId: string, accountAgeDays: number): Promise<number> {
  const { data: firstTx } = await getSupabase()
    .from("savings_transactions")
    .select("created_at")
    .eq("user_id", userId)
    .gt("amount", 0)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstTx?.created_at) {
    return Math.max(1, Math.floor((Date.now() - new Date(firstTx.created_at).getTime()) / 86400000));
  }
  return Math.max(0, accountAgeDays);
}

async function nextContribution(userId: string) {
  const { data: memberships } = await getSupabase()
    .from("tontine_members")
    .select("tontine_id, last_paid_cycle, tontines(name, current_cycle, cycle_deadline)")
    .eq("user_id", userId);

  type Row = {
    tontine_id: string;
    last_paid_cycle?: number | null;
    tontines?: { name?: string; current_cycle?: number; cycle_deadline?: string | null } | null;
  };

  const pending = ((memberships ?? []) as Row[]).filter((m) => {
    const cycle = m.tontines?.current_cycle ?? 1;
    return (m.last_paid_cycle ?? 0) < cycle;
  });

  if (!pending.length) return null;

  pending.sort((a, b) => {
    const da = a.tontines?.cycle_deadline ? new Date(a.tontines.cycle_deadline).getTime() : Infinity;
    const db = b.tontines?.cycle_deadline ? new Date(b.tontines.cycle_deadline).getTime() : Infinity;
    return da - db;
  });

  const pick = pending[0];
  const deadline = pick.tontines?.cycle_deadline ? new Date(pick.tontines.cycle_deadline) : null;
  return {
    label: "Prochaine cotisation",
    tontine_name: pick.tontines?.name ?? "Tontine",
    due_label: dueLabel(deadline),
    tontine_id: pick.tontine_id,
  };
}

function buildRecommendedActions(input: {
  kycStatus?: string | null;
  hasGoals: boolean;
  walletBalance: number;
}): DashboardAction[] {
  const actions: DashboardAction[] = [];
  const kyc = (input.kycStatus ?? "").toLowerCase();
  if (!["approved", "verified"].includes(kyc)) {
    actions.push({
      id: "kyc",
      title: "Compléter KYC",
      subtitle: "Renforcez votre identité vérifiable",
      route: "/kyc",
      priority: 1,
    });
  }
  if (!input.hasGoals) {
    actions.push({
      id: "new_savings",
      title: "Créer une nouvelle épargne",
      subtitle: "Définissez un objectif concret",
      route: "/savings/create",
      priority: 2,
    });
  }
  actions.push({
    id: "referral",
    title: "Inviter un ami",
    subtitle: "Développez votre réseau HODIX",
    route: "/referral",
    priority: 3,
  });
  if (input.walletBalance < 5000) {
    actions.push({
      id: "deposit",
      title: "Déposer 5 000 FCFA",
      subtitle: "Alimentez votre wallet HODIX",
      route: "/wallet/topup",
      priority: 4,
    });
  } else {
    actions.push({
      id: "wallet",
      title: "HODIX Wallet",
      subtitle: "Envoyer, recevoir, épargner",
      route: "/wallet",
      priority: 4,
    });
  }
  actions.push({
    id: "advisor",
    title: "Conseil HODIX AI",
    subtitle: "Optimisez épargne et score",
    route: "/advisor",
    priority: 5,
  });
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

export async function getDashboardStory(): Promise<DashboardStory> {
  const me = await uid();
  const sb = getSupabase();

  const [identity, profileRes, goalsRes, walletRes, deltaToday, nextContrib] = await Promise.all([
    getIdentity(),
    sb.from("profiles").select("full_name, kyc_status").eq("id", me).maybeSingle(),
    sb.from("savings_goals").select("id, name, current_amount, target_amount, is_active").eq("user_id", me).eq("is_active", true),
    sb.from("wallets").select("balance_xaf").eq("user_id", me).maybeSingle(),
    scoreDeltaToday(me),
    nextContribution(me),
  ]);

  const ts = identity.trust_score;
  const percentile = await trustPercentile(ts.score);
  const goals = (goalsRes.data ?? []) as { id: string; name: string; current_amount: number; target_amount: number }[];
  let primaryGoal: DashboardStory["primary_goal"] = null;
  if (goals.length) {
    const ranked = [...goals].sort((a, b) => {
      const pa = Number(a.target_amount) > 0 ? Number(a.current_amount) / Number(a.target_amount) : 0;
      const pb = Number(b.target_amount) > 0 ? Number(b.current_amount) / Number(b.target_amount) : 0;
      return pb - pa;
    });
    const g = ranked[0];
    const target = Number(g.target_amount) || 0;
    const current = Number(g.current_amount) || 0;
    primaryGoal = {
      id: g.id,
      name: g.name,
      current_amount: current,
      target_amount: target,
      progress_pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    };
  }

  const fullName = (profileRes.data as { full_name?: string } | null)?.full_name ?? identity.user.full_name ?? "";
  const firstName = fullName.trim().split(/\s+/)[0] || "Membre";
  const accountAge = ts.stats?.account_age_days ?? 0;
  const savingsDaysCount = await savingsDays(me, accountAge);

  const walletBalance = Number((walletRes.data as { balance_xaf?: number } | null)?.balance_xaf ?? 0);
  const kycStatus = (profileRes.data as { kyc_status?: string } | null)?.kyc_status ?? null;

  return {
    greeting_name: firstName,
    trust_score: ts.score,
    trust_level: ts.level,
    trust_quality: trustQualityLabel(ts.score),
    score_delta_today: deltaToday,
    users_below_pct: percentile.users_below_pct,
    top_pct: percentile.top_pct,
    savings_days: savingsDaysCount,
    groups_count: identity.totals.groups,
    primary_goal: primaryGoal,
    next_contribution: nextContrib,
    recommended_actions: buildRecommendedActions({
      kycStatus,
      hasGoals: goals.length > 0,
      walletBalance,
    }),
    wallet_balance_xaf: walletBalance,
  };
}
