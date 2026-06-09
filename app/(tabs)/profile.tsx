// PROFILE - User profile, edit, settings, logout
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, Save, Shield, ShieldCheck, Bell, ChevronRight, Edit3, Mail, MapPin, Phone, Briefcase, Sparkles, CreditCard, Moon, Fingerprint, Globe } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { useTheme } from "@/src/theme-context";
import { Button, Card, Field, SectionTitle } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { api, ApiError, User } from "@/src/api";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { isDark, colors, toggle: toggleTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioEnabled, setBioEnabled] = useState(false);

  const [form, setForm] = useState({
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    gender: user?.gender ?? "",
    country: user?.country ?? "",
    city: user?.city ?? "",
    occupation: user?.occupation ?? "",
    date_of_birth: user?.date_of_birth ?? "",
    birth_place: user?.birth_place ?? "",
    neighborhood: user?.neighborhood ?? "",
    address: user?.address ?? "",
  });

  // Sync form when user context updates (after refresh)
  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name ?? "",
        phone: user.phone ?? "",
        gender: user.gender ?? "",
        country: user.country ?? "",
        city: user.city ?? "",
        occupation: user.occupation ?? "",
        date_of_birth: user.date_of_birth ?? "",
        birth_place: user.birth_place ?? "",
        neighborhood: user.neighborhood ?? "",
        address: user.address ?? "",
      });
    }
  }, [user]);

  useEffect(() => {
    SecureStore.getItemAsync("bio_enabled")
      .then((v) => setBioEnabled(v === "1"))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await api.patch<User>("/users/me", form);
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    const doLogout = async () => {
      try { await logout(); } catch {}
      try { router.replace("/(auth)/login"); } catch {}
    };
    if (Platform.OS === "web") {
      if (window.confirm("Voulez-vous vraiment vous déconnecter ?")) doLogout();
    } else {
      Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  const handleBioToggle = async (value: boolean) => {
    if (!value) {
      Alert.alert(
        "Désactiver la biométrie",
        "Voulez-vous désactiver la connexion biométrique ?",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Désactiver",
            style: "destructive",
            onPress: async () => {
              try {
                await SecureStore.deleteItemAsync("bio_enabled");
                await SecureStore.deleteItemAsync("bio_email");
                await SecureStore.deleteItemAsync("bio_password");
                setBioEnabled(false);
              } catch {}
            },
          },
        ],
      );
    }
  };

  const bg = isDark ? colors.bg : Colors.bg;
  const txt = isDark ? colors.text : Colors.text;
  const txtMuted = isDark ? colors.textMuted : Colors.textMuted;
  const borderColor = isDark ? colors.border : Colors.border;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Header banner */}
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.banner}>
            <View style={styles.avatar}>
              {user?.photo_base64 ? (
                <Image source={{ uri: `data:image/png;base64,${user.photo_base64}` }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarLetter}>{user?.full_name?.[0]?.toUpperCase() ?? "?"}</Text>
              )}
            </View>
            <Text style={styles.fullName}>{user?.full_name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{roleLabel(user?.role)}</Text>
            </View>
          </LinearGradient>

          {/* Quick info */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: -24 }}>
            <Card>
              <InfoRow icon={<Mail size={16} color={Colors.secondary} />} label="Email" value={user?.email ?? ""} txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
              <InfoRow icon={<Phone size={16} color={Colors.secondary} />} label="Téléphone" value={user?.phone || "—"} txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
              <InfoRow icon={<MapPin size={16} color={Colors.secondary} />} label="Localisation" value={[user?.neighborhood, user?.city, user?.country].filter(Boolean).join(", ") || "—"} txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
              <InfoRow icon={<Briefcase size={16} color={Colors.secondary} />} label="Profession" value={user?.occupation || "—"} txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
              {user?.date_of_birth ? <InfoRow icon={<Shield size={16} color={Colors.secondary} />} label="Né(e) le" value={new Date(user.date_of_birth).toLocaleDateString("fr-FR")} txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} /> : null}
              <InfoRow icon={<ShieldCheck size={16} color={user?.kyc_status === "approved" ? Colors.accent : Colors.textMuted} />} label="KYC" value={user?.kyc_status === "approved" ? "✓ Vérifié" : user?.kyc_status === "pending" ? "En attente" : "Non soumis"} last txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
            </Card>
          </View>

          {/* Edit profile section */}
          <SectionTitle action={
            <TouchableOpacity
              testID="profile-toggle-edit"
              onPress={() => { setEditing((v) => !v); setError(null); }}
              style={styles.editBtn}
            >
              <Edit3 color={Colors.secondary} size={14} />
              <Text style={styles.editBtnText}>{editing ? "Annuler" : "Modifier"}</Text>
            </TouchableOpacity>
          }>
            Mes informations
          </SectionTitle>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <Card>
              <Field
                testID="profile-fullname"
                label="Nom complet"
                value={form.full_name}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, full_name: t })}
              />
              <Field
                testID="profile-phone"
                label="Téléphone"
                value={form.phone}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, phone: t })}
                keyboardType="phone-pad"
              />
              <Field
                testID="profile-country"
                label="Pays"
                value={form.country}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, country: t })}
              />
              <Field
                testID="profile-city"
                label="Ville"
                value={form.city}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, city: t })}
              />
              <Field
                testID="profile-occupation"
                label="Profession"
                value={form.occupation}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, occupation: t })}
              />
              <Field
                testID="profile-address"
                label="Adresse"
                value={form.address}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, address: t })}
              />
              <Field
                testID="profile-neighborhood"
                label="Quartier"
                value={form.neighborhood}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, neighborhood: t })}
              />
              <Field
                testID="profile-birth-place"
                label="Lieu de naissance"
                value={form.birth_place}
                editable={editing}
                onChangeText={(t) => setForm({ ...form, birth_place: t })}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {editing ? (
                <Button
                  testID="profile-save"
                  label="Enregistrer"
                  onPress={handleSave}
                  loading={saving}
                  icon={<Save color="#fff" size={16} />}
                />
              ) : null}
            </Card>
          </View>

          {/* Settings */}
          <SectionTitle>Préférences</SectionTitle>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <Card>
              <SettingRow icon={<Globe color={Colors.secondary} size={18} />} label={t("profile.language") + " · " + (language === "fr" ? "Français" : "English")} onPress={() => Alert.alert("Langue / Language", "", [{ text: "Français", onPress: () => setLanguage("fr") }, { text: "English", onPress: () => setLanguage("en") }, { text: t("common.cancel"), style: "cancel" }])} testID="profile-language" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Bell color={Colors.secondary} size={18} />} label="Notifications" onPress={() => router.push("/notifications")} testID="profile-go-notifs" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<ShieldCheck color={Colors.accent} size={18} />} label="Vérification KYC" onPress={() => router.push("/kyc")} testID="profile-go-kyc" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<CreditCard color={Colors.primary} size={18} />} label="Mes Paiements" onPress={() => router.push("/payments")} testID="profile-go-payments" borderColor={borderColor} txtColor={txt} />
              {user?.role === "member" ? (
                <SettingRow icon={<Sparkles color={Colors.accent} size={18} />} label="Demander une promotion Manager" onPress={() => router.push("/promotion-request")} testID="profile-promotion" borderColor={borderColor} txtColor={txt} />
              ) : null}
              {user?.role === "super_admin" ? (
                <SettingRow icon={<Shield color={Colors.accent} size={18} />} label="Console admin" onPress={() => router.push("/admin")} testID="profile-go-admin" borderColor={borderColor} txtColor={txt} />
              ) : (
                <SettingRow icon={<Shield color={Colors.accent} size={18} />} label="Sécurité du compte" onPress={() => {}} disabled borderColor={borderColor} txtColor={txt} />
              )}

              {/* Dark mode toggle */}
              <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: borderColor }]}>
                <Moon color={isDark ? Colors.gold : Colors.textMuted} size={18} />
                <Text style={[styles.toggleLabel, { color: txt }]}>Mode sombre</Text>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: Colors.border, true: Colors.secondary }}
                  thumbColor={isDark ? Colors.gold : "#fff"}
                  testID="profile-dark-mode"
                />
              </View>

              {/* Biometric toggle */}
              <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: borderColor }]}>
                <Fingerprint color={bioEnabled ? Colors.accent : Colors.textMuted} size={18} />
                <Text style={[styles.toggleLabel, { color: txt }]}>Connexion biométrique</Text>
                <Switch
                  value={bioEnabled}
                  onValueChange={handleBioToggle}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#fff"
                  testID="profile-bio-toggle"
                />
              </View>
            </Card>
          </View>

          {/* Logout */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
            <Button
              testID="profile-logout"
              label="Se déconnecter"
              variant="danger"
              icon={<LogOut color="#fff" size={16} />}
              onPress={confirmLogout}
            />
          </View>
          <Text style={[styles.versionTxt, { color: isDark ? colors.textSubtle : Colors.textSubtle }]}>HODIX v1.0 · Building Trust Together</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, last, txtColor, txtMuted, borderColor }: {
  icon: React.ReactNode; label: string; value: string; last?: boolean;
  txtColor: string; txtMuted: string; borderColor: string;
}) {
  return (
    <View style={[styles.infoRow, last ? null : { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: txtMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: txtColor }]}>{value}</Text>
      </View>
    </View>
  );
}

function SettingRow({
  icon, label, onPress, disabled, testID, borderColor, txtColor,
}: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean; testID?: string; borderColor: string; txtColor: string }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} testID={testID}>
      <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
        {icon}
        <Text style={[styles.settingLabel, { color: disabled ? Colors.textSubtle : txtColor }]}>{label}</Text>
        <ChevronRight color={Colors.textSubtle} size={18} />
      </View>
    </TouchableOpacity>
  );
}

function roleLabel(r?: string) {
  switch (r) {
    case "super_admin": return "Super Admin";
    case "tontine_manager": return "Tontine Manager";
    default: return "Membre Hodix";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  banner: {
    paddingTop: 30, paddingBottom: 48, alignItems: "center",
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.25)",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: 42 },
  avatarLetter: { color: "#fff", fontSize: 36, fontWeight: "900" },
  fullName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  email: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4, fontWeight: "500" },
  rolePill: {
    backgroundColor: "rgba(16,185,129,0.2)", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, marginTop: 12, borderWidth: 1, borderColor: "rgba(16,185,129,0.4)",
  },
  roleText: { color: Colors.accent, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  infoIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  editBtnText: { color: Colors.secondary, fontWeight: "700", fontSize: 13 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  settingLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  versionTxt: { textAlign: "center", fontSize: 11, marginTop: 30, fontWeight: "600", letterSpacing: 1 },
});
