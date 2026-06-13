/**
 * HODIX — tâches planifiées tontines (rappels, avancement auto, release escrow).
 * Déclencher via Supabase Cron ou POST avec service role.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const FREQ_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };

async function triggerPush(userId: string, title: string, body: string, type: string) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, title, body, type }),
    });
  } catch { /* best-effort */ }
}

async function sendSms(phone: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from || !/^\+?\d{8,15}$/.test(phone)) return false;
  const to = phone.startsWith("+") ? phone : `+${phone}`;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("TONTINE_CRON_SECRET") ?? "";
  const authorized = bearer.length > 0 && (
    bearer === serviceKey || (cronSecret.length > 0 && bearer === cronSecret)
  );
  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  let reminders = 0;
  let advanced = 0;
  let escrowReleased = 0;

  // 1. Rappels cotisation (deadline dans 24h ou dépassée)
  const { data: tontines } = await admin.from("tontines").select("id, name, current_cycle, cycle_deadline, max_members, frequency, auto_advance, owner_id");
  for (const t of tontines ?? []) {
    const cycle = t.current_cycle ?? 1;
    const deadline = t.cycle_deadline ? new Date(t.cycle_deadline) : null;
    if (!deadline) continue;
    const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;
    if (hoursLeft > 24 || hoursLeft < -168) continue;

    const { data: members } = await admin.from("tontine_members")
      .select("user_id, last_paid_cycle, profiles(phone, full_name, push_consent)")
      .eq("tontine_id", t.id).neq("status", "exclu");

    for (const m of members ?? []) {
      if ((m.last_paid_cycle ?? 0) >= cycle) continue;
      const title = hoursLeft < 0 ? "Cotisation en retard" : "Rappel cotisation tontine";
      const body = `${t.name} — cycle ${cycle}. ${hoursLeft < 0 ? "Vous êtes en retard." : "Échéance demain."}`;
      await admin.from("notifications").insert({ user_id: m.user_id, title, body, type: "tontine_reminder", is_read: false });
      await triggerPush(m.user_id, title, body, "tontine_reminder");
      const phone = String((m as any).profiles?.phone ?? "").replace(/[\s\-]/g, "");
      if (phone) await sendSms(phone, `HODIX : ${body}`);
      reminders++;
    }

    // 2. Avancement auto si tous ont payé et deadline passée
    if (t.auto_advance !== false && now > deadline) {
      const overdue = (members ?? []).some((m) => (m.last_paid_cycle ?? 0) < cycle);
      if (!overdue) {
        const days = FREQ_DAYS[(t.frequency ?? "monthly").toLowerCase()] ?? 30;
        const nextDeadline = new Date(Date.now() + days * 86400000).toISOString();
        await admin.from("tontines").update({
          current_cycle: cycle + 1,
          cycle_deadline: nextDeadline,
        }).eq("id", t.id);
        for (const m of members ?? []) {
          await triggerPush(m.user_id, `Cycle ${cycle + 1} — ${t.name}`, "Nouveau cycle démarré automatiquement.", "tontine_cycle");
        }
        advanced++;
      }
    }
  }

  // 3. Release escrow
  const { data: due } = await admin.from("tontine_escrow")
    .select("id, tontine_id, cycle, tontines(name, owner_id)")
    .eq("status", "held").lte("release_at", now.toISOString()).lt("dispute_count", 2);

  for (const row of due ?? []) {
    await admin.from("tontine_escrow").update({ status: "released" }).eq("id", row.id);
    const ownerId = (row as any).tontines?.owner_id;
    if (ownerId) {
      await triggerPush(ownerId, "Escrow libéré", `Cycle ${row.cycle} — fonds disponibles.`, "escrow_release");
    }
    escrowReleased++;
  }

  return new Response(JSON.stringify({
    ok: true, reminders, advanced, escrow_released: escrowReleased,
  }), { headers: { "Content-Type": "application/json" } });
});
