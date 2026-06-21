import { getSupabase } from "@/src/supabase";
import { notifyUser } from "./notifications";
import { uid, throwSb } from "./helpers";
import { isKycVerified } from "@/src/profile-display";

const ADMIN_ROLES = ["admin", "super_admin"] as const;
const PAGE_SIZE = 100;

export type MessageType = "direct" | "tontine" | "broadcast";

export interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  tontine_id: string | null;
  message_type: MessageType;
  title: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  recipient_name?: string | null;
}

export interface ConversationItem {
  id: string;
  type: "direct" | "tontine" | "broadcast";
  name: string;
  subtitle?: string;
  peer_id?: string;
  tontine_id?: string;
  last_message?: string;
  last_at?: string;
  unread_count: number;
  is_admin?: boolean;
}

export interface RecipientSuggestion {
  id: string;
  full_name: string;
  kyc_verified?: boolean;
  role: string;
  is_admin: boolean;
  subtitle: string;
}

async function requireAdmin() {
  const me = await uid();
  const { data } = await getSupabase().from("profiles").select("role").eq("id", me).single();
  if (!data || !ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number])) {
    throw { status: 403, detail: "Accès réservé aux administrateurs" };
  }
}

async function profileNameMap(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await getSupabase().from("profiles").select("id, full_name").in("id", unique);
  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.full_name ?? "—";
  return map;
}

async function enrichMessages(rows: Record<string, unknown>[]): Promise<MessageRow[]> {
  const ids = rows.flatMap((m) => [m.sender_id, m.recipient_id].filter(Boolean) as string[]);
  const names = await profileNameMap(ids);
  return rows.map((m) => ({
    ...(m as unknown as MessageRow),
    sender_name: names[String(m.sender_id)] ?? "—",
    recipient_name: m.recipient_id ? (names[String(m.recipient_id)] ?? "—") : null,
  }));
}

export async function searchMessageRecipients(query: string): Promise<RecipientSuggestion[]> {
  const me = await uid();
  const term = query.trim();
  if (!term) return [];

  const sb = getSupabase();
  const adminHint = /^adm/i.test(term) || /\badmin/i.test(term);

  let q = sb
    .from("profiles")
    .select("id, full_name, role, phone, kyc_status")
    .neq("id", me)
    .neq("role", "suspended")
    .order("full_name", { ascending: true })
    .limit(15);

  if (adminHint) {
    q = q.in("role", [...ADMIN_ROLES]);
    if (term.length > 3) q = q.ilike("full_name", `%${term}%`);
  } else {
    q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data, error } = await q;
  throwSb(error);

  return (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name ?? "—",
    kyc_verified: isKycVerified(p.kyc_status),
    role: p.role ?? "member",
    is_admin: ADMIN_ROLES.includes(p.role as (typeof ADMIN_ROLES)[number]),
    subtitle: ADMIN_ROLES.includes(p.role as (typeof ADMIN_ROLES)[number]) ? "Administration HODIX" : "Membre",
  }));
}

export async function listMessages(
  conversationType: "direct" | "tontine" | "broadcast" | "admin",
  peerId?: string,
  tontineId?: string,
) {
  const me = await uid();
  const sb = getSupabase();

  if (conversationType === "broadcast") {
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("message_type", "broadcast")
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    throwSb(error);
    return enrichMessages(data ?? []);
  }

  if (conversationType === "tontine" && tontineId) {
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("tontine_id", tontineId)
      .eq("message_type", "tontine")
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    throwSb(error);
    return enrichMessages(data ?? []);
  }

  if (conversationType === "direct" && peerId) {
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("message_type", "direct")
      .is("tontine_id", null)
      .or(
        `and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`,
      )
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    throwSb(error);
    return enrichMessages(data ?? []);
  }

  if (conversationType === "admin") {
    const { data: admins } = await sb.from("profiles").select("id").in("role", [...ADMIN_ROLES]);
    const adminIds = (admins ?? []).map((a) => a.id);
    if (!adminIds.length) return [];

    const orParts = [
      `and(sender_id.eq.${me},recipient_id.is.null)`,
      ...adminIds.flatMap((aid) => [
        `and(sender_id.eq.${me},recipient_id.eq.${aid})`,
        `and(sender_id.eq.${aid},recipient_id.eq.${me})`,
      ]),
    ];

    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("message_type", "direct")
      .is("tontine_id", null)
      .or(orParts.join(","))
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    throwSb(error);
    return enrichMessages(data ?? []);
  }

  return [];
}

export async function sendMessage(body: {
  recipient_id?: string;
  tontine_id?: string;
  content: string;
  message_type?: MessageType;
}) {
  const me = await uid();
  const content = body.content.trim();
  if (!content) throw { status: 400, detail: "Message vide" };

  let messageType: MessageType = body.message_type ?? "direct";
  if (body.tontine_id) messageType = "tontine";
  if (messageType === "broadcast") await requireAdmin();

  const row = {
    sender_id: me,
    recipient_id: body.recipient_id ?? null,
    tontine_id: body.tontine_id ?? null,
    message_type: messageType,
    content,
    is_read: false,
  };

  const { data, error } = await getSupabase().from("messages").insert(row).select().single();
  throwSb(error);

  if (messageType === "direct" && body.recipient_id && body.recipient_id !== me) {
    const { data: sender } = await getSupabase().from("profiles").select("full_name").eq("id", me).single();
    notifyUser({
      user_id: body.recipient_id,
      title: "Nouveau message",
      body: `${sender?.full_name ?? "Un membre"} : ${content.slice(0, 80)}${content.length > 80 ? "…" : ""}`,
      type: "info",
      metadata: { action_url: "/messages" },
    }).catch(() => {});
  }

  if (messageType === "tontine" && body.tontine_id) {
    const { data: members } = await getSupabase()
      .from("tontine_members")
      .select("user_id")
      .eq("tontine_id", body.tontine_id)
      .neq("user_id", me);
    const { data: sender } = await getSupabase().from("profiles").select("full_name").eq("id", me).single();
    for (const m of members ?? []) {
      notifyUser({
        user_id: m.user_id,
        title: "Message tontine",
        body: `${sender?.full_name ?? "Un membre"} : ${content.slice(0, 60)}…`,
        type: "info",
        metadata: { action_url: `/messages?tontine_id=${body.tontine_id}` },
      }).catch(() => {});
    }
  }

  return data;
}

export async function markMessageRead(id: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data: msg } = await sb.from("messages").select("message_type, recipient_id").eq("id", id).single();
  if (!msg) return;

  if (msg.message_type === "broadcast") {
    await sb.from("message_reads").upsert({ message_id: id, user_id: me }, { onConflict: "message_id,user_id" });
    return;
  }

  if (msg.recipient_id === me) {
    await sb.from("messages").update({ is_read: true }).eq("id", id).eq("recipient_id", me);
  }
}

export async function markThreadRead(
  threadType: "direct" | "tontine" | "broadcast" | "admin",
  peerId?: string,
  tontineId?: string,
) {
  const me = await uid();
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", me).single();
  const isAdmin = ADMIN_ROLES.includes((profile?.role ?? "") as (typeof ADMIN_ROLES)[number]);

  if (threadType === "direct" && peerId && isAdmin) {
    await sb
      .from("messages")
      .update({ is_read: true })
      .eq("message_type", "direct")
      .eq("sender_id", peerId)
      .eq("is_read", false);
    return;
  }

  const msgs = await listMessages(threadType, peerId, tontineId);
  await Promise.all(msgs.map((m) => markMessageRead(m.id)));
}

export async function getUnreadCount(): Promise<number> {
  const me = await uid();
  const sb = getSupabase();

  const { count: directUnread } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("message_type", "direct")
    .eq("recipient_id", me)
    .eq("is_read", false);

  const { data: broadcasts } = await sb
    .from("messages")
    .select("id")
    .eq("message_type", "broadcast");

  const { data: readBroadcasts } = await sb
    .from("message_reads")
    .select("message_id")
    .eq("user_id", me);

  const readSet = new Set((readBroadcasts ?? []).map((r) => r.message_id));
  const broadcastUnread = (broadcasts ?? []).filter((b) => !readSet.has(b.id)).length;

  return (directUnread ?? 0) + broadcastUnread;
}

export async function listConversations(): Promise<{ items: ConversationItem[] }> {
  const me = await uid();
  const sb = getSupabase();
  const items: ConversationItem[] = [];

  const { data: directMsgs } = await sb
    .from("messages")
    .select("id, sender_id, recipient_id, content, created_at, is_read, message_type")
    .eq("message_type", "direct")
    .is("tontine_id", null)
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(300);

  const threadMap = new Map<string, { last: string; last_at: string; unread: number; is_admin: boolean }>();

  const { data: admins } = await sb.from("profiles").select("id, role").in("role", [...ADMIN_ROLES]);
  const adminSet = new Set((admins ?? []).map((a) => a.id));

  for (const m of directMsgs ?? []) {
    const peerId =
      m.sender_id === me
        ? m.recipient_id
        : m.sender_id;
    if (!peerId) continue;
    const key = `direct:${peerId}`;
    if (!threadMap.has(key)) {
      threadMap.set(key, {
        last: m.content,
        last_at: m.created_at,
        unread: m.recipient_id === me && !m.is_read ? 1 : 0,
        is_admin: adminSet.has(peerId),
      });
    } else if (m.recipient_id === me && !m.is_read) {
      threadMap.get(key)!.unread += 1;
    }
  }

  const peerIds = [...threadMap.keys()].map((k) => k.replace("direct:", ""));
  const names = await profileNameMap(peerIds);

  for (const [key, meta] of threadMap) {
    const peerId = key.replace("direct:", "");
    items.push({
      id: key,
      type: "direct",
      peer_id: peerId,
      name: names[peerId] ?? "Membre",
      subtitle: meta.is_admin ? "Administration" : "Message privé",
      last_message: meta.last,
      last_at: meta.last_at,
      unread_count: meta.unread,
      is_admin: meta.is_admin,
    });
  }

  const { data: broadcasts } = await sb
    .from("messages")
    .select("id, title, content, created_at")
    .eq("message_type", "broadcast")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: readBroadcasts } = await sb.from("message_reads").select("message_id").eq("user_id", me);
  const readSet = new Set((readBroadcasts ?? []).map((r) => r.message_id));
  const { data: allBroadcasts } = await sb.from("messages").select("id").eq("message_type", "broadcast");
  const broadcastUnread = (allBroadcasts ?? []).filter((b) => !readSet.has(b.id)).length;

  items.unshift({
    id: "broadcast",
    type: "broadcast",
    name: "Annonces HODIX",
    subtitle: "Messages publicitaires & infos",
    last_message: broadcasts?.[0]
      ? (broadcasts[0].title ? `${broadcasts[0].title} — ${broadcasts[0].content}` : broadcasts[0].content)
      : "Aucune annonce pour le moment",
    last_at: broadcasts?.[0]?.created_at,
    unread_count: broadcastUnread,
  });

  const { data: memberOf } = await sb.from("tontine_members").select("tontine_id, tontines(id, name)").eq("user_id", me);
  const { data: ownerOf } = await sb.from("tontines").select("id, name").eq("owner_id", me);
  const tontineMap: Record<string, string> = {};
  for (const m of memberOf ?? []) {
    const t = (m as { tontines?: { id: string; name: string } | { id: string; name: string }[] }).tontines;
    const row = Array.isArray(t) ? t[0] : t;
    if (row) tontineMap[row.id] = row.name;
  }
  for (const t of ownerOf ?? []) tontineMap[t.id] = t.name;

  for (const [tid, name] of Object.entries(tontineMap)) {
    const { data: last } = await sb
      .from("messages")
      .select("content, created_at")
      .eq("tontine_id", tid)
      .eq("message_type", "tontine")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    items.push({
      id: `tontine:${tid}`,
      type: "tontine",
      tontine_id: tid,
      name,
      subtitle: "Groupe de cotisation",
      last_message: last?.content,
      last_at: last?.created_at,
      unread_count: 0,
    });
  }

  items.sort((a, b) => {
    const ta = a.last_at ? new Date(a.last_at).getTime() : 0;
    const tb = b.last_at ? new Date(b.last_at).getTime() : 0;
    return tb - ta;
  });

  return { items };
}

export async function adminListAllMessages() {
  await requireAdmin();
  const { data } = await getSupabase()
    .from("messages")
    .select("*")
    .eq("message_type", "direct")
    .is("tontine_id", null)
    .order("created_at", { ascending: false })
    .limit(300);
  return enrichMessages(data ?? []);
}

export interface AdminMessageThread {
  user_id: string;
  full_name: string;
  last_message: string;
  last_at: string;
  unread_count: number;
}

export async function adminListMessageThreads(): Promise<AdminMessageThread[]> {
  await requireAdmin();
  const msgs = await adminListAllMessages();
  const me = await uid();
  const { data: admins } = await getSupabase().from("profiles").select("id").in("role", [...ADMIN_ROLES]);
  const adminSet = new Set((admins ?? []).map((a) => a.id));

  const threads = new Map<string, AdminMessageThread>();

  for (const m of msgs) {
    const memberId = adminSet.has(m.sender_id) ? m.recipient_id : m.sender_id;
    if (!memberId || adminSet.has(memberId)) continue;

    const existing = threads.get(memberId);
    const unread = !adminSet.has(m.sender_id) && !m.is_read ? 1 : 0;

    if (!existing) {
      threads.set(memberId, {
        user_id: memberId,
        full_name: adminSet.has(m.sender_id) ? (m.recipient_name ?? "Membre") : (m.sender_name ?? "Membre"),
        last_message: m.content,
        last_at: m.created_at,
        unread_count: unread,
      });
    } else if (unread) {
      existing.unread_count += 1;
    }
  }

  const names = await profileNameMap([...threads.keys()]);
  for (const [id, t] of threads) {
    t.full_name = names[id] ?? t.full_name;
  }

  return [...threads.values()].sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
  );
}

export async function adminSendMessageToUser(userId: string, content: string) {
  await requireAdmin();
  const me = await uid();
  const trimmed = content.trim();
  if (!trimmed) throw { status: 400, detail: "Message vide" };

  const { error } = await getSupabase().from("messages").insert({
    sender_id: me,
    recipient_id: userId,
    tontine_id: null,
    message_type: "direct",
    content: trimmed,
    is_read: false,
  });
  throwSb(error);

  notifyUser({
    user_id: userId,
    title: "Message de l'administration",
    body: trimmed.slice(0, 100),
    type: "info",
    metadata: { action_url: "/messages" },
  }).catch(() => {});

  return { detail: "Message envoyé" };
}

let _lastAdvertAt = 0;
const ADVERT_COOLDOWN_MS = 60 * 60 * 1000;

export async function adminSendAdvertisement(title: string, content: string) {
  await requireAdmin();
  const now = Date.now();
  if (now - _lastAdvertAt < ADVERT_COOLDOWN_MS) {
    const waitMin = Math.ceil((ADVERT_COOLDOWN_MS - (now - _lastAdvertAt)) / 60000);
    throw { status: 429, detail: `Attendez encore ${waitMin} min avant la prochaine annonce.` };
  }
  const me = await uid();
  const trimmedTitle = title.trim();
  const trimmedBody = content.trim();
  if (!trimmedTitle || !trimmedBody) throw { status: 400, detail: "Titre et message requis" };

  const { data: msg, error } = await getSupabase()
    .from("messages")
    .insert({
      sender_id: me,
      recipient_id: null,
      tontine_id: null,
      message_type: "broadcast",
      title: trimmedTitle,
      content: trimmedBody,
      is_read: false,
    })
    .select("id")
    .single();
  throwSb(error);

  const { data: profiles } = await getSupabase().from("profiles").select("id");
  for (const p of profiles ?? []) {
    notifyUser({
      user_id: p.id,
      title: trimmedTitle,
      body: trimmedBody.slice(0, 120),
      type: "promotion",
      metadata: { action_url: "/messages" },
      push: true,
    }).catch(() => {});
  }

  _lastAdvertAt = Date.now();
  return { detail: `Annonce envoyée à ${profiles?.length ?? 0} membres`, message_id: msg?.id };
}
