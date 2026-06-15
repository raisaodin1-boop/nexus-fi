/**
 * Partage de dépenses — diviser une facture entre membres.
 * Stocké localement avec suivi des remboursements.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const SPLITS_KEY = "hodix_split_expenses";

export interface SplitParticipant {
  user_id: string;
  name: string;
  phone?: string;
  amount_owed: number;
  paid: boolean;
  paid_at?: number;
}

export interface SplitExpense {
  id: string;
  title: string;
  total_amount: number;
  currency: string;
  created_by_id: string;
  created_by_name: string;
  participants: SplitParticipant[];
  created_at: number;
  note?: string;
  is_settled: boolean;
  group_id?: string;
  group_name?: string;
}

async function readSplits(): Promise<SplitExpense[]> {
  try {
    const raw = await AsyncStorage.getItem(SPLITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeSplits(splits: SplitExpense[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SPLITS_KEY, JSON.stringify(splits));
  } catch (e) {
    console.warn("[split-expense] writeSplits failed:", e);
  }
}

export async function createSplitExpense(params: {
  title: string;
  total_amount: number;
  currency?: string;
  created_by_id: string;
  created_by_name: string;
  participants: Array<{ user_id: string; name: string; phone?: string; amount_owed: number }>;
  note?: string;
  group_id?: string;
  group_name?: string;
}): Promise<SplitExpense> {
  if (!params.total_amount || params.total_amount <= 0) throw new Error("Montant invalide.");
  if (!params.participants.length) throw new Error("Ajoutez au moins un participant.");

  const totalOwed = params.participants.reduce((s, p) => s + p.amount_owed, 0);
  if (Math.abs(totalOwed - params.total_amount) > 1) {
    throw new Error(`Le total des parts (${totalOwed}) ne correspond pas au montant (${params.total_amount}).`);
  }

  const split: SplitExpense = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title,
    total_amount: params.total_amount,
    currency: params.currency ?? "XAF",
    created_by_id: params.created_by_id,
    created_by_name: params.created_by_name,
    participants: params.participants.map(p => ({ ...p, paid: false })),
    created_at: Date.now(),
    note: params.note,
    is_settled: false,
    group_id: params.group_id,
    group_name: params.group_name,
  };

  const splits = await readSplits();
  splits.unshift(split);
  await writeSplits(splits);
  return split;
}

export async function listSplitExpenses(userId: string): Promise<SplitExpense[]> {
  const splits = await readSplits();
  return splits.filter(s =>
    s.created_by_id === userId ||
    s.participants.some(p => p.user_id === userId)
  );
}

export async function markParticipantPaid(splitId: string, userId: string): Promise<void> {
  const splits = await readSplits();
  const idx = splits.findIndex(s => s.id === splitId);
  if (idx < 0) throw new Error("Partage introuvable.");

  const pIdx = splits[idx].participants.findIndex(p => p.user_id === userId);
  if (pIdx < 0) throw new Error("Participant introuvable.");

  splits[idx].participants[pIdx].paid = true;
  splits[idx].participants[pIdx].paid_at = Date.now();

  const allPaid = splits[idx].participants.every(p => p.paid);
  if (allPaid) splits[idx].is_settled = true;

  await writeSplits(splits);
}

export async function deleteSplitExpense(splitId: string): Promise<void> {
  const splits = await readSplits();
  await writeSplits(splits.filter(s => s.id !== splitId));
}

/** Divise équitablement un montant entre N personnes */
export function splitEqually(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = Math.round(total - base * count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

export function getSplitSummary(split: SplitExpense) {
  const paid = split.participants.filter(p => p.paid).length;
  const total = split.participants.length;
  const collected = split.participants.filter(p => p.paid).reduce((s, p) => s + p.amount_owed, 0);
  return { paid, total, collected, remaining: split.total_amount - collected, percent: Math.round((collected / split.total_amount) * 100) };
}
