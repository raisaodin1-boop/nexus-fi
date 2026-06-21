/**
 * HODIX — envoi de notifications push via Expo Push API.
 * Appelé par le trigger DB ou directement par d'autres Edge Functions.
 * Respecte push_consent sur le profil utilisateur.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHANNEL_BY_TYPE: Record<string, string> = {
  info: "default",
  message: "messages",
  promotion: "promotions",
  broadcast: "promotions",
  payment: "payments",
  success: "payments",
  tontine_reminder: "alerts",
  tontine_cycle: "alerts",
  warning: "alerts",
  alert: "alerts",
  security_freeze: "alerts",
  otp: "alerts",
  kyc: "default",
  kyc_rejected: "alerts",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  badge?: number;
};

async function sendExpoBatch(messages: ExpoMessage[]): Promise<{ sent: number; errors: string[]; invalidTokens: string[] }> {
  const errors: string[] = [];
  const invalidTokens: string[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        errors.push(`Expo HTTP ${resp.status}`);
        continue;
      }
      const tickets = Array.isArray(result?.data) ? result.data : [result?.data].filter(Boolean);
      for (let j = 0; j < tickets.length; j++) {
        const t = tickets[j];
        const token = chunk[j]?.to;
        if (t?.status === "ok") {
          sent++;
        } else {
          const msg = String(t?.message ?? t?.details?.error ?? "push_error");
          errors.push(msg);
          if (/not registered|device not registered|invalid.*token/i.test(msg) && token) {
            invalidTokens.push(token);
          }
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Expo push failed");
    }
  }
  return { sent, errors, invalidTokens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer === serviceKey;
  let callerUserId: string | null = null;
  if (!isService) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    callerUserId = user?.id ?? null;
    if (!callerUserId) return json({ ok: false, error: "Non authentifié." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? callerUserId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const msgBody = String(body.body ?? "").trim();
  const type = String(body.type ?? body.kind ?? "info");
  const actionUrl = body.action_url ? String(body.action_url) : null;
  const userIds: string[] = Array.isArray(body.user_ids)
    ? body.user_ids.map((id: unknown) => String(id))
    : userId ? [userId] : [];

  if (!userIds.length || !title || !msgBody) {
    return json({ ok: false, error: "user_id(s), title et body requis." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, push_consent")
    .in("id", userIds);

  const consentMap = new Map((profiles ?? []).map((p) => [p.id, p.push_consent !== false]));

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", userIds);

  const messages: ExpoMessage[] = [];
  let skipped = 0;

  for (const uid of userIds) {
    if (!consentMap.get(uid)) { skipped++; continue; }

    const { count } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("is_read", false);

    const userTokens = (tokens ?? []).filter((r) => r.user_id === uid);
    const channelId = CHANNEL_BY_TYPE[type] ?? "default";
    const isAlert = channelId === "alerts";

    for (const row of userTokens) {
      const token = String(row.token ?? "");
      if (!token.startsWith("ExponentPushToken[")) { skipped++; continue; }
      messages.push({
        to: token,
        title,
        body: msgBody,
        sound: "default",
        channelId,
        priority: isAlert ? "high" : "high",
        badge: count ?? 1,
        data: {
          type,
          notification_id: body.notification_id ?? null,
          action_url: actionUrl,
          route: actionUrl,
        },
      });
    }
    if (!userTokens.length) skipped++;
  }

  if (!messages.length) {
    return json({ ok: true, sent: 0, skipped, reason: "no_valid_tokens" });
  }

  const { sent, errors, invalidTokens } = await sendExpoBatch(messages);

  if (invalidTokens.length) {
    await admin.from("push_tokens").delete().in("token", invalidTokens);
  }

  return json({ ok: true, sent, skipped, errors: errors.length ? errors : undefined });
});
