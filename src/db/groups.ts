import { getSupabase } from "@/src/supabase";
import { uid, throwSb, inviteCode, isUniqueViolation } from "./helpers";

/* ── ASSOCIATIONS ────────────────────────────────────────────── */

export async function listAssociations() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("association_members").select("associations(*, association_members(count))").eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => ({
    ...row.associations, members_count: row.associations?.association_members?.[0]?.count ?? 0,
  }));
}

export async function getAssociation(id: string) {
  const { data, error } = await getSupabase()
    .from("associations").select("*, association_members(*, profiles(full_name)), association_contributions(*)").eq("id", id).single();
  throwSb(error);
  return { association: data };
}

export async function createAssociation(body: Record<string, any>) {
  const me = await uid();
  const sb = getSupabase();
  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb
      .from("associations")
      .insert({ ...body, owner_id: me, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }
  await sb.from("association_members").insert({ association_id: data.id, user_id: me, role: "admin" });
  return data;
}

export async function joinAssociation(invite_code: string) {
  const me = await uid();
  const { data: assoc, error } = await getSupabase()
    .from("associations").select("id").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !assoc) throw { status: 404, detail: "Code d'invitation invalide" };
  const { error: e2 } = await getSupabase().from("association_members")
    .insert({ association_id: assoc.id, user_id: me, role: "member" });
  throwSb(e2);
  return { association_id: assoc.id };
}

export async function contributeAssociation(id: string, amount: number) {
  const me = await uid();
  const { error } = await getSupabase().from("association_contributions")
    .insert({ association_id: id, user_id: me, amount });
  throwSb(error);
  return { detail: "Contribution enregistrée" };
}

/* ── COOPERATIVES ────────────────────────────────────────────── */

export async function listCooperatives() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("cooperative_members").select("cooperatives(*, cooperative_members(count))").eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((row: any) => ({
    ...row.cooperatives, members_count: row.cooperatives?.cooperative_members?.[0]?.count ?? 0,
  }));
}

export async function getCooperative(id: string) {
  const { data, error } = await getSupabase()
    .from("cooperatives").select("*, cooperative_members(*, profiles(full_name)), cooperative_contributions(*)").eq("id", id).single();
  throwSb(error);
  return { cooperative: data };
}

export async function createCooperative(body: Record<string, any>) {
  const me = await uid();
  const sb = getSupabase();
  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb
      .from("cooperatives")
      .insert({ ...body, owner_id: me, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }
  await sb.from("cooperative_members").insert({ cooperative_id: data.id, user_id: me, role: "admin" });
  return data;
}

export async function joinCooperative(invite_code: string) {
  const me = await uid();
  const { data: coop, error } = await getSupabase()
    .from("cooperatives").select("id").eq("invite_code", invite_code.trim().toUpperCase()).single();
  if (error || !coop) throw { status: 404, detail: "Code invalide" };
  await getSupabase().from("cooperative_members").insert({ cooperative_id: coop.id, user_id: me, role: "member" });
  return { cooperative_id: coop.id };
}

export async function contributeCooperative(id: string, amount: number) {
  const me = await uid();
  await getSupabase().from("cooperative_contributions").insert({ cooperative_id: id, user_id: me, amount });
  return { detail: "Contribution enregistrée" };
}

/* ── COMMUNITY FUNDS ─────────────────────────────────────────── */

export async function listFunds() {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("fund_members").select("community_funds(*)").eq("user_id", me);
  throwSb(error);
  return (data ?? []).map((r: any) => r.community_funds);
}

export async function getFund(id: string) {
  const { data, error } = await getSupabase()
    .from("community_funds").select("*, fund_contributions(*, profiles(full_name)), fund_members(count)").eq("id", id).single();
  throwSb(error);
  return { fund: data, members_count: data?.fund_members?.[0]?.count ?? 0 };
}

export async function createFund(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("community_funds").insert({ ...body, owner_id: me }).select().single();
  throwSb(error);
  await getSupabase().from("fund_members").insert({ fund_id: data.id, user_id: me });
  return data;
}

export async function contributeFund(id: string, amount: number) {
  const me = await uid();
  await getSupabase().from("fund_contributions").insert({ fund_id: id, user_id: me, amount });
  const { data: contribs } = await getSupabase().from("fund_contributions").select("amount").eq("fund_id", id);
  const total = (contribs ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
  await getSupabase().from("community_funds").update({ current_balance: total }).eq("id", id);
  return { detail: "Contribution enregistrée" };
}
