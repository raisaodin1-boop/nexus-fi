import { useEffect, useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, FileUp } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import {
  DIASPORA_ID_DOC_TYPES,
  DIASPORA_RESIDENCE_COUNTRIES,
  diasporaCurrencyForCountry,
} from "@/src/diaspora-enrollment-config";
import { DiasporaManualBanner } from "@/src/diaspora-ui";

async function pickImage(): Promise<string | null> {
  const { launchImageLibraryAsync, MediaTypeOptions } = await import("expo-image-picker");
  const res = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, base64: true, quality: 0.8 });
  if (!res.canceled && res.assets[0]?.base64) return res.assets[0].base64;
  return null;
}

type DocSlot = "id_front" | "id_back" | "selfie" | "proof_abroad";

const DOC_LABELS: Record<DocSlot, { title: string; hint: string }> = {
  id_front: { title: "Passeport ou carte d'identité (recto)", hint: "Document de votre pays de résidence" },
  id_back: { title: "Verso (si applicable)", hint: "Optionnel pour passeport" },
  selfie: { title: "Selfie de vérification", hint: "Visage visible, fond neutre" },
  proof_abroad: { title: "Preuve de résidence à l'étranger", hint: "Titre de séjour, facture, ou visa" },
};

function PickerModal({ visible, title, options, onSelect, onClose }: {
  visible: boolean; title: string; options: readonly string[]; onSelect: (v: string) => void; onClose: () => void;
}) {
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

export default function DiasporaEnrollScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [countryModal, setCountryModal] = useState(false);
  const [docTypeModal, setDocTypeModal] = useState(false);

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [idDocType, setIdDocType] = useState<"passport" | "foreign_id" | "residence_permit">("passport");
  const [declaredAbroad, setDeclaredAbroad] = useState(false);

  const [docs, setDocs] = useState<Partial<Record<DocSlot, string>>>({});

  useEffect(() => {
    api.get<{ status: string }>("/diaspora/access").then((a) => {
      if (a.status === "approved") router.replace("/(tabs)" as any);
      if (a.status === "pending_review") router.replace("/diaspora" as any);
    }).catch(() => {});
  }, [router]);

  const pickDoc = async (slot: DocSlot) => {
    try {
      const b64 = await pickImage();
      if (b64) setDocs((d) => ({ ...d, [slot]: b64 }));
    } catch {
      show("Impossible d'accéder à la galerie", "error");
    }
  };

  const uploadDoc = async (slot: DocSlot, base64: string) => {
    const kind = slot === "proof_abroad" ? "proof_abroad" : slot;
    return api.post<string>("/diaspora/enrollment-upload", { kind, base64, mime: "image/jpeg" });
  };

  const submit = async () => {
    if (!docs.id_front || !docs.selfie || !docs.proof_abroad) {
      show("Pièce d'identité, selfie et preuve de résidence obligatoires", "error");
      return;
    }
    if (!declaredAbroad) {
      show("Confirmez résider hors du Cameroun", "error");
      return;
    }
    setBusy(true);
    try {
      const [idFront, selfie, proofAbroad, idBack] = await Promise.all([
        uploadDoc("id_front", docs.id_front!),
        uploadDoc("selfie", docs.selfie!),
        uploadDoc("proof_abroad", docs.proof_abroad!),
        docs.id_back ? uploadDoc("id_back", docs.id_back) : Promise.resolve(undefined),
      ]);
      await api.post("/diaspora/enrollment", {
        full_name: fullName.trim(),
        address_line1: address1.trim(),
        address_line2: address2.trim() || undefined,
        city: city.trim(),
        postal_code: postalCode.trim(),
        region: region.trim() || undefined,
        country_of_residence: country,
        phone: phone.trim(),
        email: email.trim() || undefined,
        id_document_type: idDocType,
        id_front_path: idFront,
        id_back_path: idBack,
        selfie_path: selfie,
        proof_abroad_path: proofAbroad,
        declared_abroad: true,
      });
      show("Dossier envoyé pour validation", "success");
      router.replace("/diaspora" as any);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur lors de l'envoi", "error");
    } finally {
      setBusy(false);
    }
  };

  const currency = country ? diasporaCurrencyForCountry(country) : "EUR";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={[Colors.gradStart, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color="#fff" size={22} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Inscription Diaspora</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <DiasporaManualBanner />
        <Text style={styles.intro}>
          Identité complète obligatoire. Votre dossier sera analysé manuellement avant l'accès au mode Diaspora.
        </Text>

        <View style={styles.steps}>
          <Text style={[styles.stepChip, step === 1 && styles.stepActive]}>1. Coordonnées</Text>
          <Text style={[styles.stepChip, step === 2 && styles.stepActive]}>2. Identité & preuves</Text>
        </View>

        {step === 1 ? (
          <Card>
            <Field label="Nom complet (identique à votre pièce)" value={fullName} onChangeText={setFullName} />
            <Field label="Adresse ligne 1" value={address1} onChangeText={setAddress1} placeholder="12 rue de la République" />
            <Field label="Adresse ligne 2 (facultatif)" value={address2} onChangeText={setAddress2} />
            <Field label="Ville" value={city} onChangeText={setCity} />
            <Field label="Code postal" value={postalCode} onChangeText={setPostalCode} />
            <Field label="Région / État (facultatif)" value={region} onChangeText={setRegion} />
            <TouchableOpacity style={styles.select} onPress={() => setCountryModal(true)}>
              <Text style={styles.selectLabel}>Pays de résidence *</Text>
              <View style={styles.selectRow}>
                <Text style={[styles.selectValue, !country && { color: Colors.textSubtle }]}>
                  {country || "Sélectionner…"}
                </Text>
                <ChevronDown size={16} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
            {country ? (
              <Text style={styles.currencyHint}>Devise dashboard : {currency}</Text>
            ) : null}
            <Field label="Téléphone (international)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Button label="Continuer — Identité" onPress={() => {
              if (!fullName.trim() || !address1.trim() || !city.trim() || !country || !phone.trim()) {
                show("Complétez tous les champs obligatoires", "error");
                return;
              }
              if (country === "Cameroun") {
                show("Le mode Diaspora est réservé aux résidents hors Cameroun", "error");
                return;
              }
              setStep(2);
            }} />
          </Card>
        ) : (
          <Card>
            <TouchableOpacity style={styles.select} onPress={() => setDocTypeModal(true)}>
              <Text style={styles.selectLabel}>Type de document</Text>
              <View style={styles.selectRow}>
                <Text style={styles.selectValue}>
                  {DIASPORA_ID_DOC_TYPES.find((d) => d.key === idDocType)?.label}
                </Text>
                <ChevronDown size={16} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>

            {(Object.keys(DOC_LABELS) as DocSlot[]).map((slot) => (
              <TouchableOpacity key={slot} style={styles.docRow} onPress={() => pickDoc(slot)}>
                <View style={[styles.docIcon, docs[slot] && styles.docDone]}>
                  {docs[slot] ? <CheckCircle2 color={Colors.success} size={20} /> : <Camera color={Colors.primary} size={20} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{DOC_LABELS[slot].title}</Text>
                  <Text style={styles.docHint}>{DOC_LABELS[slot].hint}</Text>
                </View>
                {slot === "id_back" ? <FileUp color={Colors.textMuted} size={18} /> : null}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.checkRow} onPress={() => setDeclaredAbroad(!declaredAbroad)}>
              <View style={[styles.checkbox, declaredAbroad && styles.checkboxOn]}>
                {declaredAbroad ? <CheckCircle2 color="#fff" size={14} /> : null}
              </View>
              <Text style={styles.checkText}>
                Je confirme résider hors du Cameroun et que les documents fournis sont authentiques. Toute fausse déclaration entraîne la suspension du compte.
              </Text>
            </TouchableOpacity>

            <View style={styles.btnRow}>
              <Button label="Retour" variant="outline" onPress={() => setStep(1)} fullWidth={false} style={{ flex: 1 }} />
              <Button label="Envoyer pour validation" onPress={submit} loading={busy} fullWidth={false} style={{ flex: 2 }} />
            </View>
          </Card>
        )}
      </ScrollView>

      <PickerModal visible={countryModal} title="Pays de résidence" options={DIASPORA_RESIDENCE_COUNTRIES} onSelect={setCountry} onClose={() => setCountryModal(false)} />
      <PickerModal
        visible={docTypeModal}
        title="Type de pièce"
        options={DIASPORA_ID_DOC_TYPES.map((d) => d.label)}
        onSelect={(label) => {
          const found = DIASPORA_ID_DOC_TYPES.find((d) => d.label === label);
          if (found) setIdDocType(found.key);
        }}
        onClose={() => setDocTypeModal(false)}
      />
    </SafeAreaView>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "70%" },
  title: { fontWeight: "900", fontSize: 16, color: Colors.primary, marginBottom: 16, textAlign: "center" },
  item: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemText: { fontSize: 15, color: Colors.text, fontWeight: "600" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.lg, flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", flex: 1 },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 48 },
  intro: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  steps: { flexDirection: "row", gap: 8 },
  stepChip: { flex: 1, textAlign: "center", paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, fontSize: 11, fontWeight: "800", color: Colors.textMuted },
  stepActive: { backgroundColor: Colors.primaryLight, color: Colors.primary },
  select: { marginBottom: 12 },
  selectLabel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, marginBottom: 6 },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border },
  selectValue: { fontSize: 15, fontWeight: "600", color: Colors.text },
  currencyHint: { fontSize: 12, color: Colors.secondary, fontWeight: "700", marginBottom: 12 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  docIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center" },
  docDone: { backgroundColor: Colors.successLight },
  docTitle: { fontSize: 13, fontWeight: "800", color: Colors.text },
  docHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: Colors.primary },
  checkText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10 },
});
