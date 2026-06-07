// Community fund - create
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field } from "@/src/ui";
import { api, ApiError } from "@/src/api";
import { Colors, Spacing } from "@/src/theme";

export default function FundCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setError("Nom requis"); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.post<any>("/funds", {
        name: name.trim(),
        description: desc.trim() || null,
        target_amount: target ? parseFloat(target) : null,
        currency: "XAF",
      });
      router.replace(`/funds/${r.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <TouchableOpacity onPress={() => router.back()} testID="fund-create-back"><Text style={styles.back}>← Retour</Text></TouchableOpacity>
          <Text style={styles.h1}>Nouveau fonds communautaire</Text>
          <Text style={styles.sub}>Collecter et suivre les contributions d'un projet partagé.</Text>
          <Field testID="fund-name" label="Nom du fonds" placeholder="Fonds d'urgence boutique" value={name} onChangeText={setName} />
          <Field testID="fund-desc" label="Description (optionnel)" value={desc} onChangeText={setDesc} multiline />
          <Field testID="fund-target" label="Objectif (XAF) — optionnel" value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="200000" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button testID="fund-submit" label="Créer le fonds" onPress={submit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  h1: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: Colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
});
