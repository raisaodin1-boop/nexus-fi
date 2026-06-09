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
  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", me)
    .select()
    .maybeSingle();
  throwSb(error);
  return data ?? { id: me, ...body };
}
