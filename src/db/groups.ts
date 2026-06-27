import { getSupabase } from "@/src/supabase";
import { profileDisplayMap, profileFromMap } from "@/src/profile-display";
import { uid, throwSb, inviteCode, isUniqueViolation } from "./helpers";

type GroupMemberRow = { user_id: string; role?: string; [key: string]: unknown };
type GroupContribRow = { id: string; user_id: string; amount?: number | string; created_at: string; [key: string]: unknown };

async function buildCommunityGroupDetail(
  me: string,
  entity: Record<string, unknown>,
  members: GroupMemberRow[],
  contributions: GroupContribRow[],
) {
  const memberProfiles = await profileDisplayMap(members.map((m) => m.user_id));
  const contribProfiles = await profileDisplayMap(contributions.map((c) => c.user_id));

  const membersList = members.map((m) => {
    const prof = profileFromMap(memberProfiles, m.user_id);
    return {
      ...m,
      full_name: prof.full_name,
      kyc_verified: prof.kyc_verified,
    };
  });

  const contributionsList = contributions.map((c) => {
    const prof = profileFromMap(contribProfiles, c.user_id);
    return {
      id: c.id,
      user_id: c.user_id,
      full_name: prof.full_name,
      kyc_verified: prof.kyc_verified,
      amount: Number(c.amount ?? 0),
      created_at: c.created_at,
    };
  });

  const totalCollected = contributionsList.reduce((sum, c) => sum + c.amount, 0);
  const myMember = membersList.find((m) => m.user_id === me);
  const ownerId = entity.owner_id as string | undefined;
  const isAdmin = ownerId === me || myMember?.role === "admin";

  const enriched = {
    ...entity,
    members_count: membersList.length,
    total_collected: totalCollected,
    currency: (entity.currency as string | undefined) ?? "XAF",
  };

  return { enriched, isAdmin, membersList, contributionsList };
}

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
  const me = await uid();
  const sb = getSupabase();

  const { data: association, error } = await sb.from("associations").select("*").eq("id", id).single();
  throwSb(error);

  const { data: members, error: membersErr } = await sb
    .from("association_members")
    .select("*")
    .eq("association_id", id);
  throwSb(membersErr);

  const { data: contributions, error: contribErr } = await sb
    .from("association_contributions")
    .select("*")
    .eq("association_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(contribErr);

  const { enriched, isAdmin, membersList, contributionsList } = await buildCommunityGroupDetail(
    me,
    association as Record<string, unknown>,
    (members ?? []) as GroupMemberRow[],
    (contributions ?? []) as GroupContribRow[],
  );

  return {
    association: enriched,
    is_admin: isAdmin,
    members: membersList,
    contributions: contributionsList,
  };
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

export async function contributeAssociation(id: string, amount: number, paymentId?: string) {
  if (!paymentId) throw { status: 403, detail: "Paiement électronique requis." };
  const { error } = await getSupabase().rpc("contribute_association_paid", {
    p_association_id: id,
    p_amount: amount,
    p_payment_id: paymentId,
  });
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
  const me = await uid();
  const sb = getSupabase();

  const { data: cooperative, error } = await sb.from("cooperatives").select("*").eq("id", id).single();
  throwSb(error);

  const { data: members, error: membersErr } = await sb
    .from("cooperative_members")
    .select("*")
    .eq("cooperative_id", id);
  throwSb(membersErr);

  const { data: contributions, error: contribErr } = await sb
    .from("cooperative_contributions")
    .select("*")
    .eq("cooperative_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(contribErr);

  const { enriched, isAdmin, membersList, contributionsList } = await buildCommunityGroupDetail(
    me,
    cooperative as Record<string, unknown>,
    (members ?? []) as GroupMemberRow[],
    (contributions ?? []) as GroupContribRow[],
  );

  return {
    cooperative: enriched,
    is_admin: isAdmin,
    members: membersList,
    contributions: contributionsList,
  };
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

export async function contributeCooperative(id: string, amount: number, paymentId?: string) {
  if (!paymentId) throw { status: 403, detail: "Paiement électronique requis." };
  const { error } = await getSupabase().rpc("contribute_cooperative_paid", {
    p_cooperative_id: id,
    p_amount: amount,
    p_payment_id: paymentId,
  });
  throwSb(error);
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
  const me = await uid();
  const sb = getSupabase();

  const { data: fund, error } = await sb.from("community_funds").select("*").eq("id", id).single();
  throwSb(error);

  const { data: members, error: membersErr } = await sb
    .from("fund_members")
    .select("*")
    .eq("fund_id", id);
  throwSb(membersErr);

  const { data: contributions, error: contribErr } = await sb
    .from("fund_contributions")
    .select("*")
    .eq("fund_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(contribErr);

  const { enriched, isAdmin, membersList, contributionsList } = await buildCommunityGroupDetail(
    me,
    fund as Record<string, unknown>,
    (members ?? []).map((m: any) => ({ ...m, user_id: m.user_id, role: m.role ?? "member" })),
    (contributions ?? []) as GroupContribRow[],
  );

  return {
    fund: enriched,
    members_count: membersList.length,
    is_admin: isAdmin,
    members: membersList,
    contributions: contributionsList,
  };
}

export async function createFund(body: Record<string, any>) {
  const me = await uid();
  const { data, error } = await getSupabase()
    .from("community_funds").insert({ ...body, owner_id: me }).select().single();
  throwSb(error);
  await getSupabase().from("fund_members").insert({ fund_id: data.id, user_id: me });
  return data;
}

export async function contributeFund(id: string, amount: number, paymentId?: string) {
  if (!paymentId) throw { status: 403, detail: "Paiement électronique requis." };
  const { error } = await getSupabase().rpc("contribute_fund_paid", {
    p_fund_id: id,
    p_amount: amount,
    p_payment_id: paymentId,
  });
  throwSb(error);
  return { detail: "Contribution enregistrée" };
}
