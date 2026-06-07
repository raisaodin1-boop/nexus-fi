// Tontines - Join (by invite code OR browse public tontines)
import { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Globe, Lock, Users } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing, Shadow } from "@/src/theme";

type TabKey = "code" | "public";

interface PublicTontine {
  id: string;
  name: string;
  description?: string;
  admin_id: string;
  contribution_amount: number;
  frequency: string;
  max_members: number;
  members_count: number;
  currency: string;
  is_active: boolean;
}

const FREQ_LABELS: Record<string, string> = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  biweekly: "Bimensuelle",
  monthly: "Mensuelle",
};

export default function TontineJoin() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("code");

  // --- Invite code tab ---
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // --- Public tontines tab ---
  const [publicList, setPublicList] = useState<PublicTontine[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPublic = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await api.get<PublicTontine[]>("/tontines/public");
      setPublicList(data);
    } catch {}
    setListLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    if (activeTab === "public") loadPublic();
  }, [activeTab, loadPublic]));

  const joinByCode = async () => {
    if (!code.trim()) return;
    setCodeError(null);
    setCodeLoading(true);
    try {
      const d = await api.post<{ tontine_id: string }>("/tontines/join", { code: code.trim().toUpperCase() });
      router.replace(`/tontines/${d.tontine_id}`);
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.detail : "Code invalide ou tontine introuvable.");
    } finally {
      setCodeLoading(false);
    }
  };

  const requestToJoin = async (t: PublicTontine) => {
    setBusyId(t.id);
    try {
      await api.post("/tontines/join", { tontine_id: t.id });
      setRequestedIds((prev) => new Set(prev).add(t.id));
    } catch (e) {
      // already requested or other error — show nothing, mark as requested
      setRequestedIds((prev) => new Set(prev).add(t.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Rejoindre une tontine</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "code" && styles.tabBtnActive]}
            onPress={() => setActiveTab("code")}
            testID="join-tab-code"
          >
            <Lock size={13} color={activeTab === "code" ? "#fff" : Colors.text} />
            <Text style={[styles.tabLabel, activeTab === "code" && styles.tabLabelActive]}>Par code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "public" && styles.tabBtnActive]}
            onPress={() => { setActiveTab("public"); loadPublic(); }}
            testID="join-tab-public"
          >
            <Globe size={13} color={activeTab === "public" ? "#fff" : Colors.text} />
            <Text style={[styles.tabLabel, activeTab === "public" && styles.tabLabelActive]}>Tontines publiques</Text>
          </TouchableOpacity>
        </View>

        {activeTab === "code" ? (
          <View style={{ padding: Spacing.xl }}>
            <Card style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>Code d'invitation</Text>
              <Text style={styles.hint}>Entrez le code fourni par le gérant de la tontine privée.</Text>
              <TextInput
                style={styles.codeInput}
                placeholder="Ex: BONABERI"
                placeholderTextColor={Colors.textSubtle}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                testID="tontine-join-code"
              />
              {codeError ? <Text style={styles.error}>{codeError}</Text> : null}
              <Button
                label="Rejoindre"
                onPress={joinByCode}
                loading={codeLoading}
                disabled={!code.trim()}
                testID="tontine-join-submit"
              />
            </Card>
          </View>
        ) : (
          <View style={{ padding: Spacing.xl, gap: 10 }}>
            <Text style={styles.sectionTitle}>Tontines ouvertes à tous</Text>
            <Text style={styles.hint}>
              Ces tontines sont publiques. Votre demande sera examinée par l'admin de la plateforme et le gérant avant validation.
            </Text>

            {listLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.secondary} />
              </View>
            ) : publicList.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Globe size={36} color={Colors.textSubtle} />
                <Text style={styles.emptyText}>Aucune tontine publique disponible pour le moment.</Text>
              </Card>
            ) : publicList.map((t) => {
              const spotsLeft = t.max_members - t.members_count;
              const requested = requestedIds.has(t.id);
              return (
                <Card key={t.id} style={styles.tontineCard}>
                  <View style={styles.tontineTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tonName}>{t.name}</Text>
                      {t.description ? <Text style={styles.tonDesc}>{t.description}</Text> : null}
                    </View>
                    <View style={styles.publicBadge}>
                      <Globe size={10} color={Colors.accent} />
                      <Text style={styles.publicBadgeText}>PUBLIC</Text>
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metric}>
                      <Text style={styles.metricVal}>{formatXAF(t.contribution_amount)}</Text>
                      <Text style={styles.metricLbl}>Mise / cycle</Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricVal}>{FREQ_LABELS[t.frequency] ?? t.frequency}</Text>
                      <Text style={styles.metricLbl}>Fréquence</Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={[styles.metricVal, spotsLeft <= 2 && { color: Colors.warning }]}>
                        {t.members_count}/{t.max_members}
                      </Text>
                      <Text style={styles.metricLbl}>Membres</Text>
                    </View>
                  </View>

                  {requested ? (
                    <View style={styles.requestedBanner}>
                      <Text style={styles.requestedText}>✓ Demande envoyée — en attente de validation</Text>
                    </View>
                  ) : spotsLeft <= 0 ? (
                    <View style={[styles.requestedBanner, { backgroundColor: Colors.danger + "15" }]}>
                      <Text style={[styles.requestedText, { color: Colors.danger }]}>Tontine complète</Text>
                    </View>
                  ) : (
                    <Button
                      label="Demander à rejoindre"
                      loading={busyId === t.id}
                      onPress={() => requestToJoin(t)}
                      testID={`join-public-${t.id}`}
                    />
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.xl, paddingBottom: 8 },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  title: { color: Colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.xl, marginBottom: 4 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { color: Colors.text, fontWeight: "700", fontSize: 13 },
  tabLabelActive: { color: "#fff" },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  hint: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  codeInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 14,
    fontSize: 20, fontWeight: "900", letterSpacing: 6, color: Colors.primary,
    borderWidth: 1, borderColor: Colors.border, textAlign: "center",
  },
  error: {
    backgroundColor: "#FEE2E2", color: Colors.danger,
    padding: 12, borderRadius: 10, fontSize: 13, fontWeight: "600",
  },
  center: { alignItems: "center", padding: 40 },
  emptyCard: { alignItems: "center", padding: 36, gap: 12 },
  emptyText: { color: Colors.textMuted, fontWeight: "600", textAlign: "center", lineHeight: 20 },
  tontineCard: { gap: 10 },
  tontineTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tonName: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  tonDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  publicBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.accent + "15", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99,
  },
  publicBadgeText: { color: Colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  metricsRow: { flexDirection: "row", gap: 4 },
  metric: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10, alignItems: "center" },
  metricVal: { color: Colors.text, fontWeight: "800", fontSize: 13 },
  metricLbl: { color: Colors.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  requestedBanner: {
    backgroundColor: Colors.accent + "15", borderRadius: Radius.md, padding: 12, alignItems: "center",
  },
  requestedText: { color: Colors.accent, fontWeight: "700", fontSize: 13 },
});
