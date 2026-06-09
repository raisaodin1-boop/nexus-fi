// HODIX — Complete profile after registration
import { useState, useEffect } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { User, Phone, MapPin, Briefcase, ChevronDown, CheckCircle2 } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { DatePicker } from "@/src/date-picker";

const GENDERS = ["Homme", "Femme", "Autre"];
const COUNTRIES = [
  "Cameroun", "Sénégal", "Côte d'Ivoire", "Mali", "Burkina Faso",
  "Niger", "Tchad", "Gabon", "Congo", "RDC", "Nigeria", "Ghana",
  "Togo", "Bénin", "Guinée", "Madagascar", "Autre",
];

function PickerModal({
  visible, title, options, onSelect, onClose,
}: { visible: boolean; title: string; options: string[]; onSelect: (v: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={pickerStyles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={pickerStyles.sheet}>
          <Text style={pickerStyles.title}>{title}</Text>
          <ScrollView>
            {options.map((o) => (
              <TouchableOpacity key={o} style={pickerStyles.item} onPress={() => { onSelect(o); onClose(); }}>
                <Text style={pickerStyles.itemText}>{o}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "70%" },
  title: { fontWeight: "900", fontSize: 16, color: Colors.primary, marginBottom: 16, textAlign: "center" },
  item: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemText: { fontSize: 15, color: Colors.text, fontWeight: "600" },
});

function SelectField({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} testID={testID} style={selectStyles.wrap}>
      <Text style={selectStyles.label}>{label}</Text>
      <View style={selectStyles.row}>
        <Text style={[selectStyles.value, !value && { color: Colors.textSubtle }]}>{value || "Sélectionner..."}</Text>
        <ChevronDown size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const selectStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border },
  value: { fontSize: 15, color: Colors.text, fontWeight: "600" },
});

export default function CompleteProfile() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — personal info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [birthPlace, setBirthPlace] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [occupation, setOccupation] = useState("");

  // Step 2 — ID doc (optional at this stage, required at first withdrawal)
  const [idDocBase64, setIdDocBase64] = useState<string | null>(null);
  const [idPicked, setIdPicked] = useState(false);

  // Modals
  const [modal, setModal] = useState<null | "gender" | "country">(null);

  const birthDate = dobDate ? dobDate.toISOString().split("T")[0] : "";

  // Pre-fill form from existing profile data
  useEffect(() => {
    api.get<any>("/users/me").then((profile) => {
      if (!profile) return;
      if (profile.full_name) {
        const parts = profile.full_name.split(" ");
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" ") ?? "");
      }
      if (profile.phone) setPhone(profile.phone);
      if (profile.gender) setGender(profile.gender);
      if (profile.date_of_birth) setDobDate(new Date(profile.date_of_birth));
      if (profile.birth_place) setBirthPlace(profile.birth_place);
      if (profile.neighborhood) setNeighborhood(profile.neighborhood);
      if (profile.city) setCity(profile.city);
      if (profile.country) setCountry(profile.country);
      if (profile.occupation) setOccupation(profile.occupation);
    }).catch(() => {});
  }, []);

  const pickId = async () => {
    try {
      const { launchImageLibraryAsync, MediaTypeOptions } = await import("expo-image-picker");
      const res = await launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets[0]?.base64) {
        setIdDocBase64(res.assets[0].base64);
        setIdPicked(true);
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'accéder à la galerie.");
    }
  };

  const submitStep1 = () => {
    if (!firstName || !lastName || !phone || !dobDate || !birthPlace || !city || !country) {
      setError("Veuillez remplir tous les champs obligatoires (*)"); return;
    }
    setError(null);
    setStep(2);
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.patch("/users/me", {
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone: phone.trim(),
        gender,
        date_of_birth: birthDate,
        birth_place: birthPlace.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        country,
        occupation: occupation.trim(),
        ...(idDocBase64 ? { id_doc_base64: idDocBase64 } : {}),
      });
      await refresh();
      router.replace("/kyc");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Modals */}
      <PickerModal visible={modal === "gender"} title="Genre" options={GENDERS} onSelect={setGender} onClose={() => setModal(null)} />
      <PickerModal visible={modal === "country"} title="Pays" options={COUNTRIES} onSelect={setCountry} onClose={() => setModal(null)} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
            <Text style={styles.headerTitle}>Complétez votre profil</Text>
            <Text style={styles.headerSub}>
              Ces informations sont requises comme sur votre pièce d'identité pour sécuriser vos retraits.
            </Text>
            {/* Progress */}
            <View style={styles.progressRow}>
              <View style={[styles.progressStep, { backgroundColor: "#fff" }]}>
                <Text style={[styles.progressNum, { color: Colors.primary }]}>1</Text>
              </View>
              <View style={[styles.progressLine, step === 2 && { backgroundColor: "#fff" }]} />
              <View style={[styles.progressStep, step === 2 ? { backgroundColor: "#fff" } : { backgroundColor: "rgba(255,255,255,0.3)" }]}>
                <Text style={[styles.progressNum, step === 2 ? { color: Colors.primary } : { color: "#fff" }]}>2</Text>
              </View>
            </View>
            <Text style={styles.progressLabel}>{step === 1 ? "Informations personnelles" : "Pièce d'identité"}</Text>
          </LinearGradient>

          <View style={{ padding: Spacing.xl }}>
            {step === 1 ? (
              <Card style={{ gap: 2 }}>
                <Text style={styles.sectionTitle}><User size={14} color={Colors.secondary} /> Identité</Text>
                <Field label="Prénom *" placeholder="Aïssatou" value={firstName} onChangeText={setFirstName} autoCapitalize="words" testID="profile-firstname" />
                <Field label="Nom de famille *" placeholder="DIALLO" value={lastName} onChangeText={setLastName} autoCapitalize="characters" testID="profile-lastname" />
                <SelectField label="Genre" value={gender} onPress={() => setModal("gender")} testID="profile-gender" />

                <DatePicker label="Date de naissance *" value={dobDate} onChange={setDobDate} testID="profile-dob" />

                <Field label="Lieu de naissance *" placeholder="Douala, Cameroun" value={birthPlace} onChangeText={setBirthPlace} testID="profile-birthplace" />

                <Text style={styles.sectionTitle}><Phone size={14} color={Colors.secondary} /> Contact</Text>
                <Field label="Téléphone *" placeholder="+237 6XX XX XX XX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="profile-phone" />

                <Text style={styles.sectionTitle}><MapPin size={14} color={Colors.secondary} /> Adresse</Text>
                <Field label="Quartier" placeholder="Bonamoussadi" value={neighborhood} onChangeText={setNeighborhood} testID="profile-neighborhood" />
                <Field label="Ville *" placeholder="Douala" value={city} onChangeText={setCity} testID="profile-city" />
                <SelectField label="Pays *" value={country} onPress={() => setModal("country")} testID="profile-country" />

                <Text style={styles.sectionTitle}><Briefcase size={14} color={Colors.secondary} /> Profession</Text>
                <Field label="Profession" placeholder="Commerçante, Enseignant..." value={occupation} onChangeText={setOccupation} testID="profile-occupation" />

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Continuer →" onPress={submitStep1} testID="profile-step1-next" />
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>Pièce d'identité nationale</Text>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    📋 Téléversez votre CNI, passeport ou permis de conduire.{"\n"}
                    Cette pièce sera vérifiée lors de votre premier retrait.{"\n"}
                    Vous pouvez passer cette étape et la faire plus tard.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.uploadBtn, idPicked && styles.uploadBtnDone]}
                  onPress={pickId}
                  testID="profile-upload-id"
                >
                  {idPicked ? (
                    <>
                      <CheckCircle2 color={Colors.accent} size={32} />
                      <Text style={[styles.uploadLabel, { color: Colors.accent }]}>Pièce d'identité chargée ✓</Text>
                      <Text style={styles.uploadSub}>Appuyez pour changer</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 32 }}>📄</Text>
                      <Text style={styles.uploadLabel}>Appuyer pour téléverser</Text>
                      <Text style={styles.uploadSub}>CNI · Passeport · Permis</Text>
                    </>
                  )}
                </TouchableOpacity>

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Terminer et accéder à l'app" onPress={submit} loading={busy} testID="profile-submit" />
                <TouchableOpacity onPress={submit} style={{ alignItems: "center", padding: 10 }} testID="profile-skip-id">
                  <Text style={{ color: Colors.textMuted, fontWeight: "600", fontSize: 13 }}>Passer cette étape pour l'instant</Text>
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
  sectionTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 12, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 6 } as any,
  infoBox: { backgroundColor: "#FFF7ED", borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: "#FED7AA" },
  infoText: { color: "#92400E", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  uploadBtn: {
    borderWidth: 2, borderColor: Colors.border, borderStyle: "dashed",
    borderRadius: Radius.xl, padding: 32, alignItems: "center", gap: 10,
    backgroundColor: Colors.surfaceAlt,
  },
  uploadBtnDone: { borderColor: Colors.accent, borderStyle: "solid", backgroundColor: "#ECFDF5" },
  uploadLabel: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  uploadSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: "600" },
});
