/**
 * Offline transaction queue — persists pending ops to AsyncStorage,
 * replays them automatically when the network comes back.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api";

const QUEUE_KEY = "hodix_offline_tx_queue";
const MAX_RETRIES = 3;

export type QueuedTxKind =
  | "wallet_topup"
  | "wallet_withdraw"
  | "wallet_transfer"
  | "tontine_contribution"
  | "savings_deposit";

export interface QueuedTx {
  id: string;
  kind: QueuedTxKind;
  payload: Record<string, unknown>;
  queuedAt: number;
  retries: number;
  status: "pending" | "failed";
  lastError?: string;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedTx[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedTx[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("[offline-queue] Impossible de sauvegarder la file:", e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Add a transaction to the offline queue */
export async function enqueueTransaction(
  kind: QueuedTxKind,
  payload: Record<string, unknown>,
): Promise<QueuedTx> {
  const tx: QueuedTx = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    queuedAt: Date.now(),
    retries: 0,
    status: "pending",
  };
  const queue = await readQueue();
  queue.push(tx);
  await writeQueue(queue);
  requestOfflineSync();
  return tx;
}

/** How many transactions are waiting */
export async function getPendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.filter((t) => t.status === "pending").length;
}

/** Replay all pending transactions — call this when network comes back */
export async function replayQueue(): Promise<{ ok: number; failed: number }> {
  const queue = await readQueue();
  const pending = queue.filter((t) => t.status === "pending");
  if (pending.length === 0) return { ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;

  for (const tx of pending) {
    try {
      await submitQueuedTx(tx);
      // Remove from queue on success
      const updated = await readQueue();
      await writeQueue(updated.filter((t) => t.id !== tx.id));
      ok++;
    } catch (e: any) {
      tx.retries++;
      tx.lastError = e?.message ?? String(e);
      if (tx.retries >= MAX_RETRIES) {
        tx.status = "failed";
        failed++;
      }
      const updated = await readQueue();
      const idx = updated.findIndex((t) => t.id === tx.id);
      if (idx >= 0) updated[idx] = tx;
      await writeQueue(updated);
    }
  }

  return { ok, failed };
}

/** Clear all failed transactions */
export async function clearFailedQueue(): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((t) => t.status !== "failed"));
}

// ─── Dispatch table ───────────────────────────────────────────────────────────

async function submitQueuedTx(tx: QueuedTx): Promise<void> {
  switch (tx.kind) {
    case "wallet_topup":
      await api.post("/wallet/topup", tx.payload);
      break;
    case "wallet_withdraw":
      await api.post("/wallet/withdraw", tx.payload);
      break;
    case "wallet_transfer":
      await api.post("/wallet/transfer", tx.payload);
      break;
    case "tontine_contribution":
      await api.post("/tontines/contribute", tx.payload);
      break;
    case "savings_deposit":
      await api.post("/savings/deposit", tx.payload);
      break;
    default:
      throw new Error(`Unknown queued tx kind: ${(tx as any).kind}`);
  }
}

function requestOfflineSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: "REGISTER_SYNC" }))
    .catch(() => {});
}
