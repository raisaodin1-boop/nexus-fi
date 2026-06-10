/**
 * HODIX — envoi de notifications push via Expo Push API.
 *
 * Appelé après insertion in-app ou directement par d'autres Edge Functions.
 * Respecte push_consent sur le profil utilisateur.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
};

async function sendExpoBatch(messages: ExpoMessage[]): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
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
      for (const t of tickets) {
        if (t?.status === "ok") sent++;
        else if (t?.message) errors.push(String(t.message));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Expo push failed");
    }
  }
  return { sent, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Accepte JWT utilisateur, anon key, ou service role (appels internes)
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
  for (const row of tokens ?? []) {
    if (!consentMap.get(row.user_id)) { skipped++; continue; }
    const token = String(row.token ?? "");
    if (!token.startsWith("ExponentPushToken[")) { skipped++; continue; }
    messages.push({
      to: token,
      title,
      body: msgBody,
      sound: "default",
      channelId: "default",
      data: {
        type,
        notification_id: body.notification_id ?? null,
        action_url: body.action_url ?? null,
      },
    });
  }

  if (!messages.length) {
    return json({ ok: true, sent: 0, skipped, reason: "no_valid_tokens" });
  }

  const { sent, errors } = await sendExpoBatch(messages);
  return json({ ok: true, sent, skipped, errors: errors.length ? errors : undefined });
});
