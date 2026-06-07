import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, PiggyBank, Target, Calendar } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function CreateSavingsGoal() {
  const router = useRouter();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { show("Nom de l'objectif requis", "error"); return; }
    const targetAmt = parseFloat(target.replace(/\s/g, ""));
    if (!targetAmt || targetAmt <= 0) { show("Montant cible invalide", "error"); return; }
    setLoading(true);
    try {
      const goal = await api.post<{ id: string }>("/savings/goals", {
        name: name.trim(),
        target_amount: targetAmt,
        currency: "XAF",
        deadline: deadline || undefined,
      });
      show("Objectif créé avec succès !", "success");
      router.replace("/");
    } catch (e: any) {
      show(e?.detail || "Erreur lors de la création", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nouvel objectif</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <PiggyBank size={40} color={Colors.primary} />
          </View>
          <Text style={styles.subtitle}>Définissez votre objectif d'épargne</Text>

          <Field label="Nom de l'objectif" icon={<PiggyBank size={16} color={Colors.textMuted} />}>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Vacances, Voiture, Maison..." placeholderTextColor={Colors.textMuted} />
          </Field>

          <Field label="Montant cible (XAF)" icon={<Target size={16} color={Colors.textMuted} />}>
            <TextInput style={styles.input} value={target} onChangeText={setTarget} placeholder="Ex: 500 000" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
          </Field>

          <Field label="Date limite (optionnel)" icon={<Calendar size={16} color={Colors.textMuted} />}>
            <TextInput style={styles.input} value={deadline} onChangeText={setDeadline} placeholder="AAAA-MM-JJ" placeholderTextColor={Colors.textMuted} />
          </Field>

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Créer l'objectif</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        {icon}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  form: { padding: Spacing.xl, gap: 16 },
  iconWrap: { alignItems: "center", marginVertical: Spacing.lg, width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryLight, justifyContent: "center", alignSelf: "center" },
  subtitle: { fontSize: 15, color: Colors.textMuted, textAlign: "center", marginBottom: Spacing.md },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 14 : 0, gap: 10 },
  input: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: Platform.OS === "web" ? 0 : 14, outlineStyle: "none" } as any,
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
