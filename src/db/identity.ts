import { getSupabase } from "@/src/supabase";
import { uid, cached, invalidateCache } from "./helpers";
import {
  scoreRegularity, scoreSavingsVolume, scoreSeniority, scoreNetwork, scoreKyc,
  computeScore, generateTips, getTier,
  type CreditScoreResult, type MonthlySnapshot,
} from "@/src/credit-score";
import { computeProgression, trustLevelFromScore } from "@/src/identity-progression";
import { enrichTips } from "@/src/insight-actions";

export async function addIdentityEvent(user_id: string, event_type: string, points: number) {
  await getSupabase().from("identity_events").insert({ user_id, event_type, points_delta: points });
}

async function loadProgressionData(me: string, createdAt: string) {
  const sb = getSupabase();
  const [savingsTxRes, contribRes, walletTxRes] = await Promise.all([
    sb.from("savings_transactions").select("created_at, amount").eq("user_id", me).gt("amount", 0),
    sb.from("tontine_contributions").select("created_at").eq("user_id", me),
    sb.from("wallet_transactions").select("created_at").eq("user_id", me).eq("type", "topup"),
  ]);
  return computeProgression({
    createdAt,
    savingsDeposits: (savingsTxRes.data ?? []).map((r: any) => ({ created_at: r.created_at })),
    tontineContributions: (contribRes.data ?? []).map((r: any) => ({ created_at: r.created_at })),
    walletTopups: (walletTxRes.data ?? []).map((r: any) => ({ created_at: r.created_at })),
  });
}

/** Keep identity_scores in sync for gates (public tontines) — derived from real activity only. */
async function syncIdentityScore(userId: string, displayScore: number) {
  try {
    await getSupabase().from("identity_scores").upsert({
      user_id: userId,
      score: displayScore,
      updated_at: new Date().toISOString(),
    });
  } catch { /* non-blocking */ }
}

export async function getIdentity() {
  const me = await uid();
  return cached(`identity-${me}`, 90_000, async () => {
    const { data: sbUser } = await getSupabase().auth.getSession();
    const [profileRes, savingsRes, tontineRes, assocRes, coopRes] = await Promise.all([
      getSupabase().from("profiles").select("*").eq("id", me).single(),
      getSupabase().from("savings_goals").select("current_amount").eq("user_id", me),
      getSupabase().from("tontine_members").select("tontine_id").eq("user_id", me),
      getSupabase().from("association_members").select("association_id").eq("user_id", me),
      getSupabase().from("cooperative_members").select("cooperative_id").eq("user_id", me),
    ]);

    const profile = profileRes.data ?? {};
    const totalSavings = (savingsRes.data ?? []).reduce((s: number, g: any) => s + Number(g.current_amount), 0);
    const tontineCount = tontineRes.data?.length ?? 0;
    const assocCount = assocRes.data?.length ?? 0;
    const coopCount = coopRes.data?.length ?? 0;
    const groupCount = tontineCount + assocCount + coopCount;

    const createdAt = sbUser.session?.user?.created_at ?? new Date().toISOString();
    const progression = await loadProgressionData(me, createdAt);
    await syncIdentityScore(me, progression.displayScore);
    const levelConfig = trustLevelFromScore(progression.displayScore, progression.platinum_eligible);

    const participation = Math.min(100, groupCount * 15);
    const longevity = Math.min(100, progression.metrics.accountAgeDays / 10.95);
    const regularity = Math.min(100, progression.metrics.regularityPct);
    const engagement = Math.min(100, (progression.metrics.depositCount + progression.metrics.contributionCount) * 3);

    const tips = progression.level_key === "platinum"
      ? ["Félicitations ! Vous avez atteint le niveau Platinum grâce à une activité régulière sur plusieurs années."]
      : progression.level_key === "gold"
      ? [
          "Le niveau Platinum exige 3 ans d'ancienneté et des cotisations régulières.",
          "Continuez vos dépôts mensuels — chaque transaction compte pour 1 point.",
        ]
      : progression.displayScore < 120
      ? [
          "Effectuez un dépôt d'épargne pour gagner 1 point (tout montant).",
          "Rejoignez une tontine et cotisez régulièrement pour progresser.",
        ]
      : [
          "Maintenez au moins une cotisation par mois pour gravir les échelons.",
          "Complétez votre KYC pour renforcer votre crédibilité.",
        ];

    return {
      user: {
        full_name: (profile as any).full_name ?? sbUser.session?.user?.user_metadata?.full_name ?? "",
        email: sbUser.session?.user?.email ?? "",
        phone: (profile as any).phone ?? null, country: (profile as any).country ?? null,
        city: (profile as any).city ?? null, occupation: (profile as any).occupation ?? null,
        created_at: createdAt,
      },
      trust_score: {
        score: progression.displayScore,
        score_max: progression.scoreMax,
        level: levelConfig.level,
        risk: levelConfig.risk,
        color: levelConfig.color,
        components: {
          activity_points: progression.activityPoints,
          deposit_count: progression.metrics.depositCount,
          contribution_count: progression.metrics.contributionCount,
          signup_bonus: progression.metrics.signupBonus,
          regularity,
          longevity,
          participation,
          engagement,
        },
        tips,
        stats: {
          total_saved: totalSavings,
          tontines: tontineCount,
          associations: assocCount,
          cooperatives: coopCount,
          account_age_days: progression.metrics.accountAgeDays,
          active_months: progression.metrics.activeMonths,
        },
        progression,
      },
      totals: {
        total_savings: totalSavings,
        deposits_count: progression.metrics.depositCount,
        tontine_contributions: progression.metrics.contributionCount,
        groups: groupCount,
        tontines: tontineCount, associations: assocCount, cooperatives: coopCount,
      },
      currency: "XAF",
    };
  });
}

export async function getIdentityProfile() {
  const me = await uid();
  const { data: sbUser } = await getSupabase().auth.getSession();
  const createdAt = sbUser.session?.user?.created_at ?? new Date().toISOString();
  const progression = await loadProgressionData(me, createdAt);
  await syncIdentityScore(me, progression.displayScore);

  const { data: events } = await getSupabase()
    .from("identity_events")
    .select("*")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(20);

  const recentEvents = (events ?? []).filter(
    (e: any) => !["credit_score_snapshot", "fraud_flag"].includes(e.event_type),
  ).slice(0, 10);

  return {
    profile: {
      points: progression.activityPoints,
      display_points: progression.activityPoints,
      level: progression.level,
      level_key: progression.level_key,
      level_color: progression.level_color,
      next_level: progression.next_level,
      points_to_next: progression.points_to_next,
      progress_within_level_pct: progression.progress_within_level_pct,
      events_recorded: recentEvents.length,
      platinum_eligible: progression.platinum_eligible,
      platinum_requirements: progression.platinum_requirements,
      deposit_count: progression.metrics.depositCount,
      contribution_count: progression.metrics.contributionCount,
    },
    recent_events: recentEvents,
  };
}

export async function getTrustScore() {
  const me = await uid();
  return cached(`trust-score-${me}`, 120_000, async () => {
    const identity = await getIdentity();
    return identity.trust_score;
  });
}

export async function getCreditScore(): Promise<CreditScoreResult> {
  const me = await uid();
  return cached(`credit-score-${me}`, 90_000, async () => {
    const sb = getSupabase();
    const [profileRes, contribRes, savingsRes, tontineMemRes, assocMemRes, coopMemRes, createdTontinesRes, createdAssocRes, createdCoopRes, kycRes] = await Promise.all([
      sb.from("profiles").select("created_at, kyc_status").eq("id", me).single(),
      sb.from("tontine_contributions").select("created_at, tontine_id").eq("user_id", me).order("created_at", { ascending: true }),
      sb.from("savings_goals").select("current_amount").eq("user_id", me),
      sb.from("tontine_members").select("tontine_id, joined_at").eq("user_id", me),
      sb.from("association_members").select("association_id").eq("user_id", me),
      sb.from("cooperative_members").select("cooperative_id").eq("user_id", me),
      sb.from("tontines").select("id").eq("owner_id", me),
      sb.from("associations").select("id").eq("owner_id", me),
      sb.from("cooperatives").select("id").eq("owner_id", me),
      sb.from("kyc_submissions").select("status").eq("user_id", me).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data ?? {};
    const contributions = contribRes.data ?? [];
    const totalSavings = (savingsRes.data ?? []).reduce((s: number, g: any) => s + Number(g.current_amount), 0);
    const groupsJoined = (tontineMemRes.data?.length ?? 0) + (assocMemRes.data?.length ?? 0) + (coopMemRes.data?.length ?? 0);
    const groupsCreated = (createdTontinesRes.data?.length ?? 0) + (createdAssocRes.data?.length ?? 0) + (createdCoopRes.data?.length ?? 0);
    const kycStatus = kycRes.data?.status ?? (profile as any).kyc_status ?? null;
    const createdAt = (profile as any).created_at ?? new Date().toISOString();
    const memberSince = (tontineMemRes.data ?? []).reduce((earliest: string, m: any) => {
      const d = m.joined_at ?? createdAt; return d < earliest ? d : earliest;
    }, createdAt);

    const breakdown = {
      regularity:     scoreRegularity(contributions, memberSince, 30),
      savings_volume: scoreSavingsVolume(totalSavings),
      seniority:      scoreSeniority(createdAt),
      network:        scoreNetwork(groupsJoined, groupsCreated),
      kyc:            scoreKyc(kycStatus),
    };
    const score = computeScore(breakdown);
    const tier  = getTier(score);

    try {
      await sb.from("identity_events").insert({
        user_id: me, event_type: "credit_score_snapshot",
        points_delta: 0, created_at: new Date().toISOString(),
        metadata: { score },
      } as any);
    } catch { /* non-blocking */ }

    return { score, breakdown, tier, is_loan_eligible: score >= 700, tips: generateTips(breakdown), computed_at: new Date().toISOString() } as CreditScoreResult & { tips: string[] };
  });
}

export async function getCreditScoreHistory(): Promise<MonthlySnapshot[]> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("identity_events").select("points_delta, metadata, created_at")
    .eq("user_id", me).eq("event_type", "credit_score_snapshot").order("created_at", { ascending: true });
  const byMonth: Record<string, number> = {};
  for (const row of data ?? []) {
    const month = (row.created_at as string).slice(0, 7);
    const metaScore = (row as any).metadata?.score;
    byMonth[month] = typeof metaScore === "number" ? metaScore : row.points_delta;
  }
  return Object.entries(byMonth).map(([month, score]) => ({ month, score }));
}

export async function getInsights() {
  const me = await uid();
  return cached(`insights-${me}`, 120_000, async () => {
    const identity = await getIdentity();
    const tips = identity.trust_score.tips ?? [];
    return { items: enrichTips(tips) };
  });
}

export async function getFinancialAnalytics() {
  const me = await uid();
  const sb = getSupabase();
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  const [savingsTxRes, tontineContribRes, savingsGoalsRes, identityEventsRes] = await Promise.all([
    sb.from("savings_transactions").select("amount, type, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("tontine_contributions").select("amount, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("savings_goals").select("current_amount, target_amount, created_at, name").eq("user_id", me),
    sb.from("identity_events").select("points_delta, metadata, event_type, created_at").eq("user_id", me).eq("event_type", "credit_score_snapshot").order("created_at", { ascending: true }).limit(24),
  ]);

  const savingsTx = savingsTxRes.data ?? [];
  const tontineContribs = tontineContribRes.data ?? [];
  const goals = savingsGoalsRes.data ?? [];

  const cashFlow: { label: string; inflow: number; outflow: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    const monthTx = savingsTx.filter((t: any) => { const cd = new Date(t.created_at); return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth(); });
    const monthContribs = tontineContribs.filter((t: any) => { const cd = new Date(t.created_at); return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth(); });
    const inflow = monthTx.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const outflow = monthTx.filter((t: any) => t.type !== "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0) + monthContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
    cashFlow.push({ label, inflow, outflow });
  }

  const totalSaved = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);
  const totalContributed = tontineContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const trustHistory = (identityEventsRes.data ?? []).map((e: any) => ({
    label: new Date(e.created_at).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
    score: Number(e.metadata?.score ?? e.points_delta ?? 0),
  }));
  const projections = goals.filter((g: any) => g.target_amount > 0).map((g: any) => {
    const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
    const depositRate = savingsTx.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0) / 12;
    const remaining = Number(g.target_amount) - Number(g.current_amount);
    const monthsToGo = depositRate > 0 ? Math.ceil(remaining / depositRate) : null;
    return { name: g.name, pct: Math.round(pct), months_to_go: monthsToGo, target: Number(g.target_amount), current: Number(g.current_amount) };
  });
  const rawRows = [
    ...savingsTx.map((t: any) => ({ date: t.created_at, type: t.type, amount: t.amount, category: "Épargne" })),
    ...tontineContribs.map((t: any) => ({ date: t.created_at, type: "contribution", amount: t.amount, category: "Tontine" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    cash_flow: cashFlow,
    donut: { saved: totalSaved, contributed: totalContributed, total: totalSaved + totalContributed },
    trust_history: trustHistory, projections, raw_rows: rawRows,
  };
}

export async function getRegionalRanking(country: string) {
  const sb = getSupabase();
  const { data: profiles } = await sb.from("profiles").select("id, full_name, country").eq("country", country).limit(200);
  if (!profiles?.length) return { ranking: [], my_rank: null, is_pillar: false, total_users: 0 };

  const me = await uid();
  const userIds = profiles.map((p: any) => p.id);
  const { data: events } = await sb.from("identity_events")
    .select("user_id, points_delta, metadata, created_at").in("user_id", userIds)
    .eq("event_type", "credit_score_snapshot").order("created_at", { ascending: false });

  const scoreMap: Record<string, number> = {};
  for (const e of (events ?? []) as any[]) {
    if (!(e.user_id in scoreMap)) {
      scoreMap[e.user_id] = Number(e.metadata?.score ?? e.points_delta ?? 0);
    }
  }

  const ranked = profiles
    .map((p: any) => ({ id: p.id, name: p.full_name, score: scoreMap[p.id] ?? 0, country: p.country }))
    .sort((a, b) => b.score - a.score)
    .map((u, i) => {
      const parts = u.name?.trim().split(" ") ?? ["Membre"];
      const masked = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : u.name;
      return { rank: i + 1, display_name: masked, score: u.score, is_me: u.id === me };
    });

  const myEntry = ranked.find(r => r.is_me);
  const myRank = myEntry?.rank ?? null;
  const isPillar = myRank !== null && myRank <= Math.ceil(ranked.length * 0.05);

  if (isPillar) {
    const { count } = await sb.from("identity_events").select("*", { count: "exact", head: true }).eq("user_id", me).eq("event_type", "pillar_earned");
    if ((count ?? 0) === 0) {
      await sb.from("identity_events").insert({ user_id: me, event_type: "pillar_earned", points_delta: 0 });
      await sb.from("notifications").insert({ user_id: me, title: "🏆 Pilier de la communauté !", body: `Vous faites partie du top 5% des épargnants de votre région.`, type: "pillar_earned" });
    }
  }

  return { ranking: ranked.slice(0, 10), my_rank: myRank, total_users: ranked.length, is_pillar: isPillar };
}

export async function mintCertificateHash(docId: string, docType: string): Promise<{ hash: string; verify_url: string; polygon_stub: string }> {
  const me = await uid();
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("full_name").eq("id", me).single();
  const payload = `${me}:${docId}:${docType}:${profile?.full_name ?? ""}:${new Date().toISOString()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hexHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const verifyUrl = `https://www.hodix.app/verify/${hexHash}`;
  const chainRef = `0x${hexHash.slice(0, 40)}`;

  await sb.from("identity_certificates").upsert({
    user_id: me,
    doc_id: docId,
    doc_type: docType,
    content_hash: hexHash,
    verify_url: verifyUrl,
    chain_ref: chainRef,
  }, { onConflict: "content_hash" });

  await sb.from("identity_events").insert({
    user_id: me, event_type: "nft_certificate", points_delta: 0,
    metadata: { doc_id: docId, doc_type: docType, hash: hexHash, chain_ref: chainRef },
  } as any);

  return { hash: hexHash, verify_url: verifyUrl, polygon_stub: chainRef };
}
