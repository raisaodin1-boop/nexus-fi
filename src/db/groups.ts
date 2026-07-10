import { getSupabase } from "@/src/supabase";
import { profileDisplayMap, profileFromMap } from "@/src/profile-display";
import { uid, throwSb, inviteCode, isUniqueViolation, requireAdmin } from "./helpers";

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
  const fee = Number(body.contribution_amount ?? body.membership_fee ?? 0);
  const insertRow = {
    name: String(body.name ?? "").trim(),
    description: body.description ?? null,
    currency: body.currency ?? "XAF",
    contribution_amount: Number.isFinite(fee) ? fee : 0,
    frequency: body.frequency ?? "monthly",
    is_public: body.is_public !== false,
    category: body.category ?? null,
    owner_id: me,
    invite_code: inviteCode(),
  };
  if (!insertRow.name) throw { status: 400, detail: "Nom requis" };

  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb
      .from("associations")
      .insert({ ...insertRow, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }
  await sb.from("association_members").insert({ association_id: data.id, user_id: me, role: "admin" });
  return data;
}

export async function joinAssociation(invite_code: string) {
  const { data, error } = await getSupabase().rpc("join_association_by_code", {
    p_code: String(invite_code ?? "").trim(),
  });
  if (error) {
    const msg = error.message ?? "";
    if (/invalide|introuvable/i.test(msg)) throw { status: 404, detail: "Code d'invitation invalide" };
    if (/déjà membre/i.test(msg)) throw { status: 400, detail: "Vous êtes déjà membre de cette association" };
    throwSb(error);
  }
  return data as { association_id: string; already_member?: boolean };
}

export async function listPublicAssociations() {
  const { data, error } = await getSupabase()
    .from("associations")
    .select("id, name, description, contribution_amount, currency, frequency, is_public, category, created_at, owner_id, association_members(count)")
    .eq("is_public", true)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(error);
  return (data ?? []).map((a: any) => ({
    ...a,
    members_count: a.association_members?.[0]?.count ?? 0,
    association_members: undefined,
  }));
}

export async function requestJoinAssociation(association_id: string, message?: string) {
  const { data, error } = await getSupabase().rpc("request_join_association", {
    p_association_id: association_id,
    p_message: message ?? null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/déjà membre/i.test(msg)) throw { status: 400, detail: "Vous êtes déjà membre" };
    if (/privée/i.test(msg)) throw { status: 403, detail: msg };
    throwSb(error);
  }
  return data;
}

export async function listAssociationJoinRequests(associationId?: string) {
  const sb = getSupabase();
  let q = sb
    .from("association_join_requests")
    .select("*, associations(id, name, owner_id)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (associationId) q = q.eq("association_id", associationId);
  const { data, error } = await q;
  throwSb(error);
  const rows = data ?? [];
  const ids = rows.map((r: any) => r.requester_id);
  const profiles = await profileDisplayMap(ids);
  return rows.map((r: any) => ({
    ...r,
    requester_name: profileFromMap(profiles, r.requester_id).full_name,
    association_name: r.associations?.name ?? "Association",
  }));
}

export async function respondAssociationJoin(request_id: string, approve: boolean) {
  const { data, error } = await getSupabase().rpc("respond_association_join", {
    p_request_id: request_id,
    p_approve: approve,
  });
  if (error) throwSb(error);
  return data;
}

export async function requestMemberRemoval(opts: {
  group_type: "tontine" | "association" | "cooperative" | "fund";
  group_id: string;
  target_user_id: string;
  reason: string;
}) {
  const { data, error } = await getSupabase().rpc("request_member_removal", {
    p_group_type: opts.group_type,
    p_group_id: opts.group_id,
    p_target_user_id: opts.target_user_id,
    p_reason: opts.reason,
  });
  if (error) throwSb(error);
  return data;
}

export async function listMemberRemovalRequests() {
  await requireAdmin();
  const { data, error } = await getSupabase()
    .from("member_removal_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  throwSb(error);
  const rows = data ?? [];
  const ids = [...rows.map((r: any) => r.target_user_id), ...rows.map((r: any) => r.requested_by)];
  const profiles = await profileDisplayMap(ids);
  return rows.map((r: any) => ({
    ...r,
    target_name: profileFromMap(profiles, r.target_user_id).full_name,
    requester_name: profileFromMap(profiles, r.requested_by).full_name,
  }));
}

export async function adminExecuteMemberRemoval(request_id: string, approve: boolean) {
  await requireAdmin();
  const { data, error } = await getSupabase().rpc("admin_execute_member_removal", {
    p_request_id: request_id,
    p_approve: approve,
  });
  if (error) throwSb(error);
  return data;
}

export async function adminDeleteAssociation(association_id: string, reason?: string) {
  await requireAdmin();
  const { data, error } = await getSupabase().rpc("admin_delete_association", {
    p_association_id: association_id,
    p_reason: reason ?? null,
  });
  if (error) throwSb(error);
  return data;
}

export async function listOwnedGroups() {
  const me = await uid();
  const sb = getSupabase();
  const [tontines, associations, cooperatives, funds] = await Promise.all([
    sb.from("tontines").select("id, name, invite_code, is_public, created_at, tontine_members(count)").or(`owner_id.eq.${me},creator_id.eq.${me}`),
    sb.from("associations").select("id, name, invite_code, is_public, contribution_amount, created_at, association_members(count)").eq("owner_id", me),
    sb.from("cooperatives").select("id, name, invite_code, created_at, cooperative_members(count)").eq("owner_id", me),
    sb.from("community_funds").select("id, name, created_at, fund_members(count)").eq("owner_id", me),
  ]);
  return {
    tontines: (tontines.data ?? []).map((t: any) => ({
      id: t.id, name: t.name, invite_code: t.invite_code, is_public: t.is_public,
      created_at: t.created_at, kind: "tontine" as const,
      members_count: t.tontine_members?.[0]?.count ?? 0,
    })),
    associations: (associations.data ?? []).map((a: any) => ({
      id: a.id, name: a.name, invite_code: a.invite_code, is_public: a.is_public,
      contribution_amount: a.contribution_amount, created_at: a.created_at,
      kind: "association" as const, members_count: a.association_members?.[0]?.count ?? 0,
    })),
    cooperatives: (cooperatives.data ?? []).map((c: any) => ({
      id: c.id, name: c.name, invite_code: c.invite_code, created_at: c.created_at,
      kind: "cooperative" as const, members_count: c.cooperative_members?.[0]?.count ?? 0,
    })),
    funds: (funds.data ?? []).map((f: any) => ({
      id: f.id, name: f.name, created_at: f.created_at,
      kind: "fund" as const, members_count: f.fund_members?.[0]?.count ?? 0,
    })),
  };
}

export async function joinCooperative(invite_code: string) {
  const { data, error } = await getSupabase().rpc("join_cooperative_by_code", {
    p_code: String(invite_code ?? "").trim(),
  });
  if (error) {
    if (/invalide/i.test(error.message ?? "")) throw { status: 404, detail: "Code d'invitation invalide" };
    throwSb(error);
  }
  return data as { cooperative_id: string };
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
  const insertRow = {
    name: String(body.name ?? "").trim(),
    description: body.description ?? null,
    currency: body.currency ?? "XAF",
    owner_id: me,
    invite_code: inviteCode(),
  };
  if (!insertRow.name) throw { status: 400, detail: "Nom requis" };

  let data: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb
      .from("cooperatives")
      .insert({ ...insertRow, invite_code: inviteCode() })
      .select().single();
    if (!error) { data = row; break; }
    if (!isUniqueViolation(error) || attempt === 4) throwSb(error);
  }
  await sb.from("cooperative_members").insert({ cooperative_id: data.id, user_id: me, role: "admin" });
  return data;
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
