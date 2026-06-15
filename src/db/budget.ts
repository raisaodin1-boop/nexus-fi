/**
 * Budget mensuel personnel — catégories de dépenses avec limites.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const BUDGETS_KEY = "hodix_budgets";

export type BudgetCategory =
  | "tontines"
  | "savings"
  | "transfers"
  | "topup"
  | "food"
  | "transport"
  | "health"
  | "education"
  | "shopping"
  | "bills"
  | "other";

export const BUDGET_CATEGORY_META: Record<BudgetCategory, { label: string; emoji: string; color: string }> = {
  tontines:   { label: "Tontines",       emoji: "🤝", color: "#6366F1" },
  savings:    { label: "Épargne",         emoji: "🏦", color: "#10B981" },
  transfers:  { label: "Transferts",      emoji: "↔️", color: "#3B82F6" },
  topup:      { label: "Recharges",       emoji: "📱", color: "#F59E0B" },
  food:       { label: "Alimentation",    emoji: "🍽️", color: "#EF4444" },
  transport:  { label: "Transport",       emoji: "🚌", color: "#8B5CF6" },
  health:     { label: "Santé",           emoji: "💊", color: "#EC4899" },
  education:  { label: "Éducation",       emoji: "📚", color: "#14B8A6" },
  shopping:   { label: "Shopping",        emoji: "🛍️", color: "#F97316" },
  bills:      { label: "Factures",        emoji: "📄", color: "#64748B" },
  other:      { label: "Autre",           emoji: "📦", color: "#94A3B8" },
};

export interface BudgetLine {
  category: BudgetCategory;
  limit_amount: number;
  spent: number; // calculé dynamiquement
}

export interface MonthBudget {
  id: string;
  month: string; // "2026-06"
  lines: BudgetLine[];
  created_at: number;
}

// Mapping type de transaction wallet → catégorie budget
export function txTypeToCategory(type: string, note?: string | null): BudgetCategory {
  if (type === "contribution") return "tontines";
  if (type === "savings_deposit") return "savings";
  if (type === "transfer_out") return "transfers";
  if (type === "topup") return "topup";
  const n = (note ?? "").toLowerCase();
  if (n.includes("transport") || n.includes("taxi") || n.includes("bus")) return "transport";
  if (n.includes("nourriture") || n.includes("alimentation") || n.includes("resto")) return "food";
  if (n.includes("santé") || n.includes("médecin") || n.includes("pharma")) return "health";
  if (n.includes("école") || n.includes("éducation") || n.includes("cours")) return "education";
  if (n.includes("facture") || n.includes("électricité") || n.includes("eau")) return "bills";
  return "other";
}

async function readBudgets(): Promise<MonthBudget[]> {
  try {
    const raw = await AsyncStorage.getItem(BUDGETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeBudgets(budgets: MonthBudget[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets));
  } catch (e) {
    console.warn("[budget] writeBudgets failed:", e);
  }
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function getOrCreateBudget(month?: string): Promise<MonthBudget> {
  const key = month ?? currentMonthKey();
  const budgets = await readBudgets();
  const existing = budgets.find(b => b.month === key);
  if (existing) return existing;

  const defaults: BudgetLine[] = (Object.keys(BUDGET_CATEGORY_META) as BudgetCategory[]).map(cat => ({
    category: cat,
    limit_amount: 0,
    spent: 0,
  }));

  const budget: MonthBudget = {
    id: `${key}-${Math.random().toString(36).slice(2, 6)}`,
    month: key,
    lines: defaults,
    created_at: Date.now(),
  };
  budgets.push(budget);
  await writeBudgets(budgets);
  return budget;
}

export async function updateBudgetLine(month: string, category: BudgetCategory, limit_amount: number): Promise<void> {
  const budgets = await readBudgets();
  const idx = budgets.findIndex(b => b.month === month);
  if (idx < 0) return;
  const lIdx = budgets[idx].lines.findIndex(l => l.category === category);
  if (lIdx >= 0) budgets[idx].lines[lIdx].limit_amount = limit_amount;
  else budgets[idx].lines.push({ category, limit_amount, spent: 0 });
  await writeBudgets(budgets);
}

/** Calcule les dépenses réelles depuis les transactions wallet */
export function computeBudgetSpent(
  budget: MonthBudget,
  transactions: Array<{ type: string; amount: number; note?: string | null; created_at: string }>,
): MonthBudget {
  const spent: Partial<Record<BudgetCategory, number>> = {};
  const [year, month] = budget.month.split("-").map(Number);

  for (const tx of transactions) {
    const d = new Date(tx.created_at);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    if (tx.amount <= 0) continue; // ignorer les entrées
    const cat = txTypeToCategory(tx.type, tx.note);
    spent[cat] = (spent[cat] ?? 0) + tx.amount;
  }

  return {
    ...budget,
    lines: budget.lines.map(l => ({ ...l, spent: spent[l.category] ?? 0 })),
  };
}

export function getBudgetStatus(line: BudgetLine): "ok" | "warning" | "over" {
  if (line.limit_amount === 0) return "ok";
  const ratio = line.spent / line.limit_amount;
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "warning";
  return "ok";
}
