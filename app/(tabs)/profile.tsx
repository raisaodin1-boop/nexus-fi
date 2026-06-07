import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { User, Bell, Shield, FileText, LogOut, ChevronRight, Star, Gift, Settings } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface MenuItem { icon: any; label: string; sub?: string; onPress: () => void; danger?: boolean }

export default function ProfileTab() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const initials = (user?.full_name ?? "U").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = user?.role === "super_admin" ? "Super Admin" : user?.role === "tontine_manager" ? "Tontine Manager" : "Membre";

  const menu: MenuItem[] = [
    { icon: User, label: "Mon profil", sub: "Informations personnelles", onPress: () => router.push("/complete-profile") },
    { icon: Bell, label: "Notifications", sub: "Gérer mes alertes", onPress: () => router.push("/notifications") },
    { icon: Gift, label: "Parrainage", sub: "Inviter des amis", onPress: () => router.push("/referral") },
    { icon: Shield, label: "Sécurité", sub: "Mot de passe, accès", onPress: () => {} },
    { icon: FileText, label: "CGU & Politique", sub: "Conditions d'utilisation", onPress: () => router.push("/cgu") },
    { icon: Star, label: "Devenir Manager", sub: "Gérer des tontines", onPress: () => router.push("/promotion-request") },
    {
      icon: LogOut,
      label: "Se déconnecter",
      onPress: () => {
        Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
          { text: "Annuler", style: "cancel" },
          { text: "Déconnecter", style: "destructive", onPress: logout },
        ]);
      },
      danger: true,
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile header */}
        <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.full_name ?? "Utilisateur"}</Text>
          <Text style={styles.email}>{user?.email ?? ""}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
        </LinearGradient>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>0</Text>
            <Text style={styles.statLbl}>Tontines</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statVal}>0</Text>
            <Text style={styles.statLbl}>Groupes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>0</Text>
            <Text style={styles.statLbl}>Parrainages</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          {menu.map((item, i) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity key={i} style={[styles.menuItem, item.danger && styles.menuItemDanger]} onPress={item.onPress} activeOpacity={0.7}>
                <View style={[styles.menuIcon, { backgroundColor: item.danger ? Colors.dangerLight : Colors.primaryLight }]}>
                  <Icon size={18} color={item.danger ? Colors.danger : Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, item.danger && { color: Colors.danger }]}>{item.label}</Text>
                  {item.sub && <Text style={styles.menuSub}>{item.sub}</Text>}
                </View>
                <ChevronRight size={16} color={item.danger ? Colors.danger : Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.version}>HODIX v1.0.0 · Fintech Africaine Premium</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { alignItems: "center", padding: Spacing.xxl, paddingTop: Spacing.xxxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, gap: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  initials: { fontSize: 30, fontWeight: "800", color: "#fff" },
  name: { fontSize: 22, fontWeight: "800", color: "#fff" },
  email: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  roleBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: Radius.full, marginTop: 4 },
  roleText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  statsRow: { flexDirection: "row", margin: Spacing.xl, backgroundColor: Colors.surface, borderRadius: Radius.xl, overflow: "hidden", ...(Shadow.card as object) },
  statCard: { flex: 1, alignItems: "center", paddingVertical: Spacing.lg },
  statCardMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  statVal: { fontSize: 20, fontWeight: "800", color: Colors.text },
  statLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  menuSection: { marginHorizontal: Spacing.xl, gap: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: 14, ...(Shadow.card as object) },
  menuItemDanger: {},
  menuIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 15, fontWeight: "600", color: Colors.text },
  menuSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  version: { textAlign: "center", fontSize: 11, color: Colors.textSubtle, marginTop: Spacing.xxl },
});
