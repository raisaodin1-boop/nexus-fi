import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Target, Lock, Repeat } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DatePicker } from "@/src/date-picker";

type SavingsType = "flexible" | "locked" | "recurring";

const TYPES: { key: SavingsType; label: string; desc: string; icon: any; color: string }[] = [
  { key: "flexible", label: "Flexible", desc: "Dépôts et retraits libres à tout moment.", icon: Target, color: Colors.accent },
  { key: "locked", label: "Verrouillé", desc: "Fonds bloqués jusqu'à la date cible.", icon: Lock, color: Colors.secondary },
  { key: "recurring", label: "Récurrent", desc: "Versements automatiques périodiques.", icon: Repeat, color: Colors.primary },
];

export default function SavingsCreate() {
  const router = useRouter();
  const { show } = useToast();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [type, setType] = useState<SavingsType>("flexible");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { show("Donnez un nom à votre objectif", "error"); return; }
    const amount = Number(targetAmount);
    if (!amount || amount <= 0) { show("Montant cible invalide", "error"); return; }
    setSaving(true);
    try {
      await api.post("/savings/goals", {
        name: name.trim(),
        target_amount: amount,
        savings_type: type,
        deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
        currency: "XAF",
      });
      show("Objectif créé avec succès !", "success");
      router.replace("/(tabs)/savings" as any);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur lors de la création", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={Colors.primary} size={22} />
        </TouchableOpacity>
        <Text style={styles.title}>Nouvel objectif</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          <Field
            label="Nom de l'objectif"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Voyage, Voiture, Urgences..."
            testID="savings-name"
          />

          <Field
            label="Montant cible (XAF)"
            value={targetAmount}
            onChangeText={setTargetAmount}
            placeholder="500 000"
            keyboardType="numeric"
            testID="savings-target"
          />

          <DatePicker
            label="Date limite (optionnel)"
            value={deadline}
            onChange={setDeadline}
            minimumDate={new Date()}
            testID="savings-deadline"
          />

          <Text style={styles.typeLabel}>Type d'épargne</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setType(t.key)}
                  style={[styles.typeCard, active && { borderColor: t.color, backgroundColor: `${t.color}15` }]}
                  activeOpacity={0.8}
                  testID={`savings-type-${t.key}`}
                >
                  <Icon color={active ? t.color : Colors.textMuted} size={22} />
                  <Text style={[styles.typeName, { color: active ? t.color : Colors.text }]}>{t.label}</Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            label="Créer l'objectif"
            onPress={handleCreate}
            loading={saving}
            testID="savings-submit"
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: 20, fontWeight: "900", color: Colors.primary, letterSpacing: -0.5 },
  form: { padding: Spacing.xl, gap: 16, paddingBottom: 40 },
  typeLabel: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: -8 },
  typeRow: { gap: 10 },
  typeCard: {
    padding: 16, borderRadius: Radius.lg, borderWidth: 2,
    borderColor: Colors.border, backgroundColor: Colors.surface, gap: 4,
  },
  typeName: { fontSize: 15, fontWeight: "800" },
  typeDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
});
