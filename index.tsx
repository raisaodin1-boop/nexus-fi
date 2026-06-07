// KYC: Niveau 1 (formulaire étendu) + Niveau 2 (CNI + selfie + adresse en base64).
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, Camera, FileImage, CheckCircle2, Clock, AlertCircle, ChevronDown } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

interface KycRecord {
  user_id?: string;
  level: number;
  status: string;
  full_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  decision_note?: string;
  birth_date?: string;
  birth_place?: string;
  residence?: string;
  id_number?: string;
  gender?: string;
  father_name?: string;
  mother_name?: string;
  marital_status?: string;
  children_count?: number;
}

type PickerModal = "date" | "gender" | "marital_status" | "children_count" | null;

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
const YEARS = Array.from({ length: 66 }, (_, i) => String(2005 - i));

export default function KycScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [record, setRecord] = useState<KycRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingL2, setSubmittingL2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<PickerModal>(null);

  // Date picker state
  const [dateDay, setDateDay] = useState("01");
  const [dateMonth, setDateMonth] = useState("01");
  const [dateYear, setDateYear] = useState("1990");

  // Level 1 fields
  const [form, setForm] = useState({
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    birth_date: "",
    birth_place: "",
    residence: "",
    id_number: "",
    gender: "",
    father_name: "",
    mother_name: "",
    marital_status: "",
    children_count: "",
  });

  // Level 2 fields
  const [cniBase64, setCniBase64] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [address, setAddress] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get<KycRecord>("/kyc/me");
      setRecord(r);
      if (r.full_name) setForm((f) => ({ ...f, full_name: r.full_name || f.full_name }));
      if (r.phone) setForm((f) => ({ ...f, phone: r.phone || f.phone }));
      if (r.email) setForm((f) => ({ ...f, email: r.email || f.email }));
      if (r.birth_date) setForm((f) => ({ ...f, birth_date: r.birth_date || f.birth_date }));
      if (r.birth_place) setForm((f) => ({ ...f, birth_place: r.birth_place || f.birth_place }));
      if (r.residence) setForm((f) => ({ ...f, residence: r.residence || f.residence }));
      if (r.id_number) setForm((f) => ({ ...f, id_number: r.id_number || f.id_number }));
      if (r.gender) setForm((f) => ({ ...f, gender: r.gender || f.gender }));
      if (r.father_name) setForm((f) => ({ ...f, father_name: r.father_name || f.father_name }));
      if (r.mother_name) setForm((f) => ({ ...f, mother_name: r.mother_name || f.mother_name }));
      if (r.marital_status) setForm((f) => ({ ...f, marital_status: r.marital_status || f.marital_status }));
      if (r.children_count !== undefined) setForm((f) => ({ ...f, children_count: String(r.children_count ?? "") }));
      if (r.address) setAddress(r.address);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickImage = async (kind: "cni" | "selfie") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert("Permission requise", "Activez l'accès aux photos dans les réglages pour téléverser vos documents.", [{ text: "OK" }]);
      } else {
        Alert.alert("Permission refusée", "Hodix a besoin de votre galerie pour téléverser le document.");
      }
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    let b64 = asset.base64;
    if (!b64 && asset.uri) {
      try { b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }); } catch {}
    }
    if (!b64) { Alert.alert("Erreur", "Impossible de lire l'image. Réessayez."); return; }
    if (b64.length > 3_500_000) { Alert.alert("Image trop lourde", "Choisissez une image plus petite (max ~3 Mo)."); return; }
    const prefixed = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    if (kind === "cni") setCniBase64(prefixed);
    else setSelfieBase64(prefixed);
  };

  const confirmDate = () => {
    const formatted = `${dateDay}/${dateMonth}/${dateYear}`;
    setForm((f) => ({ ...f, birth_date: formatted }));
    setActiveModal(null);
  };

  const submitLevel1 = async () => {
    setSubmitting(true); setError(null);
    try {
      await api.post("/kyc/level1", form);
      await refresh();
      await load();
      Alert.alert("Niveau 1 validé", "Vos informations de base ont été enregistrées. +5 points d'identité ajoutés.");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const submitLevel2 = async () => {
    if (!cniBase64 || !selfieBase64 || !address.trim()) {
      setError("CNI, selfie et adresse sont obligatoires."); return;
    }
    setSubmittingL2(true); setError(null);
    try {
      await api.post("/kyc/level2", { cni_base64: cniBase64, selfie_base64: selfieBase64, address });
      await load();
      Alert.alert("Dossier soumis", "Votre dossier KYC niveau 2 est en cours d'examen. Vous recevrez une notification.");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally {
      setSubmittingL2(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.secondary} size="large" /></View>
      </SafeAreaView>
    );
  }

  const level = record?.level ?? 0;
  const status = record?.status ?? "none";
  const disabled = level >= 1;

  const genderLabel = form.gender === "M" ? "Masculin (M)" : form.gender === "F" ? "Féminin (F)" : "";
  const maritalLabels: Record<string, string> = {
    celibataire: "Célibataire",
    marie: "Marié(e)",
    divorce: "Divorcé(e)",
    veuf: "Veuf/Veuve",
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="kyc-back"><Text style={styles.back}>← Retour</Text></TouchableOpacity>
            <Text style={styles.h1}>Vérification d'identité (KYC)</Text>
            <Text style={styles.sub}>Une identité vérifiée = un score plus solide</Text>
          </View>

          {/* Status banner */}
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <LinearGradient
              colors={level >= 2 ? [Colors.accentDark, Colors.accent] : level >= 1 ? [Colors.secondary, Colors.gradMid] : [Colors.primary, Colors.gradMid]}
              style={styles.banner}
            >
              <View style={styles.bannerIcon}>
                {level >= 2 ? <CheckCircle2 color="#fff" size={26} /> : level >= 1 ? <ShieldCheck color="#fff" size={26} /> : <AlertCircle color="#fff" size={26} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>
                  {level >= 2 ? "KYC complet" : level >= 1 ? "Identité de base vérifiée" : "Identité non vérifiée"}
                </Text>
                <Text style={styles.bannerDesc}>
                  {level >= 2 ? "Vous avez accès aux fonctionnalités premium et au certificat d'identité officiel." :
                   level >= 1 ? "Téléversez vos documents pour atteindre le niveau 2 (CNI + selfie)." :
                   "Complétez le niveau 1 pour démarrer votre identité financière."}
                </Text>
                {status === "pending_review" ? (
                  <View style={styles.pendingPill}>
                    <Clock color="#fff" size={11} />
                    <Text style={styles.pendingText}>Dossier niveau 2 en examen</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>
          </View>

          {/* LEVEL 1 */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
            <View style={styles.levelHeader}>
              <View style={[styles.levelBadge, { backgroundColor: level >= 1 ? Colors.accent : Colors.surfaceAlt }]}>
                <Text style={[styles.levelNum, { color: level >= 1 ? "#fff" : Colors.text }]}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.levelTitle}>Niveau 1 · Identité de base</Text>
                <Text style={styles.levelDesc}>Informations personnelles officielles</Text>
              </View>
              {level >= 1 ? <CheckCircle2 color={Colors.accent} size={20} /> : null}
            </View>

            {/* Warning note */}
            <View style={styles.warningNote}>
              <Text style={styles.warningText}>
                ⚠️ Saisissez vos informations EXACTEMENT comme sur votre pièce d'identité officielle. Ces données seront comparées avec votre CNI/passeport pour valider votre badge Membre Vérifié.
              </Text>
            </View>

            <Card>
              {/* --- Identité officielle --- */}
              <Text style={styles.subHeader}>Identité officielle</Text>

              <Field
                testID="kyc-fullname"
                label="Nom complet"
                value={form.full_name}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, full_name: t })}
                placeholder="Ex: Aïssatou Demo"
              />

              {/* Date de naissance */}
              <Text style={styles.fieldLabel}>Date de naissance</Text>
              {Platform.OS === "web" ? (
                <Field
                  label=""
                  value={form.birth_date}
                  editable={!disabled}
                  onChangeText={(t) => setForm({ ...form, birth_date: t })}
                  placeholder="JJ/MM/AAAA"
                />
              ) : (
                <TouchableOpacity
                  style={[styles.pickerBtn, disabled && styles.pickerBtnDisabled]}
                  onPress={() => !disabled && setActiveModal("date")}
                  testID="kyc-birth-date"
                >
                  <Text style={[styles.pickerBtnText, !form.birth_date && styles.pickerBtnPlaceholder]}>
                    {form.birth_date || "Sélectionner la date"}
                  </Text>
                  <ChevronDown color={Colors.textMuted} size={16} />
                </TouchableOpacity>
              )}

              <Field
                testID="kyc-birth-place"
                label="Lieu de naissance"
                value={form.birth_place}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, birth_place: t })}
                placeholder="Ex: Douala"
              />

              {/* Sexe */}
              <Text style={styles.fieldLabel}>Sexe</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, disabled && styles.pickerBtnDisabled]}
                onPress={() => !disabled && setActiveModal("gender")}
                testID="kyc-gender"
              >
                <Text style={[styles.pickerBtnText, !form.gender && styles.pickerBtnPlaceholder]}>
                  {genderLabel || "Sélectionner le sexe"}
                </Text>
                <ChevronDown color={Colors.textMuted} size={16} />
              </TouchableOpacity>

              <Field
                testID="kyc-id-number"
                label="Numéro CNI ou passeport"
                value={form.id_number}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, id_number: t })}
                placeholder="Ex: 123456789"
              />

              {/* --- Situation familiale --- */}
              <Text style={[styles.subHeader, { marginTop: Spacing.lg }]}>Situation familiale</Text>

              <Field
                testID="kyc-father-name"
                label="Nom du père"
                value={form.father_name}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, father_name: t })}
                placeholder="Ex: Jean Demo"
              />

              <Field
                testID="kyc-mother-name"
                label="Nom de la mère"
                value={form.mother_name}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, mother_name: t })}
                placeholder="Ex: Marie Demo"
              />

              {/* Situation matrimoniale */}
              <Text style={styles.fieldLabel}>Situation matrimoniale</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, disabled && styles.pickerBtnDisabled]}
                onPress={() => !disabled && setActiveModal("marital_status")}
                testID="kyc-marital-status"
              >
                <Text style={[styles.pickerBtnText, !form.marital_status && styles.pickerBtnPlaceholder]}>
                  {maritalLabels[form.marital_status] || "Sélectionner la situation"}
                </Text>
                <ChevronDown color={Colors.textMuted} size={16} />
              </TouchableOpacity>

              {/* Nombre d'enfants */}
              <Text style={styles.fieldLabel}>Nombre d'enfants</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, disabled && styles.pickerBtnDisabled]}
                onPress={() => !disabled && setActiveModal("children_count")}
                testID="kyc-children-count"
              >
                <Text style={[styles.pickerBtnText, !form.children_count && styles.pickerBtnPlaceholder]}>
                  {form.children_count !== "" ? form.children_count : "Sélectionner le nombre"}
                </Text>
                <ChevronDown color={Colors.textMuted} size={16} />
              </TouchableOpacity>

              {/* --- Coordonnées --- */}
              <Text style={[styles.subHeader, { marginTop: Spacing.lg }]}>Coordonnées</Text>

              <Field
                testID="kyc-phone"
                label="Téléphone (E.164)"
                value={form.phone}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, phone: t })}
                placeholder="+237690123456"
                keyboardType="phone-pad"
              />

              <Field
                testID="kyc-residence"
                label="Lieu de résidence"
                value={form.residence}
                editable={!disabled}
                onChangeText={(t) => setForm({ ...form, residence: t })}
                placeholder="Ex: Yaoundé, Cameroun"
              />

              <Field
                testID="kyc-email"
                label="Email"
                value={form.email}
                editable={false}
                onChangeText={(t) => setForm({ ...form, email: t })}
              />

              {error && level < 1 ? <Text style={styles.error}>{error}</Text> : null}
              {level < 1 ? (
                <Button testID="kyc-submit-l1" label="Valider niveau 1" loading={submitting} onPress={submitLevel1} />
              ) : (
                <Text style={styles.successHint}>✅ Niveau 1 validé</Text>
              )}
            </Card>
          </View>

          {/* LEVEL 2 */}
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
            <View style={styles.levelHeader}>
              <View style={[styles.levelBadge, { backgroundColor: level >= 2 ? Colors.accent : Colors.surfaceAlt }]}>
                <Text style={[styles.levelNum, { color: level >= 2 ? "#fff" : Colors.text }]}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.levelTitle}>Niveau 2 · Vérification documentaire</Text>
                <Text style={styles.levelDesc}>CNI · Selfie · Adresse postale</Text>
              </View>
              {level >= 2 ? <CheckCircle2 color={Colors.accent} size={20} /> : null}
            </View>
            <Card>
              <Text style={styles.uploadLbl}>Photo de la CNI</Text>
              <TouchableOpacity onPress={() => pickImage("cni")} style={styles.uploadBox} disabled={level >= 2 || status === "pending_review"} testID="kyc-pick-cni">
                {cniBase64 ? (
                  <Image source={{ uri: cniBase64 }} style={styles.preview} resizeMode="cover" />
                ) : (
                  <>
                    <FileImage color={Colors.textMuted} size={28} />
                    <Text style={styles.uploadHint}>Téléverser la CNI</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={[styles.uploadLbl, { marginTop: Spacing.lg }]}>Selfie</Text>
              <TouchableOpacity onPress={() => pickImage("selfie")} style={styles.uploadBox} disabled={level >= 2 || status === "pending_review"} testID="kyc-pick-selfie">
                {selfieBase64 ? (
                  <Image source={{ uri: selfieBase64 }} style={styles.preview} resizeMode="cover" />
                ) : (
                  <>
                    <Camera color={Colors.textMuted} size={28} />
                    <Text style={styles.uploadHint}>Téléverser un selfie</Text>
                  </>
                )}
              </TouchableOpacity>

              <Field
                testID="kyc-address"
                label="Adresse postale complète"
                value={address}
                editable={level < 2 && status !== "pending_review"}
                onChangeText={setAddress}
                placeholder="Quartier, ville, pays"
                multiline
                style={{ minHeight: 64 }}
              />
              {error && level >= 1 ? <Text style={styles.error}>{error}</Text> : null}
              {level < 2 && status !== "pending_review" ? (
                <Button
                  testID="kyc-submit-l2"
                  label="Soumettre le dossier niveau 2"
                  loading={submittingL2}
                  disabled={level < 1}
                  onPress={submitLevel2}
                />
              ) : status === "pending_review" ? (
                <Text style={styles.successHint}>⏳ Dossier en cours d'examen par Hodix</Text>
              ) : (
                <Text style={styles.successHint}>✅ Niveau 2 validé</Text>
              )}
              {status === "rejected" && record?.decision_note ? (
                <View style={styles.rejectBox}>
                  <Text style={styles.rejectTitle}>Dossier refusé</Text>
                  <Text style={styles.rejectDesc}>{record.decision_note}</Text>
                </View>
              ) : null}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* DATE PICKER MODAL */}
      <Modal visible={activeModal === "date"} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Date de naissance</Text>
            <View style={styles.dateRow}>
              {/* Day */}
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>Jour</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {DAYS.map((d) => (
                    <TouchableOpacity key={d} onPress={() => setDateDay(d)} style={[styles.dateOpt, dateDay === d && styles.dateOptActive]}>
                      <Text style={[styles.dateOptText, dateDay === d && styles.dateOptTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Month */}
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>Mois</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {MONTHS.map((m) => (
                    <TouchableOpacity key={m} onPress={() => setDateMonth(m)} style={[styles.dateOpt, dateMonth === m && styles.dateOptActive]}>
                      <Text style={[styles.dateOptText, dateMonth === m && styles.dateOptTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Year */}
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>Année</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {YEARS.map((y) => (
                    <TouchableOpacity key={y} onPress={() => setDateYear(y)} style={[styles.dateOpt, dateYear === y && styles.dateOptActive]}>
                      <Text style={[styles.dateOptText, dateYear === y && styles.dateOptTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDate} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* GENDER MODAL */}
      <Modal visible={activeModal === "gender"} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Sexe</Text>
            {[{ val: "M", lbl: "Masculin (M)" }, { val: "F", lbl: "Féminin (F)" }].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={styles.optionRow}
                onPress={() => { setForm((f) => ({ ...f, gender: opt.val })); setActiveModal(null); }}
              >
                <Text style={styles.optionText}>{opt.lbl}</Text>
                {form.gender === opt.val ? <Text style={styles.checkmark}>✓</Text> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MARITAL STATUS MODAL */}
      <Modal visible={activeModal === "marital_status"} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Situation matrimoniale</Text>
            {[
              { val: "celibataire", lbl: "Célibataire" },
              { val: "marie", lbl: "Marié(e)" },
              { val: "divorce", lbl: "Divorcé(e)" },
              { val: "veuf", lbl: "Veuf/Veuve" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={styles.optionRow}
                onPress={() => { setForm((f) => ({ ...f, marital_status: opt.val })); setActiveModal(null); }}
              >
                <Text style={styles.optionText}>{opt.lbl}</Text>
                {form.marital_status === opt.val ? <Text style={styles.checkmark}>✓</Text> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CHILDREN COUNT MODAL */}
      <Modal visible={activeModal === "children_count"} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nombre d'enfants</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {["0","1","2","3","4","5","6","7","8","9+"].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.optionRow}
                  onPress={() => { setForm((f) => ({ ...f, children_count: opt })); setActiveModal(null); }}
                >
                  <Text style={styles.optionText}>{opt}</Text>
                  {form.children_count === opt ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  back: { color: Colors.textMuted, fontWeight: "600" },
  h1: { color: Colors.primary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginTop: 8 },
  sub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 18, borderRadius: Radius.xxl,
  },
  bannerIcon: {
    width: 50, height: 50, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  bannerTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  bannerDesc: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4, fontWeight: "500", lineHeight: 16 },
  pendingPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, alignSelf: "flex-start", marginTop: 8,
  },
  pendingText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  levelHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  levelBadge: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  levelNum: { fontSize: 14, fontWeight: "900" },
  levelTitle: { color: Colors.primary, fontSize: 16, fontWeight: "900" },
  levelDesc: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 1 },
  warningNote: {
    backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FB923C",
    borderRadius: Radius.lg, padding: 12, marginBottom: 12,
  },
  warningText: { color: "#9A3412", fontSize: 12, fontWeight: "600", lineHeight: 18 },
  subHeader: { fontSize: 13, fontWeight: "800", color: Colors.primary, letterSpacing: -0.2, marginBottom: 10, marginTop: 4, textTransform: "uppercase" },
  fieldLabel: { fontSize: 13, color: Colors.text, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.surface,
    marginBottom: 12,
  },
  pickerBtnDisabled: { opacity: 0.5 },
  pickerBtnText: { color: Colors.text, fontWeight: "600", fontSize: 14 },
  pickerBtnPlaceholder: { color: Colors.textMuted },
  uploadLbl: { fontSize: 13, color: Colors.text, fontWeight: "700", marginBottom: 6 },
  uploadBox: {
    minHeight: 120, borderWidth: 2, borderStyle: "dashed", borderColor: Colors.border,
    borderRadius: Radius.lg, alignItems: "center", justifyContent: "center", padding: 12,
    backgroundColor: Colors.surfaceAlt, overflow: "hidden",
  },
  uploadHint: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 6 },
  preview: { width: "100%", height: 160, borderRadius: 8 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  successHint: { color: Colors.accent, fontWeight: "800", textAlign: "center", paddingVertical: 8 },
  rejectBox: { backgroundColor: "#FEE2E2", padding: 12, borderRadius: 12, marginTop: 8 },
  rejectTitle: { color: Colors.danger, fontWeight: "800", fontSize: 13 },
  rejectDesc: { color: "#7F1D1D", fontSize: 12, marginTop: 4, fontWeight: "500" },
  // Modal styles
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: Colors.primary, marginBottom: 16, textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    padding: 12, alignItems: "center", marginTop: 12,
  },
  modalCancelText: { color: Colors.textMuted, fontWeight: "700" },
  modalConfirmBtn: {
    flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.lg,
    padding: 12, alignItems: "center",
  },
  modalConfirmText: { color: "#fff", fontWeight: "800" },
  dateRow: { flexDirection: "row", gap: 8 },
  dateCol: { flex: 1 },
  dateColLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "800", textAlign: "center", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  dateScroll: { maxHeight: 200 },
  dateOpt: { paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  dateOptActive: { backgroundColor: Colors.accent + "20" },
  dateOptText: { fontSize: 15, fontWeight: "600", color: Colors.text },
  dateOptTextActive: { color: Colors.accent, fontWeight: "900" },
  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  optionText: { fontSize: 15, color: Colors.text, fontWeight: "600" },
  checkmark: { color: Colors.accent, fontWeight: "900", fontSize: 16 },
});
