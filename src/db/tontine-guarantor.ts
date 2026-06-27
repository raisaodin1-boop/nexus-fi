import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { addIdentityEvent } from "./identity";
import { notifyUser } from "./notifications";
import { profileDisplayMap, profileFromMap } from "@/src/profile-display";

export interface TontineGuarantor {
  id: string;
  tontine_id: string;
  member_id: string;
  member_name: string;
  member_kyc_verified: boolean;
  guarantor_id: string;
  guarantor_name: string;
  guarantor_kyc_verified: boolean;
  status: "active" | "claimed" | "released";
  created_at: string;
}

export async function listTontineGuarantors(tontineId: string): Promise<TontineGuarantor[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tontine_guarantors")
    .select("id, tontine_id, member_id, guarantor_id, status, created_at")
    .eq("tontine_id", tontineId)
    .order("created_at", { ascending: false });
  throwSb(error);
  if (!data?.length) return [];

  const ids = [...new Set(data.flatMap((r) => [r.member_id, r.guarantor_id]))];
  const profiles = await profileDisplayMap(ids);

  return data.map((row) => {
    const member = profileFromMap(profiles, row.member_id);
    const guarantor = profileFromMap(profiles, row.guarantor_id);
    return {
      id: row.id,
      tontine_id: row.tontine_id,
      member_id: row.member_id,
      member_name: member.full_name,
      member_kyc_verified: member.kyc_verified,
      guarantor_id: row.guarantor_id,
      guarantor_name: guarantor.full_name,
      guarantor_kyc_verified: guarantor.kyc_verified,
      status: row.status as TontineGuarantor["status"],
      created_at: row.created_at,
    };
  });
}

export async function assignTontineGuarantors(
  tontineId: string,
  guarantorRefs: string[] | string,
): Promise<{ assigned: number }> {
  const me = await uid();
  const sb = getSupabase();

  const { count: isMember } = await sb.from("tontine_members")
    .select("*", { count: "exact", head: true })
    .eq("tontine_id", tontineId)
    .eq("user_id", me);
  if (!isMember) throw { status: 403, detail: "Vous devez être membre de cette tontine." };

  const rawRefs = Array.isArray(guarantorRefs)
    ? guarantorRefs
    : guarantorRefs.split(/[,;]/);
  const refs = [...new Set(rawRefs.map((r) => r.trim()).filter(Boolean))].slice(0, 2);
  if (!refs.length) throw { status: 400, detail: "Indiquez au moins un garant (téléphone ou email HODIX)." };

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const guarantorIds: string[] = [];
  for (const ref of refs) {
    let profileId: string | null = null;
    if (uuidRe.test(ref)) {
      const { data: profile } = await sb.from("profiles").select("id").eq("id", ref).maybeSingle();
      profileId = profile?.id ?? null;
    } else if (ref.includes("@")) {
      const { data: rows } = await sb.rpc("lookup_profile_by_email", { p_email: ref.toLowerCase() });
      profileId = (rows as { id: string }[] | null)?.[0]?.id ?? null;
    } else {
      const { data: rows } = await sb.rpc("lookup_profile_by_phone", { p_phone: ref });
      profileId = (rows as { id: string }[] | null)?.[0]?.id ?? null;
    }
    if (!profileId) throw { status: 404, detail: `Garant introuvable : ${ref}` };
    if (profileId === me) throw { status: 400, detail: "Vous ne pouvez pas vous désigner comme garant." };
    guarantorIds.push(profileId);
  }

  await sb.from("tontine_guarantors")
    .delete()
    .eq("tontine_id", tontineId)
    .eq("member_id", me)
    .eq("status", "active");

  for (const guarantorId of guarantorIds) {
    const { error } = await sb.from("tontine_guarantors").insert({
      tontine_id: tontineId,
      member_id: me,
      guarantor_id: guarantorId,
      status: "active",
    });
    throwSb(error);

    await notifyUser({
      user_id: guarantorId,
      title: "🤝 Giga-Garant — vous êtes désigné garant",
      body: "Un membre de tontine vous a choisi comme garant de confiance sur HODIX.",
      type: "guarantor",
      metadata: { tontine_id: tontineId, member_id: me },
    });
  }

  return { assigned: guarantorIds.length };
}

export async function claimGuarantorLiability(
  tontineId: string,
  memberId: string,
  reason?: string,
): Promise<{ claimed: number }> {
  const me = await uid();
  const sb = getSupabase();

  const { data: caller } = await sb.from("tontine_members")
    .select("role")
    .eq("tontine_id", tontineId)
    .eq("user_id", me)
    .maybeSingle();
  const { data: tontine } = await sb.from("tontines").select("owner_id, name").eq("id", tontineId).single();
  const isAdmin = caller?.role === "admin" || tontine?.owner_id === me;
  if (!isAdmin) throw { status: 403, detail: "Seul l'admin peut activer la garantie solidaire." };

  const { data: guarantors } = await sb.from("tontine_guarantors")
    .select("id, guarantor_id")
    .eq("tontine_id", tontineId)
    .eq("member_id", memberId)
    .eq("status", "active");

  if (!guarantors?.length) throw { status: 404, detail: "Aucun garant actif pour ce membre." };

  let claimed = 0;
  for (const g of guarantors) {
    await sb.from("tontine_guarantors").update({ status: "claimed" }).eq("id", g.id);
    await addIdentityEvent(g.guarantor_id, "guarantor_claimed", -35);
    await notifyUser({
      user_id: g.guarantor_id,
      title: "⚠️ Garantie activée",
      body: `La garantie solidaire a été activée pour un membre de « ${tontine?.name ?? "tontine"} ». ${reason ?? "Défaut de paiement."}`,
      type: "guarantor_claim",
      metadata: { tontine_id: tontineId, member_id: memberId },
    });
    claimed++;
  }

  await notifyUser({
    user_id: memberId,
    title: "Garantie solidaire activée",
    body: `Vos garants ont été notifiés suite à un défaut sur « ${tontine?.name ?? "tontine"} ».`,
    type: "guarantor_member",
    metadata: { tontine_id: tontineId },
  });

  return { claimed };
}

export async function getMyGuarantorAssignments(tontineId: string) {
  const me = await uid();
  const sb = getSupabase();
  const { data } = await sb
    .from("tontine_guarantors")
    .select("id, guarantor_id, status")
    .eq("tontine_id", tontineId)
    .eq("member_id", me)
    .eq("status", "active");
  if (!data?.length) return [];

  const ids = data.map((g) => g.guarantor_id);
  const profiles = await profileDisplayMap(ids);

  return data.map((g) => {
    const prof = profileFromMap(profiles, g.guarantor_id);
    return {
      id: g.id,
      guarantor_id: g.guarantor_id,
      guarantor_name: prof.full_name,
      guarantor_kyc_verified: prof.kyc_verified,
      status: g.status,
    };
  });
}
