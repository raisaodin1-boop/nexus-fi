import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DiasporaManualBanner } from "@/src/diaspora-ui";

export default function DiasporaJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { show } = useToast();
  const [code, setCode] = useState(params.code?.toUpperCase() ?? "");
  const [preview, setPreview] = useState<any>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!code.trim()) { setPreview(null); return; }
    try {
      const data = await api.get<any>(`/diaspora/join-preview?code=${encodeURIComponent(code.trim())}`);
      setPreview(data);
    } catch {
      setPreview(null);
    }
  }, [code]);

  useFocusEffect(useCallback(() => {
    if (params.code) loadPreview();
  }, [params.code, loadPreview]));

  const join = async () => {
    if (!consent) { show("Acceptez les conditions Diaspora", "error"); return; }
    if (!code.trim()) { show("Code requis", "error"); return; }
    setLoading(true);
    try {
      const r = await api.post<{ tontine_id: string }>("/diaspora/join", { invite_code: code.trim(), diaspora_consent: true });
      show("Bienvenue dans la tontine !", "success");
      router.replace(`/tontines/${r.tontine_id}` as any);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setLoading(false);
    }
  };

  const t = preview?.tontine;
  const freqLabel: Record<string, string> = { weekly: "Hebdomadaire", biweekly: "Bi-mensuelle", monthly: "Mensuelle", quarterly: "Trimestrielle" };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={Colors.text} size={22} /></TouchableOpacity>
        <Text style={styles.title}>Rejoindre une tontine</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <DiasporaManualBanner />
        <Text style={styles.sub}>Code d'invitation, lien sécurisé ou recherche par nom (si publique).</Text>

        <Card>
          <Field label="Code d'invitation" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" />
          <Button label="Voir la fiche" variant="outline" onPress={loadPreview} />
        </Card>

        {t ? (
          <Card>
            <Text style={styles.tName}>{t.name}</Text>
            <InfoRow label="Cotisation" value={`${Number(t.amount_per_cycle ?? 0).toLocaleString("fr-FR")} ${t.currency ?? "XAF"}`} />
            <InfoRow label="Fréquence" value={freqLabel[t.frequency] ?? t.frequency ?? "—"} />
            <InfoRow label="Membres" value={String(preview.members?.length ?? "—")} />
            <InfoRow label="Devise" value={t.currency ?? "XAF"} />
            {preview.reliability_score != null ? (
              <InfoRow label="Régularité du groupe" value={`${preview.reliability_score}%`} />
            ) : null}
            {t.description ? <Text style={styles.desc}>{t.description}</Text> : null}

            <TouchableOpacity style={styles.checkRow} onPress={() => setConsent(!consent)}>
              <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                {consent ? <CheckCircle color="#fff" size={14} /> : null}
              </View>
              <Text style={styles.checkText}>
                Je comprends que mes cotisations seront confirmées uniquement après validation par HODIX.
              </Text>
            </TouchableOpacity>

            <Button label="Rejoindre cette tontine" onPress={join} loading={loading} disabled={!consent} />
          </Card>
        ) : null}

        <TouchableOpacity onPress={() => router.push("/tontines/directory" as any)}>
          <Text style={styles.link}>Parcourir l'annuaire des tontines publiques →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.lg },
  title: { fontSize: 20, fontWeight: "900", color: Colors.text },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 48 },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  tName: { fontSize: 20, fontWeight: "900", color: Colors.text, marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: "800", color: Colors.text },
  desc: { fontSize: 12, color: Colors.textMuted, marginTop: 10, lineHeight: 18 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: Colors.primary },
  checkText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 18, fontWeight: "600" },
  link: { color: Colors.secondary, fontWeight: "800", fontSize: 13, textAlign: "center", marginTop: 8 },
});
