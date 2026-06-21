import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Gavel, Trophy, Clock, TrendingUp, Users } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { getAuctionState, placeBid, closeAuction, type AuctionState } from "@/src/db/tontine-auction";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { VerifiedName } from "@/src/verified-name";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

export default function TontineAuctionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useToast();

  const [state, setState] = useState<AuctionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showNumber, setShowNumber] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const s = await getAuctionState(id);
      setState(s);
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleBid = async () => {
    const amt = Number(bidAmount);
    if (!amt || amt <= 0) { show("Montant invalide", "error"); return; }
    setPlacing(true);
    try {
      await placeBid(id!, amt);
      show("Enchère placée ✓", "success");
      setBidAmount("");
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setPlacing(false);
  };

  const handleClose = () => {
    Alert.alert("Clôturer les enchères", "Le plus offrant remporte la cagnotte. Confirmer ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Clôturer", style: "destructive", onPress: async () => {
        setClosing(true);
        try {
          const result = await closeAuction(id!);
          show(`Enchères clôturées ! Prime: ${formatXAFAmount(result.premium)}`, "success");
          await load();
        } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
        setClosing(false);
      }},
    ]);
  };

  const timeLeft = state ? Math.max(0, new Date(state.ends_at).getTime() - Date.now()) : 0;
  const hoursLeft = Math.floor(timeLeft / 3600000);
  const minLeft = Math.floor((timeLeft % 3600000) / 60000);

  if (loading) return (
    <SafeAreaView style={s.safe}><ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Enchères Tontine</Text>
            <Text style={s.subtitle}>Cycle {state?.cycle} — Qui remporte la cagnotte ?</Text>
          </View>
        </View>

        {/* Hero pot */}
        <LinearGradient colors={[Colors.primary, Colors.secondary]} style={[s.hero, Shadow.cardDark]}>
          <Text style={s.heroLabel}>Cagnotte du cycle</Text>
          <Text style={s.heroPot}>{formatXAFAmount(state?.pot_amount ?? 0)}</Text>
          {!state?.is_closed && (
            <View style={s.timerRow}>
              <Clock size={14} color="#fff" />
              <Text style={s.timer}>{hoursLeft}h {minLeft}min restant</Text>
            </View>
          )}
          {state?.is_closed && (
            <View style={[s.timerRow, { backgroundColor: "#EF4444" + "30" }]}>
              <Text style={s.timer}>Enchères terminées</Text>
            </View>
          )}
        </LinearGradient>

        {/* Top bidder */}
        {state?.top_bid && (
          <View style={[s.card, { borderColor: Colors.accent, borderWidth: 2 }]}>
            <View style={s.cardRow}>
              <Trophy size={20} color={Colors.accent} />
              <Text style={s.cardTitle}>Meilleure offre</Text>
            </View>
            <VerifiedName
              name={state.top_bid.full_name}
              kycVerified={state.top_bid.kyc_verified}
              style={s.topBidder}
            />
            <Text style={s.topBidAmt}>{formatXAFAmount(state.top_bid.bid_amount)}</Text>
            <Text style={s.topBidDesc}>Prime supplémentaire à payer</Text>
          </View>
        )}

        {/* My bid */}
        {state?.my_bid && (
          <View style={s.myBidCard}>
            <TrendingUp size={16} color={Colors.primary} />
            <Text style={s.myBidText}>Mon offre : {formatXAFAmount(state.my_bid.bid_amount)}</Text>
            {state.my_bid.user_id === state.top_bid?.user_id && (
              <Text style={s.myBidLeading}>🏆 En tête !</Text>
            )}
          </View>
        )}

        {/* Bid form */}
        {!state?.is_closed && (
          <View style={s.form}>
            <Text style={s.formTitle}>Placer une offre</Text>
            <Text style={s.formHint}>
              L'offre minimum est 5% de la contribution. La prime est redistribuée aux autres membres.
            </Text>
            <Field
              label="Votre offre (FCFA)"
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="numeric"
              placeholder="ex: 5 000"
            />
            <Button
              label={placing ? "Envoi..." : "Enchérir"}
              onPress={handleBid}
              loading={placing}
            />
          </View>
        )}

        {/* All bids */}
        {(state?.bids ?? []).length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Toutes les offres ({state!.bids.length})</Text>
            {state!.bids.map((b, i) => (
              <View key={b.id} style={s.bidRow}>
                <View style={[s.rank, i === 0 && { backgroundColor: Colors.accent }]}>
                  <Text style={s.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <VerifiedName name={b.full_name} kycVerified={b.kyc_verified} style={s.bidderName} />
                </View>
                <Text style={s.bidAmt}>{formatXAFAmount(b.bid_amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Close auction (admin) */}
        {!state?.is_closed && (
          <Button
            label={closing ? "Clôture..." : "Clôturer les enchères (Admin)"}
            variant="danger"
            onPress={handleClose}
            loading={closing}
            style={{ marginTop: 8 }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  hero: { borderRadius: Radius.lg, padding: 24, alignItems: "center", gap: 8 },
  heroLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  heroPot: { fontSize: 36, fontWeight: "800", color: "#fff" },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  timer: { fontSize: 12, color: "#fff", fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 6, ...Shadow.card },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  topBidder: { fontSize: 20, fontWeight: "800", color: Colors.text },
  topBidAmt: { fontSize: 28, fontWeight: "800", color: Colors.accent },
  topBidDesc: { fontSize: 12, color: Colors.textMuted },
  myBidCard: { backgroundColor: Colors.primary + "15", borderRadius: Radius.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  myBidText: { fontSize: 14, fontWeight: "600", color: Colors.primary, flex: 1 },
  myBidLeading: { fontSize: 13, fontWeight: "700", color: Colors.accent },
  form: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10, ...Shadow.card },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  formHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  section: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 8, ...Shadow.card },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  bidRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  bidderName: { fontSize: 14, fontWeight: "500", color: Colors.text },
  bidAmt: { fontSize: 14, fontWeight: "700", color: Colors.primary },
});
