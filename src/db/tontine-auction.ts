import { getSupabase } from "@/src/supabase";
import { uid, throwSb } from "./helpers";

export interface AuctionBid {
  id: string;
  tontine_id: string;
  user_id: string;
  full_name: string;
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

export async function getAuctionState(tontineId: string): Promise<AuctionState> {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine, error: te } = await sb
    .from("tontines")
    .select("current_cycle, contribution_amount, members_count, auction_ends_at, auction_closed")
    .eq("id", tontineId)
    .maybeSingle();
  throwSb(te);
  if (!tontine) throw new Error("Tontine introuvable.");

  const pot = (tontine.contribution_amount ?? 0) * (tontine.members_count ?? 1);

  const { data: bids } = await sb
    .from("tontine_auction_bids")
    .select("id, tontine_id, user_id, bid_amount, cycle, created_at, profiles(full_name)")
    .eq("tontine_id", tontineId)
    .eq("cycle", tontine.current_cycle ?? 1)
    .order("bid_amount", { ascending: false });

  const mapped: AuctionBid[] = (bids ?? []).map((b: any) => ({
    id: b.id,
    tontine_id: b.tontine_id,
    user_id: b.user_id,
    full_name: b.profiles?.full_name ?? "Membre",
    bid_amount: Number(b.bid_amount),
    cycle: b.cycle,
    created_at: b.created_at,
  }));

  return {
    tontine_id: tontineId,
    cycle: tontine.current_cycle ?? 1,
    ends_at: tontine.auction_ends_at ?? new Date(Date.now() + 24 * 3600000).toISOString(),
    pot_amount: pot,
    top_bid: mapped[0] ?? null,
    my_bid: mapped.find((b) => b.user_id === me) ?? null,
    bids: mapped,
    is_closed: !!tontine.auction_closed,
  };
}

export async function placeBid(tontineId: string, bidAmount: number): Promise<void> {
  const me = await uid();
  const sb = getSupabase();

  const { data: tontine } = await sb
    .from("tontines")
    .select("current_cycle, contribution_amount, auction_closed")
    .eq("id", tontineId)
    .maybeSingle();

  if (tontine?.auction_closed) throw new Error("Les enchères sont terminées pour ce cycle.");

  const minBid = (tontine?.contribution_amount ?? 0) * 0.05;
  if (bidAmount < minBid) throw new Error(`L'enchère minimum est de ${Math.round(minBid).toLocaleString("fr-FR")} XAF.`);

  const { error } = await sb.from("tontine_auction_bids").upsert(
    {
      tontine_id: tontineId,
      user_id: me,
      bid_amount: bidAmount,
      cycle: tontine?.current_cycle ?? 1,
    },
    { onConflict: "tontine_id,user_id,cycle" },
  );
  throwSb(error);
}

export async function closeAuction(tontineId: string): Promise<{ winner_id: string; premium: number }> {
  const me = await uid();
  const sb = getSupabase();

  const { data: caller } = await sb.from("tontine_members").select("role").eq("tontine_id", tontineId).eq("user_id", me).single();
  if (caller?.role !== "admin") throw new Error("Seul l'admin peut clôturer les enchères.");

  const state = await getAuctionState(tontineId);
  if (!state.top_bid) throw new Error("Aucune enchère soumise.");

  await sb.from("tontines").update({ auction_closed: true }).eq("id", tontineId);

  const premium = state.top_bid.bid_amount;
  const share = Math.floor(premium / (state.bids.length || 1));

  await sb.from("tontine_auction_results").insert({
    tontine_id: tontineId,
    cycle: state.cycle,
    winner_id: state.top_bid.user_id,
    premium_paid: premium,
    share_per_member: share,
  });

  return { winner_id: state.top_bid.user_id, premium };
}
