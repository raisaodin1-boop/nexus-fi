// HODIX — Force phone / city / occupation + avatar before any other app action
import { useEffect, useState } from "react";
import {
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Briefcase, Camera, MapPin, Phone, User } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { GENERIC_AVATARS } from "@/src/generic-avatars";
import {
  AI_PHOTO_REJECT_MESSAGE,
  REAL_PHOTO_CREDIBILITY_TIP,
} from "@/src/profile-photo-guard";
import { isProfileActionReady } from "@/src/profile-completeness";

export default function CompleteProfile() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [occupation, setOccupation] = useState(user?.occupation ?? "");

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState("image/jpeg");
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [photoExif, setPhotoExif] = useState<Record<string, unknown> | null>(null);
  const [genericId, setGenericId] = useState<string | null>(null);
  const [realConfirmed, setRealConfirmed] = useState(false);

  useEffect(() => {
    api.get<any>("/users/me").then((profile) => {
      if (!profile) return;
      if (profile.full_name) setFullName(profile.full_name);
      if (profile.phone) setPhone(profile.phone);
      if (profile.city) setCity(profile.city);
      if (profile.occupation) setOccupation(profile.occupation);
      if (profile.avatar_kind === "generic" && typeof profile.photo_url === "string") {
        const id = profile.photo_url.replace(/^generic:/, "");
        if (id) setGenericId(id);
      }
      if (profile.avatar_kind === "real" && profile.photo_url) {
        setPhotoPreview(profile.photo_url);
      }
      if (isProfileActionReady(profile)) {
        // Already complete — leave gate
        router.replace("/");
      }
    }).catch(() => {});
  }, [router]);

  const submitStep1 = () => {
    if (!phone.trim() || !city.trim() || !occupation.trim()) {
      setError("Téléphone, profession et ville de résidence sont obligatoires.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const pickRealPhoto = async () => {
    try {
      const { launchImageLibraryAsync, MediaTypeOptions } = await import("expo-image-picker");
      const res = await launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Images,
        base64: true,
        quality: 0.75,
        allowsEditing: true,
        aspect: [1, 1],
        exif: true,
      });
      if (res.canceled || !res.assets[0]?.base64) return;
      const asset = res.assets[0];
      const b64 = asset.base64 as string;
      setPhotoBase64(b64);
      setPhotoPreview(asset.uri);
      setPhotoMime(asset.mimeType ?? "image/jpeg");
      setPhotoFileName(asset.fileName ? String(asset.fileName) : null);
      setPhotoExif(asset.exif ? (asset.exif as Record<string, unknown>) : null);
      setGenericId(null);
      setRealConfirmed(false);
      setError(null);
    } catch {
      Alert.alert("Erreur", "Impossible d'accéder à la galerie.");
    }
  };

  const selectGeneric = (id: string) => {
    setGenericId(id);
    setPhotoBase64(null);
    setPhotoPreview(null);
    setPhotoExif(null);
    setPhotoFileName(null);
    setRealConfirmed(false);
    setError(null);
  };

  const submit = async () => {
    if (!phone.trim() || !city.trim() || !occupation.trim()) {
      setError("Téléphone, profession et ville de résidence sont obligatoires.");
      setStep(1);
      return;
    }
    if (!photoBase64 && !genericId) {
      setError("Choisissez une photo réelle ou un avatar générique.");
      return;
    }
    if (photoBase64 && !realConfirmed) {
      setError("Confirmez que la photo est réelle (pas générée par IA).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.patch("/users/me", {
        full_name: fullName.trim() || user?.full_name || undefined,
        phone: phone.trim(),
        city: city.trim(),
        occupation: occupation.trim(),
      });

      if (photoBase64) {
        try {
          await api.post("/users/me/photo", {
            base64: photoBase64,
            mime: photoMime,
            fileName: photoFileName,
            exif: photoExif,
          });
        } catch (e) {
          const detail = e instanceof ApiError ? e.detail : AI_PHOTO_REJECT_MESSAGE;
          setError(detail);
          setBusy(false);
          return;
        }
      } else if (genericId) {
        await api.post("/users/me/avatar-generic", { avatar_id: genericId });
      }

      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
            <Text style={styles.headerTitle}>Complétez votre profil</Text>
            <Text style={styles.headerSub}>
              Votre compte est créé. Avant d&apos;utiliser l&apos;application, renseignez votre téléphone,
              votre profession, votre ville, et choisissez une photo.
            </Text>
            <View style={styles.progressRow}>
              <View style={[styles.progressStep, { backgroundColor: "#fff" }]}>
                <Text style={[styles.progressNum, { color: Colors.primary }]}>1</Text>
              </View>
              <View style={[styles.progressLine, step === 2 && { backgroundColor: "#fff" }]} />
              <View style={[styles.progressStep, step === 2 ? { backgroundColor: "#fff" } : { backgroundColor: "rgba(255,255,255,0.3)" }]}>
                <Text style={[styles.progressNum, step === 2 ? { color: Colors.primary } : { color: "#fff" }]}>2</Text>
              </View>
            </View>
            <Text style={styles.progressLabel}>
              {step === 1 ? "Coordonnées obligatoires" : "Photo de profil"}
            </Text>
          </LinearGradient>

          <View style={{ padding: Spacing.xl }}>
            {step === 1 ? (
              <Card style={{ gap: 2 }}>
                <Text style={styles.sectionTitle}><User size={14} color={Colors.secondary} /> Identité</Text>
                <Field
                  label="Nom complet"
                  placeholder="Prénom Nom"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  testID="profile-fullname"
                />

                <Text style={styles.sectionTitle}><Phone size={14} color={Colors.secondary} /> Contact *</Text>
                <Field
                  label="Téléphone *"
                  placeholder="+237 6XX XX XX XX"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  testID="profile-phone"
                />

                <Text style={styles.sectionTitle}><MapPin size={14} color={Colors.secondary} /> Résidence *</Text>
                <Field
                  label="Ville de résidence *"
                  placeholder="Douala"
                  value={city}
                  onChangeText={setCity}
                  testID="profile-city"
                />

                <Text style={styles.sectionTitle}><Briefcase size={14} color={Colors.secondary} /> Profession *</Text>
                <Field
                  label="Profession *"
                  placeholder="Commerçante, Enseignant..."
                  value={occupation}
                  onChangeText={setOccupation}
                  testID="profile-occupation"
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Continuer →" onPress={submitStep1} testID="profile-step1-next" />
              </Card>
            ) : (
              <Card style={{ gap: 14 }}>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>{REAL_PHOTO_CREDIBILITY_TIP}</Text>
                </View>

                <Text style={styles.sectionTitle}><Camera size={14} color={Colors.secondary} /> Photo réelle</Text>
                <TouchableOpacity
                  style={[styles.uploadBtn, !!photoPreview && styles.uploadBtnDone]}
                  onPress={pickRealPhoto}
                  testID="profile-upload-photo"
                >
                  {photoPreview ? (
                    <Image source={{ uri: photoPreview }} style={styles.preview} />
                  ) : (
                    <Text style={{ fontSize: 32 }}>📷</Text>
                  )}
                  <Text style={[styles.uploadLabel, photoPreview ? { color: Colors.accent } : null]}>
                    {photoPreview ? "Photo sélectionnée — appuyez pour changer" : "Choisir une photo réelle"}
                  </Text>
                  <Text style={styles.uploadSub}>Galerie · recadrage carré · pas d&apos;IA</Text>
                </TouchableOpacity>

                {photoPreview ? (
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => setRealConfirmed((v) => !v)}
                    testID="profile-confirm-real"
                  >
                    <View style={[styles.checkbox, realConfirmed && styles.checkboxOn]}>
                      {realConfirmed ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkLabel}>
                      Je confirme que c&apos;est une photo réelle de moi (pas générée par IA).
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.or}>— ou avatar générique —</Text>
                <View style={styles.genericRow}>
                  {GENERIC_AVATARS.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => selectGeneric(a.id)}
                      style={[
                        styles.genericDot,
                        { backgroundColor: a.bg },
                        genericId === a.id && styles.genericSelected,
                      ]}
                      testID={`profile-generic-${a.id}`}
                    >
                      <Text style={{ color: a.fg, fontWeight: "900" }}>{a.label[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {genericId ? (
                  <Text style={styles.genericHint}>
                    Avatar générique choisi. Vous pourrez ajouter une photo réelle plus tard pour gagner en crédibilité.
                  </Text>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Enregistrer et accéder à l'app" onPress={submit} loading={busy} testID="profile-submit" />
                <TouchableOpacity onPress={() => setStep(1)} style={{ alignItems: "center", padding: 10 }}>
                  <Text style={{ color: Colors.textMuted, fontWeight: "600", fontSize: 13 }}>← Retour</Text>
                </TouchableOpacity>
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: 28, paddingTop: 40, gap: 10 },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 20 },
  progressRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  progressStep: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  progressNum: { fontWeight: "900", fontSize: 13 },
  progressLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 6 },
  progressLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  sectionTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 12, marginBottom: 4 },
  infoBox: { backgroundColor: "#ECFDF5", borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: "#A7F3D0" },
  infoText: { color: "#065F46", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  uploadBtn: {
    borderWidth: 2, borderColor: Colors.border, borderStyle: "dashed",
    borderRadius: Radius.xl, padding: 24, alignItems: "center", gap: 10,
    backgroundColor: Colors.surfaceAlt,
  },
  uploadBtnDone: { borderColor: Colors.accent, borderStyle: "solid", backgroundColor: "#ECFDF5" },
  preview: { width: 96, height: 96, borderRadius: 48 },
  uploadLabel: { color: Colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  uploadSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkMark: { color: "#fff", fontWeight: "900", fontSize: 12 },
  checkLabel: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  or: { textAlign: "center", color: Colors.textMuted, fontWeight: "700", fontSize: 12 },
  genericRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  genericDot: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  genericSelected: { borderColor: Colors.primary, transform: [{ scale: 1.08 }] },
  genericHint: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center", lineHeight: 18 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: "600" },
});
