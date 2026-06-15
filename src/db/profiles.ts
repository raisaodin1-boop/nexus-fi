import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { notifyUser } from "./notifications";
import { sendMessage } from "./messages";

export async function getMe() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", me)
    .single();
  throwSb(error);
  const { data: sbUser } = await getSupabase().auth.getUser();
  return {
    ...data,
    id: me,
    email: sbUser.user?.email ?? "",
    is_email_verified: !!sbUser.user?.email_confirmed_at,
  };
}

export async function updateMe(body: Record<string, any>) {
  const me = await uid();
  const payload = { ...body, updated_at: new Date().toISOString() };

  // Postgres `date` columns reject "" — coerce empty optional dates to null.
  if ("date_of_birth" in payload) {
    const dob = payload.date_of_birth;
    if (typeof dob === "string" && dob.trim() === "") payload.date_of_birth = null;
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .update(payload)
    .eq("id", me)
    .select()
    .maybeSingle();
  throwSb(error);
  return data ?? { id: me, ...body };
}

export async function requestDataExport() {
  const me = await uid();
  const sb = getSupabase();
  const profile = await getMe();

  await notifyUser({
    user_id: me,
    title: "Export de données demandé",
    body: "Votre demande a été enregistrée. Vous recevrez vos données par email sous 48h.",
    type: "data_export",
    push: false,
  });

  const { data: admins } = await sb
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin"])
    .limit(3);
  for (const admin of admins ?? []) {
    try {
      await sendMessage({
        recipient_id: admin.id,
        content: `[RGPD — Export] ${profile.full_name || "Membre"} (${profile.email}) demande une copie de ses données. User ID: ${me}`,
      });
    } catch { /* best-effort admin alert */ }
  }

  return { detail: "Demande enregistrée", email: profile.email };
}

export async function requestAccountDeletion() {
  const me = await uid();
  const sb = getSupabase();
  const profile = await getMe();

  await notifyUser({
    user_id: me,
    title: "Suppression de compte demandée",
    body: "Votre demande a été transmise à notre équipe. Vous serez contacté sous 48h.",
    type: "account_deletion",
    push: false,
  });

  const { data: admins } = await sb
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin"])
    .limit(3);
  for (const admin of admins ?? []) {
    try {
      await sendMessage({
        recipient_id: admin.id,
        content: `[RGPD — Suppression] ${profile.full_name || "Membre"} (${profile.email}) demande la suppression de son compte. User ID: ${me}`,
      });
    } catch { /* best-effort admin alert */ }
  }

  return { detail: "Demande enregistrée" };
}
