import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

export async function listMessages(conversationType: "admin" | "tontine", tontineId?: string) {
  const me = await uid();
  const sb = getSupabase();
  if (conversationType === "admin") {
    const { data } = await sb.from("messages").select("*")
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`).is("tontine_id", null).order("created_at", { ascending: true }).limit(100);
    return data ?? [];
  }
  if (conversationType === "tontine" && tontineId) {
    const { data } = await sb.from("messages").select("*").eq("tontine_id", tontineId).order("created_at", { ascending: true }).limit(100);
    return data ?? [];
  }
  return [];
}

export async function sendMessage(body: { recipient_id?: string; tontine_id?: string; content: string }) {
  const me = await uid();
  const { data, error } = await getSupabase().from("messages").insert({
    sender_id: me, recipient_id: body.recipient_id ?? null,
    tontine_id: body.tontine_id ?? null, content: body.content, is_read: false,
  }).select().single();
  throwSb(error);
  return data;
}

export async function markMessageRead(id: string) {
  await getSupabase().from("messages").update({ is_read: true }).eq("id", id);
}

export async function listConversations() {
  const me = await uid();
  const { data: memberOf } = await getSupabase().from("tontine_members").select("tontine_id, tontines(id, name)").eq("user_id", me);
  const { data: ownerOf } = await getSupabase().from("tontines").select("id, name").eq("owner_id", me);
  const tontineMap: Record<string, string> = {};
  for (const m of memberOf ?? []) { const t = (m as any).tontines; if (t) tontineMap[t.id] = t.name; }
  for (const t of ownerOf ?? []) tontineMap[t.id] = t.name;
  return { admin_thread: true, tontines: Object.entries(tontineMap).map(([id, name]) => ({ id, name })) };
}

export async function adminListAllMessages() {
  const { data } = await getSupabase().from("messages").select("*").is("tontine_id", null).order("created_at", { ascending: false }).limit(200);
  const userIds = [...new Set([...(data ?? []).map((m: any) => m.sender_id), ...(data ?? []).map((m: any) => m.recipient_id).filter(Boolean)])];
  const profileMap: Record<string, string> = {};
  try {
    const { data: profiles } = await getSupabase().from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p.full_name ?? "—";
  } catch {}
  return (data ?? []).map((m: any) => ({
    ...m, sender_name: profileMap[m.sender_id] ?? "—", recipient_name: m.recipient_id ? (profileMap[m.recipient_id] ?? "—") : "Admin",
  }));
}

export async function adminSendMessageToUser(userId: string, content: string) {
  const me = await uid();
  const { error } = await getSupabase().from("messages").insert({
    sender_id: me, recipient_id: userId, tontine_id: null, content, is_read: false,
  });
  throwSb(error);
  return { detail: "Message envoyé" };
}
