import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Coins, Users, DollarSign, Calendar } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function CreateTontine() {
  const router = useRouter();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [contribution, setContribution] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [loading, setLoading] = useState(false);

  const freqs = [{ key: "weekly", label: "Hebdomadaire" }, { key: "biweekly", label: "Bimensuel" }, { key: "monthly", label: "Mensuel" }] as const;

  async function handleCreate() {
    if (!name.trim()) { show("Nom de la tontine requis", "error"); return; }
    const amt = parseFloat(contribution.replace(/\s/g, ""));
    if (!amt || amt <= 0) { show("Cotisation invalide", "error"); return; }
    setLoading(true);
    try {
      const t = await api.post<{ id: string }>("/tontines", {
        name: name.trim(),
        contribution_amount: amt,
        currency: "XAF",
        max_members: parseInt(maxMembers) || 10,
        frequency,
      });
      show("Tontine créée !", "success");
      router.replace(`/${t.id}`);
    } catch (e: any) {
      show(e?.detail || "Erreur lors de la création", "error");
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color={Colors.text} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Créer une tontine</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}><Coins size={36} color={Colors.primary} /></View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nom de la tontine</Text>
            <View style={styles.inputRow}><Coins size={16} color={Colors.textMuted} /><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Tontine Famille" placeholderTextColor={Colors.textMuted} /></View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Cotisation par tour (XAF)</Text>
            <View style={styles.inputRow}><DollarSign size={16} color={Colors.textMuted} /><TextInput style={styles.input} value={contribution} onChangeText={setContribution} placeholder="Ex: 25 000" placeholderTextColor={Colors.textMuted} keyboardType="numeric" /></View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nombre max de membres</Text>
            <View style={styles.inputRow}><Users size={16} color={Colors.textMuted} /><TextInput style={styles.input} value={maxMembers} onChangeText={setMaxMembers} placeholder="Ex: 12" placeholderTextColor={Colors.textMuted} keyboardType="numeric" /></View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Fréquence</Text>
            <View style={styles.freqRow}>
              {freqs.map(f => (
                <TouchableOpacity key={f.key} style={[styles.freqBtn, frequency === f.key && styles.freqBtnActive]} onPress={() => setFrequency(f.key)}>
                  <Text style={[styles.freqText, frequency === f.key && styles.freqTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Créer la tontine</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  form: { padding: Spacing.xl, gap: 16 },
  iconWrap: { alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, alignSelf: "center", marginVertical: Spacing.lg },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 14 : 0, gap: 10 },
  input: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: Platform.OS === "web" ? 0 : 14, outlineStyle: "none" } as any,
  freqRow: { flexDirection: "row", gap: 8 },
  freqBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", backgroundColor: Colors.surface },
  freqBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  freqText: { fontSize: 12, fontWeight: "600", color: Colors.textMuted },
  freqTextActive: { color: "#fff" },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
