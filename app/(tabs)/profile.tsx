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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, Save, Shield, ShieldCheck, Bell, ChevronRight, Edit3, Mail, MapPin, Phone, Briefcase, Sparkles, CreditCard, Moon, Fingerprint, Globe, Gift, Settings2 } from "lucide-react-native";

import { useAuth } from "@/src/auth-context";
import { isDiasporaMember } from "@/src/diaspora-enrollment-config";
import { useI18n } from "@/src/i18n";
import { useTheme } from "@/src/theme-context";
import { Button, Card, Field, SectionTitle } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { api, ApiError, User } from "@/src/api";
import {
  TITLES, COUNTRIES, getCities, getNeighborhoods,
} from "@/src/profile-geo-data";
import {
  SelectPicker, ChipSelector, DatePicker, NameField, ManualField,
} from "@/src/profile-selectors";
import { getBiometricInfo, authenticateBiometricDetailed, isBiometricEnabled, setBiometricEnabled } from "@/src/biometrics";
import { VerifiedName } from "@/src/verified-name";
import { isKycVerified } from "@/src/profile-display";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { isDark, colors, toggle: toggleTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioLoaded, setBioLoaded] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState("");
  const [pushEnabled, setPushEnabled] = useState(!!user?.push_consent);
  const [dobDate, setDobDate] = useState<Date | null>(
    user?.date_of_birth ? new Date(user.date_of_birth) : null,
  );

  // Split full_name into title + first + last
  const parseName = (full: string) => {
    const parts = (full ?? "").trim().split(" ");
    const titleFound = TITLES.find((t) => parts[0] === t);
    if (titleFound) {
      const rest = parts.slice(1);
      return { title: titleFound, firstName: rest.slice(0, -1).join(" "), lastName: rest[rest.length - 1] ?? "" };
    }
    return { title: "", firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] ?? "" };
  };

  const initName = parseName(user?.full_name ?? "");

  const [form, setForm] = useState({
    title: initName.title,
    first_name: initName.firstName,
    last_name: initName.lastName,
    phone: user?.phone ?? "",
    gender: user?.gender ?? "",
    country: user?.country ?? "",
    country_manual: "",
    city: user?.city ?? "",
    city_manual: "",
    neighborhood: user?.neighborhood ?? "",
    neighborhood_manual: "",
    occupation: user?.occupation ?? "",
    date_of_birth: (user as any)?.date_of_birth ?? "",
    birth_place: (user as any)?.birth_place ?? "",
    address: user?.address ?? "",
  });

  // Derived: detect "Autres" selections
  const countryIsOther = form.country === "OTHER";
  const cityIsOther = form.city === "OTHER";
  const neighborhoodIsOther = form.neighborhood === "OTHER";

  useEffect(() => {
    setPushEnabled(!!user?.push_consent);
  }, [user?.push_consent]);

  const togglePush = async (enabled: boolean) => {
    try {
      await api.post("/notifications/consent", { push_consent: enabled, marketing_consent: enabled });
      setPushEnabled(enabled);
      if (enabled && Platform.OS !== "web") {
        const { requestPushPermissionAndRegister } = await import("@/src/push-notifications");
        await requestPushPermissionAndRegister();
      }
    } catch {
      Alert.alert("Erreur", "Impossible de mettre à jour les préférences de notification.");
    }
  };

  // Sync form when user context updates
  useEffect(() => {
    if (user) {
      const n = parseName(user.full_name ?? "");
      setForm((prev) => ({
        ...prev,
        title: n.title,
        first_name: n.firstName,
        last_name: n.lastName,
        phone: user.phone ?? "",
        gender: user.gender ?? "",
        country: user.country ?? "",
        city: user.city ?? "",
        neighborhood: user.neighborhood ?? "",
        occupation: user.occupation ?? "",
        date_of_birth: (user as any)?.date_of_birth ?? "",
        birth_place: (user as any)?.birth_place ?? "",
        address: user.address ?? "",
      }));
      setDobDate(user.date_of_birth ? new Date(user.date_of_birth) : null);
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      const [info, enabled] = await Promise.all([getBiometricInfo(), isBiometricEnabled()]);
      setBioAvailable(info.available);
      setBioLabel(info.label);
      setBioEnabled(enabled);
      setBioLoaded(true);
    })().catch(() => setBioLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      // Reconstruct full_name from title + first + last
      const nameParts = [form.title, form.first_name, form.last_name].filter(Boolean);
      const full_name = nameParts.join(" ").trim();

      // Resolve "Autres" → manual fields
      const country = countryIsOther ? form.country_manual : form.country;
      const city = cityIsOther ? form.city_manual : form.city;
      const neighborhood = neighborhoodIsOther ? form.neighborhood_manual : form.neighborhood;

      await api.patch<User>("/users/me", {
        full_name,
        phone: form.phone,
        gender: form.gender,
        country,
        city,
        neighborhood,
        occupation: form.occupation,
        date_of_birth: dobDate ? dobDate.toISOString().split("T")[0] : (form.date_of_birth || null),
        birth_place: form.birth_place,
        address: form.address,
      });
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
    if (bioBusy) return;
    if (Platform.OS === "web") {
      Alert.alert("Biométrie indisponible", "Utilisez l'application mobile HODIX pour activer Face ID ou l'empreinte digitale.");
      return;
    }

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
              setBioBusy(true);
              try {
                const ok = await setBiometricEnabled(false);
                if (!ok) {
                  Alert.alert("Erreur", "Impossible de mettre à jour la préférence biométrique.");
                  return;
                }
                setBioEnabled(false);
              } finally {
                setBioBusy(false);
              }
            },
          },
        ],
      );
      return;
    }

    setBioBusy(true);
    try {
      const info = await getBiometricInfo();
      setBioAvailable(info.available);
      setBioLabel(info.label);
      if (!info.available) {
        Alert.alert(
          "Biométrie indisponible",
          "Aucune empreinte ou reconnaissance faciale n'est configurée sur cet appareil. Ajoutez-en une dans les réglages système, puis réessayez.",
        );
        return;
      }

      const auth = await authenticateBiometricDetailed(`Activer ${info.label} pour Hodix`);
      if (!auth.success) {
        if (auth.error !== "cancelled") {
          Alert.alert("Échec", "La vérification biométrique a échoué. Réessayez.");
        }
        return;
      }

      const saved = await setBiometricEnabled(true);
      if (!saved) {
        Alert.alert("Erreur", "Impossible d'enregistrer la préférence sur cet appareil.");
        return;
      }
      setBioEnabled(true);
      Alert.alert(
        "Biométrie activée",
        `${info.label} sera demandé à l'ouverture de l'app et pour confirmer certaines actions sensibles.`,
      );
    } finally {
      setBioBusy(false);
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
            <VerifiedName
              name={[form.title, form.first_name, form.last_name].filter(Boolean).join(" ") || user?.full_name || ""}
              kycVerified={isKycVerified(user?.kyc_status)}
              style={styles.fullName}
              containerStyle={{ justifyContent: "center" }}
            />
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
              <InfoRow icon={<ShieldCheck size={16} color={user?.kyc_status === "approved" ? Colors.accent : Colors.textMuted} />} label="KYC" value={user?.kyc_status === "approved" ? "✓ Vérifié" : (user?.kyc_status === "pending" || user?.kyc_status === "pending_review") ? "En attente" : "Non soumis"} last txtColor={txt} txtMuted={txtMuted} borderColor={borderColor} />
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
            <Card style={{ padding: Spacing.xl }}>

              {/* ── Identité : titre + prénom + nom ── */}
              <NameField
                titles={TITLES}
                titleValue={form.title}
                onTitleChange={(v) => setForm({ ...form, title: v })}
                firstNameValue={form.first_name}
                onFirstNameChange={(v) => setForm({ ...form, first_name: v })}
                lastNameValue={form.last_name}
                onLastNameChange={(v) => setForm({ ...form, last_name: v })}
                disabled={!editing}
              />

              {/* ── Date de naissance ── */}
              <DatePicker
                label="Date de naissance"
                value={form.date_of_birth}
                onChange={(iso) => setForm({ ...form, date_of_birth: iso })}
                disabled={!editing}
                testID="profile-dob"
              />

              {/* ── Lieu de naissance ── */}
              <View style={styles.fieldWrap}>
                <Text style={styles.inlineLabel}>Lieu de naissance</Text>
                <TextInput
                  style={[styles.inlineInput, !editing && styles.inlineInputDisabled]}
                  value={form.birth_place}
                  onChangeText={(v) => setForm({ ...form, birth_place: v })}
                  editable={editing}
                  placeholder="Ville / Pays de naissance"
                  placeholderTextColor={Colors.textSubtle}
                />
              </View>

              {/* ── Téléphone ── */}
              <View style={styles.fieldWrap}>
                <Text style={styles.inlineLabel}>Téléphone</Text>
                <TextInput
                  style={[styles.inlineInput, !editing && styles.inlineInputDisabled]}
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  editable={editing}
                  keyboardType="phone-pad"
                  placeholder="+237 6XX XXX XXX"
                  placeholderTextColor={Colors.textSubtle}
                />
              </View>

              {/* ── Profession ── */}
              <View style={styles.fieldWrap}>
                <Text style={styles.inlineLabel}>Profession</Text>
                <TextInput
                  style={[styles.inlineInput, !editing && styles.inlineInputDisabled]}
                  value={form.occupation}
                  onChangeText={(v) => setForm({ ...form, occupation: v })}
                  editable={editing}
                  placeholder="Votre profession"
                  placeholderTextColor={Colors.textSubtle}
                />
              </View>

              {/* ── Pays ── */}
              <SelectPicker
                label="Pays"
                value={form.country}
                options={COUNTRIES}
                onSelect={(v) => setForm({ ...form, country: v, city: "", city_manual: "", neighborhood: "", neighborhood_manual: "" })}
                disabled={!editing}
                testID="profile-country"
              />
              {countryIsOther && editing ? (
                <ManualField
                  label="Précisez le pays"
                  value={form.country_manual}
                  onChange={(v) => setForm({ ...form, country_manual: v })}
                  placeholder="Nom de votre pays..."
                />
              ) : null}

              {/* ── Ville ── */}
              {form.country && !countryIsOther ? (
                <SelectPicker
                  label="Ville"
                  value={form.city}
                  options={getCities(form.country)}
                  onSelect={(v) => setForm({ ...form, city: v, neighborhood: "", neighborhood_manual: "" })}
                  disabled={!editing}
                  testID="profile-city"
                />
              ) : countryIsOther ? (
                <ManualField
                  label="Ville"
                  value={form.city_manual}
                  onChange={(v) => setForm({ ...form, city_manual: v })}
                  placeholder="Votre ville..."
                />
              ) : null}
              {cityIsOther && !countryIsOther && editing ? (
                <ManualField
                  label="Précisez la ville"
                  value={form.city_manual}
                  onChange={(v) => setForm({ ...form, city_manual: v })}
                  placeholder="Nom de votre ville..."
                />
              ) : null}

              {/* ── Quartier ── */}
              {form.city && !cityIsOther && !countryIsOther && getNeighborhoods(form.city).length > 1 ? (
                <SelectPicker
                  label="Quartier"
                  value={form.neighborhood}
                  options={getNeighborhoods(form.city)}
                  onSelect={(v) => setForm({ ...form, neighborhood: v, neighborhood_manual: "" })}
                  disabled={!editing}
                  testID="profile-neighborhood"
                />
              ) : (form.city || cityIsOther || countryIsOther) ? (
                <ManualField
                  label="Quartier"
                  value={form.neighborhood_manual || form.neighborhood}
                  onChange={(v) => setForm({ ...form, neighborhood_manual: v, neighborhood: v })}
                  disabled={!editing}
                  placeholder="Votre quartier..."
                />
              ) : null}
              {neighborhoodIsOther && editing ? (
                <ManualField
                  label="Précisez le quartier"
                  value={form.neighborhood_manual}
                  onChange={(v) => setForm({ ...form, neighborhood_manual: v })}
                  placeholder="Nom de votre quartier..."
                />
              ) : null}

              {/* ── Adresse ── */}
              <View style={[styles.fieldWrap, { marginBottom: 4 }]}>
                <Text style={styles.inlineLabel}>Adresse (optionnel)</Text>
                <TextInput
                  style={[styles.inlineInput, !editing && styles.inlineInputDisabled]}
                  value={form.address}
                  onChangeText={(v) => setForm({ ...form, address: v })}
                  editable={editing}
                  placeholder="Rue, numéro, immeuble..."
                  placeholderTextColor={Colors.textSubtle}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {editing ? (
                <View style={{ marginTop: 16 }}>
                  <Button
                    testID="profile-save"
                    label="Enregistrer les modifications"
                    onPress={handleSave}
                    loading={saving}
                    icon={<Save color="#fff" size={16} />}
                  />
                </View>
              ) : null}
            </Card>
          </View>

          {/* Settings */}
          <SectionTitle>Préférences</SectionTitle>
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <Card>
              <SettingRow icon={<Globe color={Colors.secondary} size={18} />} label={t("profile.language") + " · " + (language === "fr" ? "Français" : "English")} onPress={() => Alert.alert("Langue / Language", "", [{ text: "Français", onPress: () => setLanguage("fr") }, { text: "English", onPress: () => setLanguage("en") }, { text: t("common.cancel"), style: "cancel" }])} testID="profile-language" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Bell color={Colors.secondary} size={18} />} label="Centre de notifications" onPress={() => router.push("/notifications")} testID="profile-go-notifs" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Gift color={Colors.accent} size={18} />} label="Parrainage & réseau" onPress={() => router.push("/referral" as any)} testID="profile-go-referral" borderColor={borderColor} txtColor={txt} />
              {Platform.OS !== "web" ? (
                <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: borderColor }]}>
                  <Bell color={pushEnabled ? Colors.secondary : Colors.textMuted} size={18} />
                  <Text style={[styles.toggleLabel, { color: txt }]}>Notifications push</Text>
                  <Switch
                    value={pushEnabled}
                    onValueChange={togglePush}
                    trackColor={{ false: Colors.border, true: Colors.secondary }}
                    thumbColor="#fff"
                    testID="profile-push-toggle"
                  />
                </View>
              ) : null}
              {isDiasporaMember(user) ? (
                <SettingRow
                  icon={<Globe color={Colors.primary} size={18} />}
                  label={`Mode Diaspora · ${user?.diaspora_country ?? "actif"}`}
                  onPress={() => router.push("/(tabs)" as any)}
                  testID="profile-diaspora-active"
                  borderColor={borderColor}
                  txtColor={txt}
                />
              ) : (
                <SettingRow icon={<Globe color={Colors.primary} size={18} />} label="HODIX Diaspora — s'inscrire" onPress={() => router.push("/diaspora" as any)} testID="profile-go-diaspora" borderColor={borderColor} txtColor={txt} />
              )}
              <SettingRow icon={<Settings2 color={Colors.brandNavy} size={18} />} label="Tableau de gestion" onPress={() => router.push("/manage" as any)} testID="profile-go-manage" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<ShieldCheck color={Colors.accent} size={18} />} label="Vérification KYC" onPress={() => router.push("/kyc")} testID="profile-go-kyc" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<CreditCard color={Colors.primary} size={18} />} label="Mes Paiements" onPress={() => router.push("/payments")} testID="profile-go-payments" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Shield color="#7C3AED" size={18} />} label="Mes données & droits" onPress={() => router.push("/data-rights" as any)} testID="profile-go-data-rights" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Shield color={Colors.secondary} size={18} />} label="Politique de confidentialité" onPress={() => router.push("/privacy" as any)} testID="profile-go-privacy" borderColor={borderColor} txtColor={txt} />
              <SettingRow icon={<Shield color={Colors.textMuted} size={18} />} label="Conditions d'utilisation (CGU)" onPress={() => router.push("/cgu" as any)} testID="profile-go-cgu" borderColor={borderColor} txtColor={txt} />
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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: txt }]}>Connexion biométrique</Text>
                  {Platform.OS === "web" ? (
                    <Text style={{ fontSize: 11, color: txtMuted, marginTop: 2 }}>Disponible sur l'app mobile</Text>
                  ) : !bioLoaded ? (
                    <Text style={{ fontSize: 11, color: txtMuted, marginTop: 2 }}>Vérification…</Text>
                  ) : bioLabel && bioAvailable ? (
                    <Text style={{ fontSize: 11, color: txtMuted, marginTop: 2 }}>{bioLabel}</Text>
                  ) : !bioAvailable ? (
                    <Text style={{ fontSize: 11, color: Colors.warning, marginTop: 2 }}>Non configurée sur l'appareil</Text>
                  ) : null}
                </View>
                <Switch
                  value={bioEnabled}
                  onValueChange={handleBioToggle}
                  disabled={bioBusy || Platform.OS === "web" || !bioLoaded}
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
  fieldWrap: { marginBottom: 14 },
  inlineLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" },
  inlineInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 14,
    paddingVertical: 13, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 14, fontWeight: "600",
  },
  inlineInputDisabled: { opacity: 0.6, backgroundColor: Colors.borderLight },
});
