import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";
import { profileDisplayMap, profileFromMap } from "@/src/profile-display";

export interface AuctionBid {
  id: string;
  tontine_id: string;
  user_id: string;
  full_name: string;
  kyc_verified: boolean;
  bid_amount: number;
  cycle: number;
  created_at: string;
}

export interface AuctionState {
  tontine_id: string;
  cycle: number;
  ends_at: string;
  pot_amount: number;
  top_bid: AuctionBid | null;
  my_bid: AuctionBid | null;
  bids: AuctionBid[];
  is_closed: boolean;
}

export interface AuctionTontineOption {
  id: string;
  name: string;
  auction_closed: boolean;
  auction_ends_at: string | null;
  current_cycle: number;
}

export async function listMyAuctionTontines(): Promise<AuctionTontineOption[]> {
  const me = await uid();
  const sb = getSupabase();
  const { data: memberships, error } = await sb
    .from("tontine_members")
    .select("tontine_id, tontines(id, name, auction_closed, auction_ends_at, current_cycle)")
    .eq("user_id", me)
    .neq("status", "exclu");
  throwSb(error);

  return (memberships ?? [])
    .map((m: any) => {
      const t = m.tontines;
      if (!t?.id) return null;
      return {
        id: String(t.id),
        name: String(t.name ?? "Tontine"),
        auction_closed: t.auction_closed !== false,
        auction_ends_at: t.auction_ends_at ?? null,
        current_cycle: Number(t.current_cycle ?? 1),
      } as AuctionTontineOption;
    })
    .filter(Boolean) as AuctionTontineOption[];
}

export async function getAuctionState(tontineId: string): Promise<AuctionState> {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine, error: te } = await sb
    .from("tontines")
    .select("current_cycle, contribution_amount, amount_per_cycle, auction_ends_at, auction_closed, tontine_members(count)")
    .eq("id", tontineId)
    .maybeSingle();
  throwSb(te);
  if (!tontine) throw new Error("Tontine introuvable.");

  const membersCount = Number((tontine as any).tontine_members?.[0]?.count ?? 0);
  const contrib = Number((tontine as any).contribution_amount ?? (tontine as any).amount_per_cycle ?? 0);
  const pot = contrib * Math.max(membersCount, 1);

  const { data: bids } = await sb
    .from("tontine_auction_bids")
    .select("id, tontine_id, user_id, bid_amount, cycle, created_at")
    .eq("tontine_id", tontineId)
    .eq("cycle", tontine.current_cycle ?? 1)
    .order("bid_amount", { ascending: false });

  const profiles = await profileDisplayMap((bids ?? []).map((b: { user_id: string }) => b.user_id));

  const mapped: AuctionBid[] = (bids ?? []).map((b: any) => {
    const prof = profileFromMap(profiles, b.user_id);
    return {
      id: b.id,
      tontine_id: b.tontine_id,
      user_id: b.user_id,
      full_name: prof.full_name,
      kyc_verified: prof.kyc_verified,
      bid_amount: Number(b.bid_amount),
      cycle: b.cycle,
      created_at: b.created_at,
    };
  });

  return {
    tontine_id: tontineId,
    cycle: tontine.current_cycle ?? 1,
    ends_at: tontine.auction_ends_at ?? new Date(Date.now() + 24 * 3600000).toISOString(),
    pot_amount: pot,
    top_bid: mapped[0] ?? null,
    my_bid: mapped.find((b) => b.user_id === me) ?? null,
    bids: mapped,
    is_closed: tontine.auction_closed !== false,
  };
}

export async function placeBid(tontineId: string, bidAmount: number): Promise<void> {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine } = await sb
    .from("tontines")
    .select("current_cycle, contribution_amount, amount_per_cycle, auction_closed, auction_ends_at")
    .eq("id", tontineId)
    .maybeSingle();

  if (tontine?.auction_closed !== false) {
    throw new Error("Les enchères sont fermées. L'admin doit ouvrir le tour anticipé.");
  }
  if (tontine?.auction_ends_at && new Date(tontine.auction_ends_at).getTime() < Date.now()) {
    throw new Error("La fenêtre d'enchères est terminée.");
  }

  const contrib = Number(tontine?.contribution_amount ?? tontine?.amount_per_cycle ?? 0);
  const minBid = contrib * 0.05;
  if (bidAmount < minBid) {
    throw new Error(`L'enchère minimum est de ${Math.round(minBid).toLocaleString("fr-FR")} XAF.`);
  }

  const { error } = await sb.from("tontine_auction_bids").upsert(
    {
      tontine_id: tontineId,
      user_id: me,
      bid_amount: bidAmount,
      cycle: tontine?.current_cycle ?? 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tontine_id,user_id,cycle" },
  );
  throwSb(error);
}

export async function openAuction(tontineId: string, hours = 24): Promise<{ auction_ends_at: string }> {
  const { data, error } = await getSupabase().rpc("open_tontine_auction", {
    p_tontine_id: tontineId,
    p_hours: hours,
  });
  throwSb(error);
  return {
    auction_ends_at: String((data as any)?.auction_ends_at ?? new Date(Date.now() + hours * 3600000).toISOString()),
  };
}

export async function closeAuction(tontineId: string): Promise<{ winner_id: string; premium: number }> {
  const { data, error } = await getSupabase().rpc("close_tontine_auction", {
    p_tontine_id: tontineId,
  });
  throwSb(error);
  const row = data as { winner_id?: string; premium?: number } | null;
  if (!row?.winner_id) throw new Error("Clôture impossible.");
  return { winner_id: row.winner_id, premium: Number(row.premium ?? 0) };
}
