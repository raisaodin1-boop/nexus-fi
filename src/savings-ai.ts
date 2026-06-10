/**
 * Savings AI — deposit pattern analysis, goal prediction, optimal amounts,
 * peer comparison. Pure functions, no Supabase imports.
 */

export interface DepositRecord {
  amount: number;
  created_at: string;
}

export interface DepositPattern {
  avg_monthly_xaf: number;
  median_deposit_xaf: number;
  deposit_count: number;
  trend: "increasing" | "decreasing" | "stable";
  trend_slope: number;        // XAF/deposit change per period
  consistency_pct: number;    // 0-100 — coefficient of variation inverted
  days_since_last: number;
  active_months: number;
}

export interface GoalPrediction {
  current_amount: number;
  target_amount: number;
  remaining_xaf: number;
  progress_pct: number;
  planned_deadline: string | null;
  planned_months_remaining: number | null;
  predicted_months_remaining: number | null;
  predicted_completion_date: string | null;
  delay_months: number | null;     // positive = late, negative = early
  on_track: boolean | null;        // null = no deadline set
  optimal_monthly_xaf: number;     // min needed to hit deadline
  optimal_deposit_xaf: number;     // recommended single deposit
  alert: string | null;
  pattern: DepositPattern;
}

export interface PeerStats {
  peer_avg_monthly_xaf: number;
  peer_median_deposit_xaf: number;
  peer_count: number;
  user_percentile: number;         // 0-100 among peers
  label: string;                   // "Vous épargnez plus que 72% des membres similaires"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length);
}

/** Simple OLS slope over equally-spaced y values */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const num = values.reduce((acc, y, i) => acc + (i - meanX) * (y - meanY), 0);
  const den = values.reduce((acc, _, i) => acc + (i - meanX) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

// ─── Pattern analysis ─────────────────────────────────────────────────────────

export function analyzePattern(deposits: DepositRecord[]): DepositPattern {
  const now = new Date();

  if (deposits.length === 0) {
    return {
      avg_monthly_xaf: 0, median_deposit_xaf: 0, deposit_count: 0,
      trend: "stable", trend_slope: 0, consistency_pct: 0,
      days_since_last: 999, active_months: 0,
    };
  }

  const sorted = [...deposits].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const amounts = sorted.map(d => Number(d.amount));

  // Monthly aggregation
  const byMonth: Record<string, number> = {};
  for (const d of sorted) {
    const key = d.created_at.slice(0, 7); // "YYYY-MM"
    byMonth[key] = (byMonth[key] ?? 0) + Number(d.amount);
  }
  const monthlyAmounts = Object.values(byMonth);
  const activeMonths = monthlyAmounts.length;
  const avgMonthly = activeMonths > 0
    ? monthlyAmounts.reduce((a, b) => a + b, 0) / activeMonths
    : 0;

  // Trend on monthly totals (more stable than per-deposit)
  const s = slope(monthlyAmounts);
  const trend = Math.abs(s) < avgMonthly * 0.05
    ? "stable"
    : s > 0 ? "increasing" : "decreasing";

  // Consistency = inverse coefficient of variation (capped 0-100)
  const sd = stddev(amounts);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const cv = mean > 0 ? sd / mean : 1;
  const consistencyPct = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));

  const lastDeposit = new Date(sorted[sorted.length - 1].created_at);
  const daysSinceLast = Math.round((now.getTime() - lastDeposit.getTime()) / 86400000);

  return {
    avg_monthly_xaf: Math.round(avgMonthly),
    median_deposit_xaf: Math.round(median(amounts)),
    deposit_count: deposits.length,
    trend,
    trend_slope: Math.round(s),
    consistency_pct: consistencyPct,
    days_since_last: daysSinceLast,
    active_months: activeMonths,
  };
}

// ─── Goal prediction ──────────────────────────────────────────────────────────

export function predictGoal(
  goal: {
    current_amount: number;
    target_amount: number;
    deadline?: string | null;
    created_at: string;
  },
  deposits: DepositRecord[],
): GoalPrediction {
  const pattern = analyzePattern(deposits);
  const now = new Date();

  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const progressPct = goal.target_amount > 0
    ? Math.round((goal.current_amount / goal.target_amount) * 100)
    : 0;

  // ── Planned timeline ──
  let plannedMonthsRemaining: number | null = null;
  let plannedDeadline: string | null = goal.deadline ?? null;
  if (goal.deadline) {
    const dl = new Date(goal.deadline);
    plannedMonthsRemaining = Math.max(0, monthsBetween(now, dl));
  }

  // ── Optimal monthly needed ──
  const optimalMonthly = plannedMonthsRemaining && plannedMonthsRemaining > 0
    ? Math.ceil(remaining / plannedMonthsRemaining)
    : pattern.avg_monthly_xaf > 0
      ? pattern.avg_monthly_xaf
      : Math.ceil(remaining / 12);

  // Recommended single deposit = roughly one month's optimal
  const optimalDeposit = Math.ceil(optimalMonthly / 4) * 4; // round nicely

  // ── Predicted completion based on current rate ──
  let predictedMonthsRemaining: number | null = null;
  let predictedCompletionDate: string | null = null;
  let delayMonths: number | null = null;
  let onTrack: boolean | null = null;
  let alert: string | null = null;

  if (pattern.avg_monthly_xaf > 0 && remaining > 0) {
    // Use trend-adjusted rate for next period prediction
    const adjustedRate = Math.max(
      1,
      pattern.avg_monthly_xaf + pattern.trend_slope * 0.5
    );
    predictedMonthsRemaining = Math.ceil(remaining / adjustedRate);
    const completionDate = addMonths(now, predictedMonthsRemaining);
    predictedCompletionDate = completionDate.toISOString().slice(0, 10);

    if (plannedMonthsRemaining !== null) {
      delayMonths = predictedMonthsRemaining - plannedMonthsRemaining;
      onTrack = delayMonths <= 1; // ±1 month tolerance

      if (delayMonths > 0) {
        alert = `⚠️ À ce rythme, vous atteignez votre objectif en ${predictedMonthsRemaining} mois — soit ${delayMonths} mois de retard. Augmentez vos dépôts à ${fmtXAF(optimalMonthly)}/mois pour rester dans les délais.`;
      } else if (delayMonths < -1) {
        alert = `🚀 Excellent rythme ! Vous êtes en avance de ${Math.abs(delayMonths)} mois sur votre objectif. Continuez ainsi ou anticipez votre prochain objectif.`;
      } else {
        alert = `✅ Vous êtes dans les temps ! Maintenez un dépôt de ${fmtXAF(optimalMonthly)}/mois pour atteindre votre objectif à temps.`;
      }
    } else {
      alert = `📈 À votre rythme actuel (${fmtXAF(pattern.avg_monthly_xaf)}/mois), objectif atteint dans ~${predictedMonthsRemaining} mois (${completionDate.toISOString().slice(0, 7)}).`;
    }
  } else if (remaining > 0) {
    alert = "💡 Effectuez votre premier dépôt pour obtenir une prédiction personnalisée.";
  } else {
    alert = "🎉 Félicitations, objectif atteint !";
  }

  return {
    current_amount: goal.current_amount,
    target_amount: goal.target_amount,
    remaining_xaf: remaining,
    progress_pct: progressPct,
    planned_deadline: plannedDeadline,
    planned_months_remaining: plannedMonthsRemaining,
    predicted_months_remaining: predictedMonthsRemaining,
    predicted_completion_date: predictedCompletionDate,
    delay_months: delayMonths,
    on_track: onTrack,
    optimal_monthly_xaf: optimalMonthly,
    optimal_deposit_xaf: optimalDeposit,
    alert,
    pattern,
  };
}

function fmtXAF(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " XAF";
}

// ─── Peer comparison (computed from fetched aggregate data) ───────────────────

export function buildPeerStats(
  userMonthlyAvg: number,
  peers: { avg_monthly: number }[],
): PeerStats {
  if (peers.length === 0) {
    return {
      peer_avg_monthly_xaf: 0,
      peer_median_deposit_xaf: 0,
      peer_count: 0,
      user_percentile: 50,
      label: "Pas assez de données pour la comparaison.",
    };
  }
  const amounts = peers.map(p => p.avg_monthly);
  const peerAvg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  const peerMed = Math.round(median(amounts));
  const below = amounts.filter(a => userMonthlyAvg > a).length;
  const percentile = Math.round((below / amounts.length) * 100);

  let label: string;
  if (percentile >= 80) label = `Vous épargnez plus que ${percentile}% des membres avec des objectifs similaires. 🏆`;
  else if (percentile >= 50) label = `Vous êtes au-dessus de la médiane (top ${100 - percentile}%). Bien joué !`;
  else if (percentile >= 25) label = `Vous êtes légèrement en dessous de la moyenne. Un effort supplémentaire ferait la différence.`;
  else label = `Les membres similaires épargnent ${fmtXAF(peerAvg)}/mois en moyenne. Vous pouvez faire mieux !`;

  return {
    peer_avg_monthly_xaf: peerAvg,
    peer_median_deposit_xaf: peerMed,
    peer_count: peers.length,
    user_percentile: percentile,
    label,
  };
}

// ─── Monthly histogram (for bar chart) ───────────────────────────────────────

export interface MonthBar {
  month: string;   // "Jan", "Fév" …
  amount: number;
}

export function buildMonthlyHistogram(deposits: DepositRecord[], months = 6): MonthBar[] {
  const bars: MonthBar[] = [];
  const now = new Date();
  const FR_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const total = deposits
      .filter(dep => dep.created_at.slice(0, 7) === key)
      .reduce((s, dep) => s + Number(dep.amount), 0);
    bars.push({ month: FR_MONTHS[d.getMonth()], amount: total });
  }
  return bars;
}
