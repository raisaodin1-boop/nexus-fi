/**
 * HODIX — tâches planifiées tontines (rappels J-7/J-3/J-1/J/retard, en_retard, avancement, escrow).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const FREQ_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };

type ReminderKind = "j7" | "j3" | "j1" | "j0" | "late";

function reminderKindForHours(hoursLeft: number): ReminderKind | null {
  if (hoursLeft <= -24 && hoursLeft >= -168) return "late";
  if (hoursLeft <= 0 && hoursLeft > -24) return "j0";
  if (hoursLeft <= 24 && hoursLeft > 0) return "j1";
  if (hoursLeft <= 72 && hoursLeft > 48) return "j3";
  if (hoursLeft <= 168 && hoursLeft > 144) return "j7";
  return null;
}

function reminderCopy(kind: ReminderKind, name: string, cycle: number): { title: string; body: string } {
  switch (kind) {
    case "j7":
      return { title: "Rappel cotisation J-7", body: `${name} — cycle ${cycle}. Échéance dans 7 jours.` };
    case "j3":
      return { title: "Rappel cotisation J-3", body: `${name} — cycle ${cycle}. Échéance dans 3 jours.` };
    case "j1":
      return { title: "Rappel cotisation J-1", body: `${name} — cycle ${cycle}. Échéance demain.` };
    case "j0":
      return { title: "Échéance aujourd'hui", body: `${name} — cycle ${cycle}. Cotisez aujourd'hui.` };
    case "late":
      return { title: "Cotisation en retard", body: `${name} — cycle ${cycle}. Vous êtes en retard.` };
  }
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
  let markedLate = 0;
  let advanced = 0;
  let escrowReleased = 0;

  const { data: tontines } = await admin.from("tontines")
    .select("id, name, current_cycle, cycle_deadline, max_members, frequency, auto_advance, owner_id");

  for (const t of tontines ?? []) {
    const cycle = t.current_cycle ?? 1;
    let deadline = t.cycle_deadline ? new Date(t.cycle_deadline) : null;

    // Heal missing deadlines so reminders can run
    if (!deadline) {
      const days = FREQ_DAYS[(t.frequency ?? "monthly").toLowerCase()] ?? 30;
      deadline = new Date(now.getTime() + days * 86400000);
      await admin.from("tontines").update({
        current_cycle: cycle,
        cycle_deadline: deadline.toISOString(),
      }).eq("id", t.id);
    }

    const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;
    const kind = reminderKindForHours(hoursLeft);

    const { data: members } = await admin.from("tontine_members")
      .select("user_id, last_paid_cycle, status, profiles(phone, full_name)")
      .eq("tontine_id", t.id).neq("status", "exclu");

    // Mark unpaid members as en_retard after deadline
    if (hoursLeft < 0) {
      for (const m of members ?? []) {
        if ((m.last_paid_cycle ?? 0) >= cycle) continue;
        if (m.status === "en_retard") continue;
        await admin.from("tontine_members").update({
          status: "en_retard",
          cycles_late: Math.max(1, cycle - (m.last_paid_cycle ?? 0)),
        }).eq("tontine_id", t.id).eq("user_id", m.user_id);
        markedLate++;
      }
    }

    if (kind) {
      for (const m of members ?? []) {
        if ((m.last_paid_cycle ?? 0) >= cycle) continue;

        const { error: logErr } = await admin.from("tontine_reminder_log").insert({
          tontine_id: t.id,
          user_id: m.user_id,
          cycle,
          reminder_kind: kind,
        });
        if (logErr) continue; // already sent this kind for this cycle

        const copy = reminderCopy(kind, t.name, cycle);
        await admin.from("notifications").insert({
          user_id: m.user_id,
          title: copy.title,
          body: copy.body,
          type: "tontine_reminder",
          is_read: false,
          metadata: { action_url: `/tontines/${t.id}`, kind, cycle },
        });
        const phone = String((m as any).profiles?.phone ?? "").replace(/[\s\-]/g, "");
        if (phone) await sendSms(phone, `HODIX : ${copy.body}`);
        reminders++;
      }
    }

    // Auto-advance when everyone paid and deadline passed
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
          await admin.from("notifications").insert({
            user_id: m.user_id,
            title: `Cycle ${cycle + 1} — ${t.name}`,
            body: "Nouveau cycle démarré automatiquement.",
            type: "tontine_cycle",
            is_read: false,
            metadata: { action_url: `/tontines/${t.id}` },
          });
        }
        advanced++;
      }
    }
  }

  const { data: due } = await admin.from("tontine_escrow")
    .select("id, tontine_id, cycle, tontines(name, owner_id)")
    .eq("status", "held").lte("release_at", now.toISOString()).lt("dispute_count", 2);

  for (const row of due ?? []) {
    const { data: updated } = await admin.from("tontine_escrow")
      .update({ status: "released", release_notified: true })
      .eq("id", row.id)
      .eq("status", "held")
      .eq("release_notified", false)
      .select("id, tontine_id, cycle, tontines(name, owner_id)")
      .maybeSingle();
    if (!updated) continue;
    const ownerId = (updated as any).tontines?.owner_id;
    if (ownerId) {
      await admin.from("notifications").insert({
        user_id: ownerId,
        title: "Escrow libéré",
        body: `Cycle ${updated.cycle} — fonds disponibles.`,
        type: "escrow_release",
        is_read: false,
        metadata: { action_url: `/tontines/${row.tontine_id}` },
      });
    }
    escrowReleased++;
  }

  return new Response(JSON.stringify({
    ok: true, reminders, marked_late: markedLate, advanced, escrow_released: escrowReleased,
  }), { headers: { "Content-Type": "application/json" } });
});
