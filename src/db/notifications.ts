import { getSupabase } from "@/src/supabase";
import { uid, cached, throwSb } from "./helpers";

export type NotifyPayload = {
  user_id: string;
  title: string;
  body: string;
  type?: string;
  metadata?: Record<string, unknown>;
  push?: boolean;
};

/** Insère une notification in-app et déclenche le push Expo (best-effort). */
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

  if (opts.push !== false) {
    sb.functions.invoke("send-push", {
      body: {
        user_id: opts.user_id,
        title: opts.title,
        body: opts.body,
        type: opts.type ?? "info",
        notification_id: data.id,
      },
    }).catch(() => {});
  }
  return data;
}

export async function listNotifications() {
  const me = await uid();
  return cached(`notifs-${me}`, 30_000, async () => {
    const { data, error } = await getSupabase()
      .from("notifications").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(50);
    throwSb(error);
    return data ?? [];
  });
}

export async function markNotifRead(id: string) {
  await getSupabase().from("notifications").update({ is_read: true }).eq("id", id);
}

export async function savePushToken(token: string) {
  const me = await uid();
  await getSupabase().from("push_tokens")
    .upsert({ user_id: me, token, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
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
