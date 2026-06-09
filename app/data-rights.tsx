// HODIX — Mes Données & Droits RGPD/CEMAC
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Download, Trash2, Eye, Edit, Ban, Bell, BellOff, Shield, CheckCircle } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

interface DataSummary {
  email?: string;
  full_name?: string;
  kyc_status?: string;
  created_at?: string;
  push_token?: string | null;
  consent_date?: string;
}

export default function DataRightsScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [profile, setProfile] = useState<DataSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    api.get<DataSummary>("/users/me")
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  const handleExport = async () => {
    setExportLoading(true);
    try {
      await api.post("/users/me/data-export");
      show("Export demandé ! Vous recevrez vos données par email dans 48h.", "success");
    } catch {
      show("Erreur lors de la demande d'export. Réessayez ou contactez support@hodix.app", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Supprimer mon compte",
      "Cette action est irréversible. Votre compte sera désactivé et vos données personnelles seront supprimées selon les délais légaux (5 ans pour les données KYC, 10 ans pour les transactions financières).\n\nVos fonds disponibles vous seront remboursés préalablement.\n\nVoulez-vous continuer ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer mon compte",
          style: "destructive",
          onPress: async () => {
            setDeleteLoading(true);
            try {
              await api.post("/users/me/delete-request");
              show("Demande de suppression reçue. Notre équipe vous contactera dans 48h.", "success");
              router.replace("/(auth)/login" as any);
            } catch {
              show("Erreur. Contactez privacy@hodix.app pour procéder à la suppression.", "error");
            } finally {
              setDeleteLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRectifyData = () => {
    router.push("/complete-profile" as any);
  };

  const handleUnsubscribeNotifs = () => {
    Alert.alert(
      "Désactiver les notifications",
      "Vous pouvez désactiver les notifications push depuis les paramètres de votre appareil, ou nous contacter à privacy@hodix.app pour retirer votre consentement aux communications marketing.",
      [{ text: "OK" }]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

        {/* Header */}
        <LinearGradient colors={["#7C3AED", "#6D28D9"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color="#fff" size={20} />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Shield color="#fff" size={30} />
          </View>
          <Text style={styles.headerTitle}>Mes Données & Droits</Text>
          <Text style={styles.headerSub}>Gérez vos données personnelles et exercez vos droits</Text>
        </LinearGradient>

        <View style={styles.body}>

          {/* Résumé des données */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Résumé de vos données</Text>
            {loading ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginVertical: 12 }} />
            ) : profile ? (
              <View style={styles.summaryList}>
                <DataRow label="Nom complet" value={profile.full_name ?? "Non renseigné"} />
                <DataRow label="Email" value={profile.email ?? "—"} />
                <DataRow label="KYC" value={profile.kyc_status === "approved" ? "✅ Vérifié" : profile.kyc_status === "pending_review" ? "⏳ En cours" : "❌ Non soumis"} />
                <DataRow label="Compte créé le" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString("fr-FR") : "—"} />
                <DataRow label="Consentement donné le" value={profile.consent_date ? new Date(profile.consent_date).toLocaleDateString("fr-FR") : "—"} />
                <DataRow label="Notifications push" value={profile.push_token ? "✅ Activées" : "❌ Désactivées"} last />
              </View>
            ) : (
              <Text style={styles.errorText}>Impossible de charger vos données.</Text>
            )}
          </View>

          {/* Droits disponibles */}
          <Text style={styles.sectionLabel}>Exercer vos droits</Text>

          <RightAction
            icon={Download}
            color="#3B82F6"
            bg="#EFF6FF"
            title="Télécharger mes données"
            desc="Recevez par email une copie complète de toutes vos données (JSON) dans les 48h."
            buttonLabel={exportLoading ? "Demande envoyée..." : "Demander l'export"}
            onPress={handleExport}
            loading={exportLoading}
          />

          <RightAction
            icon={Edit}
            color={Colors.primary}
            bg={Colors.primaryLight}
            title="Corriger mes données"
            desc="Modifiez votre nom, numéro de téléphone, adresse ou tout autre donnée incorrecte."
            buttonLabel="Modifier mon profil"
            onPress={handleRectifyData}
          />

          <RightAction
            icon={Eye}
            color="#8B5CF6"
            bg="#F5F3FF"
            title="Accéder à mes données"
            desc="Consultez l'intégralité de votre historique de transactions, cotisations et activité."
            buttonLabel="Voir mon historique"
            onPress={() => router.push("/payments" as any)}
          />

          <RightAction
            icon={BellOff}
            color="#F59E0B"
            bg="#FFFBEB"
            title="Gérer mes consentements"
            desc="Retirer votre consentement aux notifications push ou aux communications marketing."
            buttonLabel="Gérer les notifications"
            onPress={handleUnsubscribeNotifs}
          />

          <RightAction
            icon={Ban}
            color="#6B7280"
            bg="#F9FAFB"
            title="Limitation du traitement"
            desc="Dans certains cas, vous pouvez demander la suspension temporaire du traitement de vos données."
            buttonLabel="Contacter le DPO"
            onPress={() => router.push("/messages" as any)}
          />

          {/* Suppression */}
          <View style={styles.dangerSection}>
            <View style={styles.dangerHeader}>
              <Trash2 color="#DC2626" size={18} />
              <Text style={styles.dangerTitle}>Zone de suppression</Text>
            </View>
            <Text style={styles.dangerDesc}>
              La suppression de votre compte est irréversible. Vos données personnelles seront effacées selon les délais légaux applicables. Les données financières (transactions) sont conservées 10 ans conformément à la réglementation anti-blanchiment.
            </Text>
            <Text style={styles.dangerDesc}>
              Vos fonds disponibles vous seront intégralement restitués avant la clôture définitive du compte.
            </Text>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
              activeOpacity={0.8}
            >
              {deleteLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.deleteBtnText}>Demander la suppression de mon compte</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Contact DPO */}
          <View style={styles.dpoCard}>
            <CheckCircle color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dpoTitle}>Délégué à la Protection des Données</Text>
              <Text style={styles.dpoDesc}>Pour toute question sur vos données personnelles :</Text>
              <Text style={styles.dpoEmail}>privacy@hodix.app</Text>
              <Text style={styles.dpoDelay}>Délai de réponse : 30 jours maximum</Text>
            </View>
          </View>

          {/* Liens légaux */}
          <View style={styles.linksRow}>
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/privacy" as any)}>
              <Text style={styles.linkText}>Politique de confidentialité</Text>
            </TouchableOpacity>
            <Text style={styles.linkSep}>•</Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/cgu" as any)}>
              <Text style={styles.linkText}>CGU</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DataRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.dataRow, !last && styles.dataRowBorder]}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function RightAction({
  icon: Icon, color, bg, title, desc, buttonLabel, onPress, loading = false,
}: {
  icon: any; color: string; bg: string; title: string; desc: string;
  buttonLabel: string; onPress: () => void; loading?: boolean;
}) {
  return (
    <View style={styles.rightCard}>
      <View style={[styles.rightIcon, { backgroundColor: bg }]}>
        <Icon color={color} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rightTitle}>{title}</Text>
        <Text style={styles.rightDesc}>{desc}</Text>
        <TouchableOpacity
          style={[styles.rightBtn, { borderColor: color }]}
          onPress={onPress}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={[styles.rightBtnText, { color }]}>{loading ? "En cours..." : buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: 28, paddingTop: 20, paddingBottom: 36, alignItems: "center", gap: 6 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 16 },
  backText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 },
  headerIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  body: { padding: Spacing.xl, gap: 16 },

  summaryCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  summaryTitle: { color: Colors.text, fontWeight: "900", fontSize: 15, marginBottom: 12 },
  summaryList: { gap: 0 },
  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  dataRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  dataLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  dataValue: { color: Colors.text, fontSize: 13, fontWeight: "700", textAlign: "right", flex: 1, marginLeft: 12 },
  errorText: { color: Colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 12 },

  sectionLabel: { color: Colors.text, fontWeight: "900", fontSize: 15, marginTop: 4 },

  rightCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  rightIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 2 },
  rightTitle: { color: Colors.text, fontWeight: "800", fontSize: 14, marginBottom: 4 },
  rightDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  rightBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignSelf: "flex-start" },
  rightBtnText: { fontWeight: "700", fontSize: 12 },

  dangerSection: { backgroundColor: "#FEF2F2", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#FECACA" },
  dangerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  dangerTitle: { color: "#DC2626", fontWeight: "900", fontSize: 15 },
  dangerDesc: { color: "#7F1D1D", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  deleteBtn: { backgroundColor: "#DC2626", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  deleteBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  dpoCard: { backgroundColor: Colors.primaryLight, borderRadius: 16, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start", borderWidth: 1, borderColor: Colors.primary + "40" },
  dpoTitle: { color: Colors.primary, fontWeight: "900", fontSize: 14, marginBottom: 4 },
  dpoDesc: { color: Colors.textMuted, fontSize: 12 },
  dpoEmail: { color: Colors.primary, fontWeight: "800", fontSize: 13, marginTop: 4 },
  dpoDelay: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  linksRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  linkBtn: { padding: 4 },
  linkText: { color: Colors.secondary, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  linkSep: { color: Colors.textSubtle, fontSize: 12 },
});
