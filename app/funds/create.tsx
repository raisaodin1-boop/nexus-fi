import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Wallet, FileText, DollarSign } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function CreateFund() {
  const router = useRouter();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { show("Nom du fonds requis", "error"); return; }
    setLoading(true);
    try {
      await api.post("/community-funds", {
        name: name.trim(),
        description: description.trim(),
        target_amount: parseFloat(targetAmount.replace(/\s/g, "")) || undefined,
        currency: "XAF",
      });
      show("Fonds communautaire créé !", "success");
      router.replace("/(tabs)/groups");
    } catch (e: any) {
      show(e?.detail || "Erreur lors de la création", "error");
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color={Colors.text} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Fonds Communautaire</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}><Wallet size={36} color={Colors.primary} /></View>
          <Text style={styles.subtitle}>Créez un fonds pour votre communauté</Text>

          {[
            { label: "Nom du fonds", icon: <Wallet size={16} color={Colors.textMuted} />, value: name, set: setName, placeholder: "Ex: Fonds Urgence Famille" },
            { label: "Description", icon: <FileText size={16} color={Colors.textMuted} />, value: description, set: setDescription, placeholder: "Objectif du fonds..." },
            { label: "Objectif (XAF, optionnel)", icon: <DollarSign size={16} color={Colors.textMuted} />, value: targetAmount, set: setTargetAmount, placeholder: "Ex: 1 000 000", numeric: true },
          ].map(f => (
            <View key={f.label} style={styles.fieldGroup}>
              <Text style={styles.label}>{f.label}</Text>
              <View style={styles.inputRow}>
                {f.icon}
                <TextInput style={styles.input} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} keyboardType={f.numeric ? "numeric" : "default"} />
              </View>
            </View>
          ))}

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Créer le fonds</Text>}
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
  subtitle: { fontSize: 14, color: Colors.textMuted, textAlign: "center", marginBottom: 4 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 14 : 0, gap: 10 },
  input: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: Platform.OS === "web" ? 0 : 14, outlineStyle: "none" } as any,
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
