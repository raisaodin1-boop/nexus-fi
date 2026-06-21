import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Switch,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CreditCard, Eye, EyeOff, Copy, Trash2, Wifi } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  getVirtualCard, createVirtualCard, toggleVirtualCard, deleteVirtualCard,
  type VirtualCard,
} from "@/src/db/virtual-card";
import { useAuth } from "@/src/auth-context";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

export default function VirtualCardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();

  const [card, setCard] = useState<VirtualCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [holderName, setHolderName] = useState(user?.full_name ?? "");

  const load = async () => {
    setLoading(true);
    try { setCard(await getVirtualCard()); } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!holderName.trim()) { show("Nom requis", "error"); return; }
    setCreating(true);
    try {
      await createVirtualCard(holderName.trim());
      show("Carte virtuelle créée ✓", "success");
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setCreating(false);
  };

  const handleToggle = async (active: boolean) => {
    if (!card) return;
    try {
      await toggleVirtualCard(card.id, active);
      await load();
    } catch { show("Erreur", "error"); }
  };

  const handleDelete = () => {
    Alert.alert("Supprimer la carte", "Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        if (!card) return;
        await deleteVirtualCard(card.id);
        setCard(null);
        show("Carte supprimée", "success");
      }},
    ]);
  };

  const formatNumber = (n: string) =>
    n.replace(/(\d{4})/g, "$1 ").trim();

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
            <Text style={s.title}>Carte Virtuelle HODIX</Text>
            <Text style={s.subtitle}>Payez en ligne partout dans le monde</Text>
          </View>
        </View>

        {card ? (
          <>
            {/* Card visual */}
            <LinearGradient
              colors={card.is_active ? ["#0B1F3A", "#1a3a5c"] : ["#6B7280", "#9CA3AF"]}
              style={s.cardVisual}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={s.cardTop}>
                <Text style={s.hodixLabel}>HODIX</Text>
                <Wifi size={22} color="rgba(255,255,255,0.6)" />
              </View>

              <Text style={s.cardNumber}>
                {showSensitive
                  ? formatNumber(card.full_number)
                  : card.masked_number}
              </Text>

              <View style={s.cardBottom}>
                <View>
                  <Text style={s.cardFieldLabel}>TITULAIRE</Text>
                  <Text style={s.cardFieldValue}>{card.holder_name}</Text>
                </View>
                <View>
                  <Text style={s.cardFieldLabel}>EXPIRATION</Text>
                  <Text style={s.cardFieldValue}>{showSensitive ? card.expiry : "••/••"}</Text>
                </View>
                <View>
                  <Text style={s.cardFieldLabel}>CVV</Text>
                  <Text style={s.cardFieldValue}>{showSensitive ? card.cvv : "•••"}</Text>
                </View>
              </View>

              <View style={s.visaRow}>
                <Text style={s.visaText}>VISA</Text>
              </View>
            </LinearGradient>

            {/* Actions */}
            <View style={s.actionsRow}>
              <TouchableOpacity style={s.actionBtn} onPress={() => setShowSensitive(!showSensitive)}>
                {showSensitive ? <EyeOff size={20} color={Colors.primary} /> : <Eye size={20} color={Colors.primary} />}
                <Text style={s.actionLabel}>{showSensitive ? "Masquer" : "Révéler"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={handleDelete}>
                <Trash2 size={20} color="#EF4444" />
                <Text style={[s.actionLabel, { color: "#EF4444" }]}>Supprimer</Text>
              </TouchableOpacity>
            </View>

            {/* Status */}
            <View style={s.statusCard}>
              <Text style={s.statusLabel}>Carte {card.is_active ? "active" : "désactivée"}</Text>
              <Switch
                value={card.is_active}
                onValueChange={handleToggle}
                trackColor={{ true: Colors.primary }}
              />
            </View>

            {/* Limit */}
            <View style={s.infoCard}>
              <Text style={s.infoLabel}>Plafond mensuel</Text>
              <Text style={s.infoValue}>{formatXAFAmount(card.balance_limit_xaf)}</Text>
            </View>

            {!card.is_active && (
              <View style={s.warningBox}>
                <Text style={s.warningText}>⚠️ Carte désactivée — les paiements en ligne seront refusés.</Text>
              </View>
            )}
          </>
        ) : (
          <View style={s.emptyBox}>
            <CreditCard size={56} color={Colors.primary} />
            <Text style={s.emptyTitle}>Pas encore de carte</Text>
            <Text style={s.emptyText}>
              Créez votre carte Visa virtuelle HODIX gratuite pour payer en ligne,
              souscrire à des services, ou effectuer des achats internationaux.
            </Text>
            <Field
              label="Nom sur la carte"
              value={holderName}
              onChangeText={setHolderName}
              placeholder={user?.full_name ?? "PRÉNOM NOM"}
              style={{ marginTop: 8 }}
            />
            <Button
              label={creating ? "Création..." : "Créer ma carte virtuelle"}
              onPress={handleCreate}
              loading={creating}
              style={{ marginTop: 8 }}
            />
            <Text style={s.disclaimer}>
              ℹ️ La carte est liée à votre wallet HODIX. Plafond de 500 000 FCFA/mois.
            </Text>
          </View>
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
  cardVisual: { borderRadius: 20, padding: 24, gap: 20, aspectRatio: 1.6, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hodixLabel: { fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: 2 },
  cardNumber: { fontSize: 18, fontWeight: "600", color: "#fff", letterSpacing: 3, fontFamily: "monospace" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardFieldLabel: { fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  cardFieldValue: { fontSize: 13, color: "#fff", fontWeight: "700", marginTop: 2 },
  visaRow: { position: "absolute", bottom: 20, right: 24 },
  visaText: { fontSize: 22, fontWeight: "900", color: "#fff", fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, backgroundColor: "#fff", borderRadius: Radius.lg, padding: 14, alignItems: "center", gap: 6, ...Shadow.card },
  actionLabel: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  statusCard: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...Shadow.card },
  statusLabel: { fontSize: 15, fontWeight: "600", color: Colors.text },
  infoCard: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...Shadow.card },
  infoLabel: { fontSize: 14, color: Colors.textMuted },
  infoValue: { fontSize: 16, fontWeight: "700", color: Colors.text },
  warningBox: { backgroundColor: "#FEF3C7", borderRadius: Radius.md, padding: 12 },
  warningText: { fontSize: 13, color: "#92400E", fontWeight: "500" },
  emptyBox: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20, lineHeight: 22 },
  disclaimer: { fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 4 },
});
