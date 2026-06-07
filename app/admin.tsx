import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Shield, Users, Settings, ChevronRight, CreditCard } from "lucide-react-native";
import { Colors, Spacing } from "@/src/theme";
import { Card } from "@/src/ui";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>("/admin/stats");
      setStats(d);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (user?.role !== "super_admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Shield color={Colors.danger} size={48} />
          <Text style={styles.denied}>Accès refusé</Text>
          <Text style={styles.deniedSub}>Cette section est réservée aux super administrateurs.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Console Admin</Text>
        <Text style={styles.subtitle}>Tableau de bord super administrateur</Text>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
        ) : stats ? (
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statVal}>{stats.total_users ?? 0}</Text>
              <Text style={styles.statLbl}>Utilisateurs</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statVal}>{stats.total_tontines ?? 0}</Text>
              <Text style={styles.statLbl}>Tontines</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statVal, { color: Colors.warning }]}>{stats.pending_kyc ?? 0}</Text>
              <Text style={styles.statLbl}>KYC en attente</Text>
            </Card>
          </View>
        ) : null}

        <Text style={styles.section}>Actions</Text>

        <View style={{ gap: 10 }}>
          <TouchableOpacity
            testID="admin-kyc-btn"
            style={styles.menuItem}
            onPress={async () => {
              try {
                const d = await api.get<any>("/admin/kyc");
                const count = Array.isArray(d) ? d.length : (d.count ?? "—");
                alert(`Dossiers KYC en attente : ${count}`);
              } catch {
                alert("Impossible de charger les données KYC.");
              }
            }}
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.warningLight }]}>
              <Shield color={Colors.warning} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Gestion KYC</Text>
              <Text style={styles.menuSub}>Valider ou rejeter les dossiers</Text>
            </View>
            <ChevronRight color={Colors.textSubtle} size={18} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="admin-users-btn"
            style={styles.menuItem}
            onPress={() => router.push("/admin/users" as any)}
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.infoLight }]}>
              <Users color={Colors.info} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Utilisateurs</Text>
              <Text style={styles.menuSub}>Gérer les comptes utilisateurs</Text>
            </View>
            <ChevronRight color={Colors.textSubtle} size={18} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="admin-fee-btn"
            style={styles.menuItem}
            onPress={() => router.push("/fee-config" as any)}
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.successLight }]}>
              <CreditCard color={Colors.success} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Configuration des frais</Text>
              <Text style={styles.menuSub}>Modifier les frais de service</Text>
            </View>
            <ChevronRight color={Colors.textSubtle} size={18} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  back: { color: Colors.textMuted, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "900", color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: 20 },
  denied: { fontSize: 22, fontWeight: "900", color: Colors.danger, marginTop: 16 },
  deniedSub: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  statCard: { flex: 1, alignItems: "center", padding: 14 },
  statVal: { fontSize: 22, fontWeight: "900", color: Colors.primary },
  statLbl: { fontSize: 11, color: Colors.textMuted, fontWeight: "600", marginTop: 4, textAlign: "center" },
  section: { fontSize: 14, fontWeight: "800", color: Colors.text, marginTop: 20, marginBottom: 12 },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 15, fontWeight: "800", color: Colors.text },
  menuSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
