import { getSupabase } from "@/src/supabase";
import { uid, cached, throwSb } from "./helpers";

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
