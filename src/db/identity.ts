import { getSupabase } from "@/src/supabase";
import { uid, cached, invalidateCache } from "./helpers";
import {
  scoreRegularity, scoreSavingsVolume, scoreSeniority, scoreNetwork, scoreKyc,
  computeScore, generateTips, getTier,
  type CreditScoreResult, type MonthlySnapshot,
} from "@/src/credit-score";

export async function addIdentityEvent(user_id: string, event_type: string, points: number) {
  await getSupabase().from("identity_events").insert({ user_id, event_type, points_delta: points });
}

export async function getIdentity() {
  const me = await uid();
  return cached(`identity-${me}`, 90_000, async () => {
    const { data: sbUser } = await getSupabase().auth.getSession();
    const [profileRes, savingsRes, tontineRes, assocRes, coopRes, eventsRes, txRes] = await Promise.all([
      getSupabase().from("profiles").select("*").eq("id", me).single(),
      getSupabase().from("savings_goals").select("current_amount").eq("user_id", me),
      getSupabase().from("tontine_members").select("tontine_id").eq("user_id", me),
      getSupabase().from("association_members").select("association_id").eq("user_id", me),
      getSupabase().from("cooperative_members").select("cooperative_id").eq("user_id", me),
      getSupabase().from("identity_events").select("points_delta, event_type, created_at").eq("user_id", me),
      getSupabase().from("tontine_contributions").select("amount").eq("user_id", me),
    ]);

    const profile = profileRes.data ?? {};
    const totalSavings = (savingsRes.data ?? []).reduce((s: number, g: any) => s + Number(g.current_amount), 0);
    const tontineCount = tontineRes.data?.length ?? 0;
    const assocCount = assocRes.data?.length ?? 0;
    const coopCount = coopRes.data?.length ?? 0;
    const groupCount = tontineCount + assocCount + coopCount;
    const tontineContribs = (txRes.data ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);

    const events = eventsRes.data ?? [];
    const signupBonus = events.filter((e: any) => e.event_type === "signup_bonus").reduce((s: number, e: any) => s + e.points_delta, 0);
    const txPoints = events.filter((e: any) => e.event_type !== "signup_bonus" && e.event_type !== "yearly_bonus").reduce((s: number, e: any) => s + e.points_delta, 0);

    const createdAt = sbUser.session?.user?.created_at ?? new Date().toISOString();
    const ageDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
    const yearlyBonus = Math.floor(ageDays / 365) * 5;
    const score = Math.min(1000, signupBonus + txPoints + yearlyBonus);

    const levelConfig = score >= 810 ? { level: "Platinum", color: "#8B5CF6", risk: "Très faible" }
      : score >= 610 ? { level: "Or", color: "#D4AF37", risk: "Faible" }
      : score >= 310 ? { level: "Argent", color: "#8B9EB0", risk: "Modéré" }
      : { level: "Bronze", color: "#CD7F32", risk: "Standard" };

    const participation = Math.min(100, groupCount * 20);
    const longevity = Math.min(100, ageDays / 3.65);
    const regularity = Math.min(100, (events.filter((e: any) => e.event_type === "tontine_contribution").length) * 10);
    const engagement = Math.min(100, events.length * 5);

    return {
      user: {
        full_name: (profile as any).full_name ?? sbUser.session?.user?.user_metadata?.full_name ?? "",
        email: sbUser.session?.user?.email ?? "",
        phone: (profile as any).phone ?? null, country: (profile as any).country ?? null,
        city: (profile as any).city ?? null, occupation: (profile as any).occupation ?? null,
        created_at: createdAt,
      },
      trust_score: {
        score, score_max: 1000, level: levelConfig.level, risk: levelConfig.risk, color: levelConfig.color,
        components: { signup_bonus: signupBonus, transaction_points: txPoints, yearly_bonus: yearlyBonus, regularity, longevity, participation, engagement },
        tips: score < 100
          ? ["Effectuez des contributions régulières pour augmenter votre score", "Rejoignez une tontine ou association pour booster votre identité"]
          : score < 500
          ? ["Continuez vos contributions régulièrement", "Complétez votre profil pour +10 points"]
          : ["Excellent score ! Partagez vos certificats avec confiance"],
        stats: { total_saved: totalSavings, tontines: tontineCount, associations: assocCount, cooperatives: coopCount, account_age_days: ageDays },
      },
      totals: {
        total_savings: totalSavings,
        deposits_count: events.filter((e: any) => e.event_type === "savings_deposit").length,
        tontine_contributions: tontineContribs, groups: groupCount,
        tontines: tontineCount, associations: assocCount, cooperatives: coopCount,
      },
      currency: "XAF",
    };
  });
}

export async function getIdentityProfile() {
  const me = await uid();
  const { data: events } = await getSupabase()
    .from("identity_events").select("*").eq("user_id", me).order("created_at", { ascending: false });
  const allEvents = events ?? [];
  const points = allEvents.reduce((s: number, e: any) => s + e.points_delta, 0);
  const displayPoints = Math.round(points * 10) / 10;

  const tierConfig = points >= 81 ? { level: "Platinum", level_key: "platinum", color: "#8B5CF6", next: null, nextPts: 0, range: [81, 1000] }
    : points >= 61 ? { level: "Or", level_key: "gold", color: "#D4AF37", next: "Platinum", nextPts: 81, range: [61, 80] }
    : points >= 31 ? { level: "Argent", level_key: "silver", color: "#8B9EB0", next: "Or", nextPts: 61, range: [31, 60] }
    : { level: "Bronze", level_key: "bronze", color: "#CD7F32", next: "Argent", nextPts: 31, range: [0, 30] };

  const [lo, hi] = tierConfig.range;
  const pct = hi > lo ? Math.min(100, ((points - lo) / (hi - lo)) * 100) : 100;

  return {
    profile: {
      points, display_points: displayPoints, level: tierConfig.level, level_key: tierConfig.level_key,
      level_color: tierConfig.color, next_level: tierConfig.next,
      points_to_next: tierConfig.next ? Math.max(0, tierConfig.nextPts - points) : 0,
      progress_within_level_pct: Math.max(0, pct), events_recorded: allEvents.length,
    },
    recent_events: allEvents.slice(0, 10),
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
        points_delta: score, created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return { score, breakdown, tier, is_loan_eligible: score >= 700, tips: generateTips(breakdown), computed_at: new Date().toISOString() } as CreditScoreResult & { tips: string[] };
  });
}

export async function getCreditScoreHistory(): Promise<MonthlySnapshot[]> {
  const me = await uid();
  const { data } = await getSupabase()
    .from("identity_events").select("points_delta, created_at")
    .eq("user_id", me).eq("event_type", "credit_score_snapshot").order("created_at", { ascending: true });
  const byMonth: Record<string, number> = {};
  for (const row of data ?? []) {
    const month = (row.created_at as string).slice(0, 7);
    byMonth[month] = row.points_delta;
  }
  return Object.entries(byMonth).map(([month, score]) => ({ month, score }));
}

export async function getInsights() {
  const me = await uid();
  return cached(`insights-${me}`, 120_000, async () => {
    const identity = await getIdentity();
    const tips = identity.trust_score.tips ?? [];
    return { items: tips.map((text: string) => ({ text, kind: "tip" })) };
  });
}

export async function getFinancialAnalytics() {
  const me = await uid();
  const sb = getSupabase();
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  const [savingsTxRes, tontineContribRes, savingsGoalsRes, identityEventsRes] = await Promise.all([
    sb.from("savings_transactions").select("amount, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("tontine_contributions").select("amount, created_at").eq("user_id", me).gte("created_at", twelveMonthsAgo),
    sb.from("savings_goals").select("current_amount, target_amount, created_at, name").eq("user_id", me),
    sb.from("identity_events").select("points_delta, event_type, created_at").eq("user_id", me).eq("event_type", "credit_score_snapshot").order("created_at", { ascending: true }).limit(24),
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
    // savings_transactions uses signed amounts: positive = deposit, negative = withdrawal
    const inflow = monthTx.filter((t: any) => Number(t.amount) > 0).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const outflow = monthTx.filter((t: any) => Number(t.amount) < 0).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0) + monthContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
    cashFlow.push({ label, inflow, outflow });
  }

  const totalSaved = goals.reduce((s: number, g: any) => s + Number(g.current_amount), 0);
  const totalContributed = tontineContribs.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const trustHistory = (identityEventsRes.data ?? []).map((e: any) => ({
    label: new Date(e.created_at).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
    score: Number(e.points_delta ?? 0),
  }));
  const projections = goals.filter((g: any) => g.target_amount > 0).map((g: any) => {
    const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
    const depositRate = savingsTx.filter((t: any) => Number(t.amount) > 0).reduce((s: number, t: any) => s + Number(t.amount), 0) / 12;
    const remaining = Number(g.target_amount) - Number(g.current_amount);
    const monthsToGo = depositRate > 0 ? Math.ceil(remaining / depositRate) : null;
    return { name: g.name, pct: Math.round(pct), months_to_go: monthsToGo, target: Number(g.target_amount), current: Number(g.current_amount) };
  });
  const rawRows = [
    ...savingsTx.map((t: any) => ({ date: t.created_at, type: Number(t.amount) >= 0 ? "deposit" : "withdrawal", amount: t.amount, category: "Épargne" })),
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
    .select("user_id, points_delta, created_at").in("user_id", userIds)
    .eq("event_type", "credit_score_snapshot").order("created_at", { ascending: false });

  const scoreMap: Record<string, number> = {};
  for (const e of (events ?? []) as any[]) { if (!(e.user_id in scoreMap)) scoreMap[e.user_id] = e.points_delta ?? 0; }

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
