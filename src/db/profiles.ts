import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

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
