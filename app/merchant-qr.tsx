import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Store, QrCode, TrendingUp, Edit3 } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  getMerchantProfile, createMerchantProfile, getMerchantTransactions,
  MERCHANT_CATEGORIES, type MerchantProfile,
} from "@/src/db/merchant-qr";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

export default function MerchantQRScreen() {
  const router = useRouter();
  const { show } = useToast();

  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [transactions, setTransactions] = useState<Array<{ id: string; payer_name: string; amount: number; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState(MERCHANT_CATEGORIES[0]);
  const [creating, setCreating] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const m = await getMerchantProfile();
      setMerchant(m);
      if (m) setTransactions(await getMerchantTransactions());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!businessName.trim()) { show("Nom du commerce requis", "error"); return; }
    setCreating(true);
    try {
      await createMerchantProfile({ business_name: businessName, category });
      show("Profil marchand créé ✓", "success");
      await load();
    } catch (e: any) { show(e?.message ?? "Erreur", "error"); }
    setCreating(false);
  };

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
            <Text style={s.title}>HODIX Pay Marchand</Text>
            <Text style={s.subtitle}>Acceptez des paiements sans frais</Text>
          </View>
        </View>

        {merchant ? (
          <>
            {/* Merchant hero */}
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={[s.hero, Shadow.cardDark]}>
              <View style={s.heroIcon}>
                <Store size={28} color="#fff" />
              </View>
              <Text style={s.heroName}>{merchant.business_name}</Text>
              <Text style={s.heroCategory}>{merchant.category}</Text>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={s.statVal}>{formatXAFAmount(merchant.total_received_xaf)}</Text>
                  <Text style={s.statLbl}>Total reçu</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.stat}>
                  <Text style={s.statVal}>{merchant.transactions_count}</Text>
                  <Text style={s.statLbl}>Paiements</Text>
                </View>
              </View>
            </LinearGradient>

            {/* QR Code section */}
            <View style={[s.qrCard, Shadow.card]}>
              <View style={s.qrPlaceholder}>
                <QrCode size={80} color={Colors.primary} />
                <Text style={s.qrSubtext}>QR Code HODIX Pay</Text>
              </View>
              <Text style={s.qrInstruction}>
                Affichez ce QR sur votre caisse. Les clients le scannent depuis leur app HODIX pour vous payer instantanément.
              </Text>
              <Button
                label="Partager / Imprimer le QR"
                variant="secondary"
                onPress={() => show("Fonctionnalité bientôt disponible", "info")}
              />
            </View>

            {/* Recent transactions */}
            {transactions.length > 0 && (
              <View style={[s.section, Shadow.card]}>
                <Text style={s.sectionTitle}>Paiements récents</Text>
                {transactions.slice(0, 10).map((t) => (
                  <View key={t.id} style={s.txRow}>
                    <View style={s.txIcon}>
                      <TrendingUp size={14} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txName}>{t.payer_name}</Text>
                      <Text style={s.txDate}>
                        {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <Text style={s.txAmt}>+{formatXAFAmount(t.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {transactions.length === 0 && (
              <View style={s.noTx}>
                <Text style={s.noTxText}>Aucun paiement reçu pour l'instant. Partagez votre QR !</Text>
              </View>
            )}
          </>
        ) : (
          <View style={s.setupBox}>
            <Store size={52} color={Colors.primary} />
            <Text style={s.setupTitle}>Devenez marchand HODIX</Text>
            <Text style={s.setupText}>
              Créez votre profil marchand et recevez des paiements instantanés de vos clients via QR code. 0% de frais sur les transactions.
            </Text>

            <Field
              label="Nom du commerce"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Superette Mama, Restaurant le Bon Goût..."
            />

            <TouchableOpacity style={s.catSelector} onPress={() => setShowCatModal(true)}>
              <Text style={s.catLabel}>Catégorie</Text>
              <Text style={s.catValue}>{category} ›</Text>
            </TouchableOpacity>

            <Button
              label={creating ? "Création..." : "Créer mon profil marchand"}
              onPress={handleCreate}
              loading={creating}
              style={{ marginTop: 8 }}
            />

            <Text style={s.freeNote}>✅ Gratuit · Paiements instantanés · Historique complet</Text>
          </View>
        )}
      </ScrollView>

      {/* Category picker modal */}
      <Modal visible={showCatModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Choisir une catégorie</Text>
            {MERCHANT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[s.catOption, category === cat && s.catOptionActive]}
                onPress={() => { setCategory(cat); setShowCatModal(false); }}
              >
                <Text style={[s.catOptionText, category === cat && { color: Colors.primary }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
            <Button label="Fermer" variant="ghost" onPress={() => setShowCatModal(false)} />
          </View>
        </View>
      </Modal>
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
  hero: { borderRadius: Radius.lg, padding: 24, alignItems: "center", gap: 10 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroName: { fontSize: 22, fontWeight: "800", color: "#fff" },
  heroCategory: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: 24, marginTop: 8 },
  stat: { alignItems: "center", gap: 2 },
  statVal: { fontSize: 18, fontWeight: "800", color: "#fff" },
  statLbl: { fontSize: 11, color: "rgba(255,255,255,0.7)" },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  qrCard: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 12, alignItems: "center" },
  qrPlaceholder: { alignItems: "center", gap: 8, padding: 24, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, width: "100%" },
  qrSubtext: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  qrInstruction: { fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  section: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  txIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#10B981" + "18", alignItems: "center", justifyContent: "center" },
  txName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  txDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  txAmt: { fontSize: 15, fontWeight: "700", color: "#10B981" },
  noTx: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 16, alignItems: "center" },
  noTxText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  setupBox: { alignItems: "center", gap: 12, paddingVertical: 8 },
  setupTitle: { fontSize: 22, fontWeight: "800", color: Colors.text },
  setupText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22, paddingHorizontal: 8 },
  catSelector: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: Radius.md, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  catLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  catValue: { fontSize: 14, fontWeight: "600", color: Colors.text },
  freeNote: { fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  catOption: { padding: 14, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  catOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  catOptionText: { fontSize: 15, fontWeight: "500", color: Colors.text },
});
