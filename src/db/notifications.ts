import { getSupabase } from "@/src/supabase";
import { uid, cached, throwSb, invalidateCache } from "./helpers";

export type NotifyPayload = {
  user_id: string;
  title: string;
  body: string;
  type?: string;
  metadata?: Record<string, unknown>;
  push?: boolean;
};

function mapNotificationKind(type?: string | null): string {
  const t = (type ?? "info").toLowerCase();
  if (["success", "payment", "promotion", "escrow_release", "tontine_cycle"].includes(t)) return "success";
  if (t === "approved" || t === "kyc") return "success";
  if (t === "kyc_rejected" || ["warning", "alert", "tontine_reminder"].includes(t) || t.includes("reject") || t.includes("retard")) return "alert";
  return "info";
}

function mapNotification(row: Record<string, unknown>) {
  const type = String(row.type ?? "info");
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    kind: mapNotificationKind(type),
    type,
    is_read: !!row.is_read,
    created_at: String(row.created_at ?? new Date().toISOString()),
    action_url: metadata?.action_url ? String(metadata.action_url) : undefined,
  };
}

/** Insère une notification in-app ; le push est dispatché côté serveur (trigger DB → send-push). */
export async function notifyUser(opts: NotifyPayload) {
  const sb = getSupabase();
  const { data, error } = await sb.from("notifications").insert({
    user_id: opts.user_id,
    title: opts.title,
    body: opts.body,
    type: opts.type ?? "info",
    is_read: false,
    metadata: opts.metadata ?? null,
  }).select("id").single();
  throwSb(error);
  return data;
}

export async function listNotifications() {
  const me = await uid();
  return cached(`notifs-${me}`, 30_000, async () => {
    const { data, error } = await getSupabase()
      .from("notifications").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(50);
    throwSb(error);
    const items = (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
    return {
      items,
      unread_count: items.filter((n) => !n.is_read).length,
    };
  });
}

export async function markNotifRead(id: string) {
  const me = await uid();
  await getSupabase().from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", me);
  invalidateCache(`notifs-${me}`);
}

export async function markAllNotificationsRead() {
  const me = await uid();
  await getSupabase().from("notifications").update({ is_read: true }).eq("user_id", me).eq("is_read", false);
  invalidateCache(`notifs-${me}`);
  return { detail: "Toutes les notifications marquées comme lues" };
}

export async function savePushToken(token: string, platform?: string) {
  const me = await uid();
  await getSupabase().from("push_tokens")
    .upsert(
      {
        user_id: me,
        token,
        platform: platform ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" },
    );
  return { detail: "Token enregistré" };
}

export async function saveNotificationConsent(pushConsent: boolean, marketingConsent?: boolean) {
  const me = await uid();
  await getSupabase().from("profiles").update({
    push_consent: pushConsent,
    marketing_consent: marketingConsent ?? pushConsent,
    updated_at: new Date().toISOString(),
  }).eq("id", me);
  return { detail: "Préférences enregistrées" };
}
