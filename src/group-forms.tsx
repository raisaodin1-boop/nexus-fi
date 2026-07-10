// Shared group form helpers
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field, Card } from "@/src/ui";
import { api, ApiError } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { TontineConsentModal } from "@/src/tontine-consent-modal";

interface Props {
  title: string;
  subtitle: string;
  endpoint: string; // e.g. "/tontines"
  showContribution?: boolean;
  showRotationMode?: boolean;
  testIDPrefix: string;
  onSuccess: (data: any) => void;
}

const FREQ = [
  { key: "weekly", label: "Hebdo" },
  { key: "biweekly", label: "Bi-mensuel" },
  { key: "monthly", label: "Mensuel" },
];

const ROTATION_MODES = [
  { key: "rotation", label: "Tour de rôle", desc: "Ordre fixe basé sur l'inscription" },
  { key: "random", label: "Tirage au sort", desc: "Bénéficiaire choisi aléatoirement chaque cycle" },
  { key: "custom", label: "Ordre personnalisé", desc: "L'admin désigne le bénéficiaire" },
];

export function GroupCreateForm({ title, subtitle, endpoint, showContribution, showRotationMode, testIDPrefix, onSuccess }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [contribution, setContribution] = useState("");
  const [fee, setFee] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [maxMembers, setMaxMembers] = useState("10");
  const [rotationMode, setRotationMode] = useState("rotation");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Consent gate — only shown for tontine creation
  const [showConsent, setShowConsent] = useState(false);
  const isTontine = endpoint === "/tontines";

  // Build the body object from current form state
  const buildBody = (): any | null => {
    if (!name.trim()) { setError("Nom requis"); return null; }
    const body: any = { name: name.trim(), description: desc.trim() || null, currency: "XAF" };
    if (showContribution) {
      const amt = parseFloat(contribution);
      if (!amt || amt <= 0) { setError("Montant de contribution invalide"); return null; }
      body.amount_per_cycle = amt;
      body.frequency = frequency;
      body.max_members = parseInt(maxMembers) || 10;
      if (showRotationMode) body.is_public = isPublic;
    } else {
      body.membership_fee = parseFloat(fee) || 0;
    }
    return body;
  };

  const submit = async () => {
    setError(null);
    const body = buildBody();
    if (!body) return;
    // Tontines require consent before proceeding
    if (isTontine) { setShowConsent(true); return; }
    await doCreate(body);
  };

  const doCreate = async (body: any) => {
    setLoading(true);
    try {
      const r = await api.post(endpoint, body);
      onSuccess(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* ── Consent modal — tontines only ── */}
      {isTontine && (
        <TontineConsentModal
          visible={showConsent}
          onAccepted={() => {
            setShowConsent(false);
            const body = buildBody();
            if (body) doCreate(body);
            else setError("Vérifiez le formulaire avant de créer la tontine.");
          }}
          onDeclined={() => setShowConsent(false)}
        />
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} testID={`${testIDPrefix}-back`}><Text style={styles.back}>← Retour</Text></TouchableOpacity>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>

          <Field testID={`${testIDPrefix}-name`} label="Nom" placeholder="Ex: Tontine Bonabéri" value={name} onChangeText={setName} />
          <Field testID={`${testIDPrefix}-desc`} label="Description (optionnel)" placeholder="Brève description" value={desc} onChangeText={setDesc} multiline />

          {showContribution ? (
            <>
              <Field testID={`${testIDPrefix}-amount`} label="Montant par contribution (XAF)" placeholder="25000" value={contribution} onChangeText={setContribution} keyboardType="number-pad" />
              <Field testID={`${testIDPrefix}-max`} label="Nombre max de membres" placeholder="10" value={maxMembers} onChangeText={setMaxMembers} keyboardType="number-pad" />
              <Text style={styles.label}>Fréquence</Text>
              <View style={styles.freqRow}>
                {FREQ.map((f) => (
                  <TouchableOpacity
                    testID={`${testIDPrefix}-freq-${f.key}`}
                    key={f.key}
                    onPress={() => setFrequency(f.key)}
                    style={[styles.freqBtn, frequency === f.key ? { backgroundColor: Colors.primary } : { backgroundColor: Colors.surfaceAlt }]}
                  >
                    <Text style={{ color: frequency === f.key ? "#fff" : Colors.text, fontWeight: "700", fontSize: 13 }}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showRotationMode ? (
                <>
                  <Text style={styles.label}>Mode de distribution</Text>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {ROTATION_MODES.map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        testID={`${testIDPrefix}-mode-${r.key}`}
                        onPress={() => setRotationMode(r.key)}
                        style={[styles.modeRow, rotationMode === r.key ? styles.modeRowActive : null]}
                      >
                        <View style={[styles.radio, rotationMode === r.key ? styles.radioActive : null]}>
                          {rotationMode === r.key ? <View style={styles.radioDot} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Colors.text, fontWeight: "800", fontSize: 14 }}>{r.label}</Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>{r.desc}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.label}>Visibilité de la tontine</Text>
                  <View style={styles.visibilityRow}>
                    <TouchableOpacity
                      testID={`${testIDPrefix}-visibility-public`}
                      onPress={() => setIsPublic(true)}
                      style={[styles.visBtn, isPublic ? styles.visBtnActive : null]}
                    >
                      <Text style={[styles.visBtnLabel, isPublic ? styles.visBtnLabelActive : null]}>Publique</Text>
                      <Text style={[styles.visBtnDesc, isPublic ? { color: Colors.secondary } : null]}>Visible · rejoindre nécessite validation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`${testIDPrefix}-visibility-private`}
                      onPress={() => setIsPublic(false)}
                      style={[styles.visBtn, !isPublic ? styles.visBtnActive : null]}
                    >
                      <Text style={[styles.visBtnLabel, !isPublic ? styles.visBtnLabelActive : null]}>Privée</Text>
                      <Text style={[styles.visBtnDesc, !isPublic ? { color: Colors.secondary } : null]}>Code d'invitation uniquement</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <Field testID={`${testIDPrefix}-fee`} label="Cotisation membre (XAF) — 0 si gratuit" placeholder="5000" value={fee} onChangeText={setFee} keyboardType="number-pad" />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button testID={`${testIDPrefix}-submit`} label="Créer" onPress={submit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface JoinProps {
  title: string;
  endpoint: string;
  testIDPrefix: string;
  onSuccess: (data: any) => void;
}

export function GroupJoinForm({ title, endpoint, testIDPrefix, onSuccess }: JoinProps) {
  const router = useRouter();
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (codeParam) setCode(String(codeParam).trim().toUpperCase());
  }, [codeParam]);

  const submit = async () => {
    setError(null);
    if (!code.trim()) { setError("Code requis"); return; }
    setLoading(true);
    try {
      const r = await api.post(endpoint, { invite_code: code.trim() });
      onSuccess(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Retour</Text></TouchableOpacity>
        <Text style={styles.h1}>{title}</Text>
        <Text style={styles.sub}>Entrez le code partagé par l'administrateur.</Text>
        <Card>
          <Field testID={`${testIDPrefix}-code`} label="Code d'invitation" placeholder="BONABERI" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button testID={`${testIDPrefix}-submit`} label="Rejoindre" onPress={submit} loading={loading} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  h1: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: Colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  label: { color: Colors.text, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  freqRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  freqBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.lg, alignItems: "center" },
  modeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  modeRowActive: { borderColor: Colors.secondary, backgroundColor: "#EFF6FF" },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textSubtle,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: Colors.secondary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.secondary },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  visibilityRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  visBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  visBtnActive: { borderColor: Colors.secondary, backgroundColor: "#EFF6FF" },
  visBtnLabel: { color: Colors.text, fontWeight: "800", fontSize: 13 },
  visBtnLabelActive: { color: Colors.secondary },
  visBtnDesc: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
