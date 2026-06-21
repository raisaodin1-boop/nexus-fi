/**
 * Auto-épargne récurrente — planifie des dépôts automatiques sur un objectif.
 * Les règles sont stockées localement (AsyncStorage) et exécutées au démarrage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "@/src/supabase";

const RULES_KEY = "hodix_auto_savings_rules";

export type AutoSavingsFrequency = "daily" | "weekly" | "monthly";

export interface AutoSavingsRule {
  id: string;
  goal_id: string;
  goal_name: string;
  amount: number;
  frequency: AutoSavingsFrequency;
  next_run_at: number; // timestamp ms
  last_run_at: number | null;
  is_active: boolean;
  created_at: number;
  total_deposited: number;
  runs_count: number;
}

// ─── Persistence ───────────────────────────────────────────────────────────────

async function readRules(): Promise<AutoSavingsRule[]> {
  try {
    const raw = await AsyncStorage.getItem(RULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeRules(rules: AutoSavingsRule[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch (e) {
    console.warn("[auto-savings] writeRules failed:", e);
  }
}

function nextRunAt(frequency: AutoSavingsFrequency, from = Date.now()): number {
  const d = new Date(from);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  d.setHours(8, 0, 0, 0); // 08h00 du matin
  return d.getTime();
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function createAutoSavingsRule(params: {
  goal_id: string;
  goal_name: string;
  amount: number;
  frequency: AutoSavingsFrequency;
}): Promise<AutoSavingsRule> {
  if (!params.amount || params.amount <= 0) throw new Error("Montant invalide.");
  const rules = await readRules();
  const existing = rules.find(r => r.goal_id === params.goal_id && r.is_active);
  if (existing) throw new Error("Une règle active existe déjà pour cet objectif.");

  const rule: AutoSavingsRule = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goal_id: params.goal_id,
    goal_name: params.goal_name,
    amount: params.amount,
    frequency: params.frequency,
    next_run_at: nextRunAt(params.frequency),
    last_run_at: null,
    is_active: true,
    created_at: Date.now(),
    total_deposited: 0,
    runs_count: 0,
  };
  rules.push(rule);
  await writeRules(rules);
  return rule;
}

export async function listAutoSavingsRules(): Promise<AutoSavingsRule[]> {
  return readRules();
}

export async function toggleAutoSavingsRule(id: string, is_active: boolean): Promise<void> {
  const rules = await readRules();
  const idx = rules.findIndex(r => r.id === id);
  if (idx < 0) throw new Error("Règle introuvable.");
  rules[idx].is_active = is_active;
  if (is_active) rules[idx].next_run_at = nextRunAt(rules[idx].frequency);
  await writeRules(rules);
}

export async function updateAutoSavingsRule(id: string, updates: { amount?: number; frequency?: AutoSavingsFrequency }): Promise<void> {
  const rules = await readRules();
  const idx = rules.findIndex(r => r.id === id);
  if (idx < 0) throw new Error("Règle introuvable.");
  if (updates.amount !== undefined) rules[idx].amount = updates.amount;
  if (updates.frequency !== undefined) {
    rules[idx].frequency = updates.frequency;
    rules[idx].next_run_at = nextRunAt(updates.frequency);
  }
  await writeRules(rules);
}

export async function deleteAutoSavingsRule(id: string): Promise<void> {
  const rules = await readRules();
  await writeRules(rules.filter(r => r.id !== id));
}

/** À appeler au démarrage de l'app — exécute les règles en retard */
export async function runDueAutoSavings(): Promise<{ executed: number; failed: number }> {
  const rules = await readRules();
  const now = Date.now();
  const due = rules.filter(r => r.is_active && r.next_run_at <= now);
  if (due.length === 0) return { executed: 0, failed: 0 };

  let executed = 0;
  let failed = 0;

  for (const rule of due) {
    try {
      const { error } = await getSupabase().rpc("auto_savings_execute", {
        p_goal_id: rule.goal_id,
        p_amount: rule.amount,
        p_note: `Auto-épargne ${rule.frequency}`,
      });
      if (error) {
        failed++;
        continue;
      }
      const idx = rules.findIndex(r => r.id === rule.id);
      if (idx >= 0) {
        rules[idx].last_run_at = now;
        rules[idx].next_run_at = nextRunAt(rule.frequency, now);
        rules[idx].total_deposited += rule.amount;
        rules[idx].runs_count += 1;
      }
      executed++;
    } catch {
      failed++;
    }
  }

  await writeRules(rules);
  return { executed, failed };
}

export const FREQUENCY_LABELS: Record<AutoSavingsFrequency, string> = {
  daily: "Chaque jour",
  weekly: "Chaque semaine",
  monthly: "Chaque mois",
};
