import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { ChevronLeft, Clock, Globe, Shield, Star, Users } from "lucide-react-native";
import { VerifiedBadge } from "@/src/fraud-badge";

import { api, formatXAF, ApiError } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";

/* ── Types ─────────────────────────────────────────────────── */

interface Member {
  role: string;
  joined_at: string;
  full_name: string;
  country: string | null;
}

interface MonthlyEntry {
  label: string;
  total: number;
}

interface ProfileData {
  tontine: {
    id: string;
    name: string;
    description?: string | null;
    amount_per_cycle: number;
    frequency: string;
    max_members: number;
    language?: string | null;
    country?: string | null;
    creator_id?: string | null;
    is_hodix_verified?: boolean;
  };
  members: Member[];
  members_count?: number;
  compliance_rate: number | null;
  reliability_score: number;
  monthly_history: MonthlyEntry[];
  contribution_count: number;
  total_collected: number;
  creator_reputation?: {
    avg_rating: number | null;
    rating_count: number;
  } | null;
}

/* ── Constants ─────────────────────────────────────────────── */

const FREQ: Record<string, string> = {
  weekly: "Hebdomadaire",
  biweekly: "Bimensuel",
  monthly: "Mensuel",
};

const FLAGS: Record<string, string> = {
  CM: "🇨🇲", SN: "🇸🇳", CI: "🇨🇮", BF: "🇧🇫", ML: "🇲🇱",
  TG: "🇹🇬", BJ: "🇧🇯", GA: "🇬🇦", FR: "🇫🇷", BE: "🇧🇪",
};

const flagFor = (c: string | null | undefined) =>
  c && FLAGS[c] ? FLAGS[c] : "🌍";

const reliabilityColor = (s: number) =>
  s >= 80 ? "#10B981" : s >= 60 ? "#F59E0B" : "#EF4444";

/* ── Bar chart ─────────────────────────────────────────────── */

function MonthlyBarChart({ monthly }: { monthly: MonthlyEntry[] }) {
  const maxVal = Math.max(...monthly.map((m) => m.total), 1);
  const W = 280;
  const H = 120;
  const BAR_W = 28;
  const GAP = (W - monthly.length * BAR_W) / (monthly.length + 1);
  return (
    <Svg width={W} height={H + 20}>
      {monthly.map((m, i) => {
        const barH = Math.max(4, (m.total / maxVal) * H);
        const x = GAP + i * (BAR_W + GAP);
        return (
          <React.Fragment key={i}>
            <Rect
              x={x}
              y={H - barH}
              width={BAR_W}
              height={barH}
              rx={4}
              fill={Colors.secondary + "CC"}
            />
            <SvgText
              x={x + BAR_W / 2}
              y={H + 14}
              fontSize={9}
              fill={Colors.textMuted}
              textAnchor="middle"
            >
              {m.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/* ── Mask name helper ──────────────────────────────────────── */

function maskName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) {
    return parts[0].length > 1 ? parts[0][0] + "." : parts[0];
  }
  return parts[0] + " " + parts[1][0] + ".";
}

/* ── Screen ────────────────────────────────────────────────── */

export default function TontineProfile() {
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { show } = useToast();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get<ProfileData>(`/tontines/${id}/profile`);
      setData(res);
    } catch (e: any) {
      const detail = e instanceof ApiError ? e.detail : (e?.detail ?? "Impossible de charger ce profil.");
      show(detail, "error");
      Alert.alert("Erreur", detail);
    }
    setLoading(false);
  }, [id, show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleJoin = async () => {
    if (!id) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      await api.post("/tontines/request-join", { tontine_id: id });
      const ok = "Demande envoyée — l'administrateur a été notifié.";
      setJoinMsg(ok);
      show(ok, "success");
      Alert.alert("Demande envoyée", "Votre demande d'adhésion a été transmise à l'administrateur.");
    } catch (e: any) {
      const detail = e instanceof ApiError ? e.detail : (e?.detail ?? "Impossible d'envoyer la demande.");
      setJoinMsg(detail);
      show(detail, "error");
      Alert.alert("Erreur", detail);
      if (/déjà membre/i.test(detail) && id) {
        router.replace(`/tontines/${id}` as any);
      }
    }
    setJoining(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color={Colors.text} size={24} />
          </TouchableOpacity>
        </View>
        <ActivityIndicator color={Colors.secondary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color={Colors.text} size={24} />
          </TouchableOpacity>
        </View>
        <Text style={styles.errorText}>Tontine introuvable ou privée.</Text>
      </SafeAreaView>
    );
  }

  const { tontine, members, members_count, compliance_rate, reliability_score, monthly_history, total_collected, creator_reputation } = data;
  const rColor = reliabilityColor(reliability_score);
  const shownMembers = members_count ?? members.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Back header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tontine.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>{tontine.name}</Text>
              {tontine.is_hodix_verified ? (
                <View style={{ marginTop: 6, marginBottom: 4 }}>
                  <VerifiedBadge size="sm" label="HODIX vérifiée" />
                </View>
              ) : null}
              {tontine.description ? (
                <Text style={styles.heroDesc}>{tontine.description}</Text>
              ) : null}
              <View style={styles.heroTags}>
                <View style={styles.freqBadge}>
                  <Clock size={11} color={Colors.secondary} />
                  <Text style={styles.freqText}>{FREQ[tontine.frequency] ?? tontine.frequency}</Text>
                </View>
                {tontine.country ? (
                  <View style={styles.countryBadge}>
                    <Text style={styles.countryText}>{flagFor(tontine.country)} {tontine.country}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {/* Reliability ring */}
            <View style={[styles.ringWrap, { borderColor: rColor }]}>
              <Star size={14} color={rColor} />
              <Text style={[styles.ringScore, { color: rColor }]}>{reliability_score}</Text>
              <Text style={styles.ringLabel}>fiabilité</Text>
            </View>
          </View>

          {/* Creator rating */}
          {creator_reputation?.avg_rating != null && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Text style={{ fontSize: 15, color: Colors.warning, letterSpacing: 1 }}>
                {"★".repeat(Math.round(creator_reputation.avg_rating))}{"☆".repeat(5 - Math.round(creator_reputation.avg_rating))}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, fontWeight: "600" }}>
                {creator_reputation.avg_rating.toFixed(1)} ({creator_reputation.rating_count} avis créateur)
              </Text>
            </View>
          )}

          {/* Compliance */}
          {compliance_rate !== null && (
            <View style={styles.complianceWrap}>
              <View style={styles.complianceHeader}>
                <Shield size={12} color={Colors.textMuted} />
                <Text style={styles.complianceLabel}>Conformité: {compliance_rate}%</Text>
              </View>
              <View style={styles.compBar}>
                <View
                  style={[
                    styles.compFill,
                    { width: `${compliance_rate}%` as any, backgroundColor: reliabilityColor(compliance_rate) },
                  ]}
                />
              </View>
            </View>
          )}
        </Card>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, Shadow.card]}>
            <Users size={16} color={Colors.secondary} />
            <Text style={styles.statVal}>{shownMembers}</Text>
            <Text style={styles.statLbl}>Membres</Text>
          </View>
          <View style={[styles.statBox, Shadow.card]}>
            <Text style={styles.statVal}>{formatXAF(tontine.amount_per_cycle)}</Text>
            <Text style={styles.statLbl}>/ cycle</Text>
          </View>
          <View style={[styles.statBox, Shadow.card]}>
            <Globe size={16} color={Colors.primary} />
            <Text style={styles.statVal}>{formatXAF(total_collected)}</Text>
            <Text style={styles.statLbl}>Collecté</Text>
          </View>
        </View>

        {/* Monthly chart */}
        {monthly_history.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Activité mensuelle</Text>
            <View style={{ alignItems: "center", marginTop: Spacing.md }}>
              <MonthlyBarChart monthly={monthly_history} />
            </View>
          </Card>
        )}

        {/* Members list */}
        <Card style={styles.membersCard}>
          <Text style={styles.sectionTitle}>Membres ({members.length})</Text>
          <View style={styles.membersList}>
            {members.slice(0, 10).map((m, i) => (
              <View key={i} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>
                    {maskName(m.full_name)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{maskName(m.full_name)}</Text>
                  <Text style={styles.memberRole}>{m.role === "admin" ? "Admin" : "Membre"}</Text>
                </View>
                {m.country ? (
                  <Text style={styles.memberFlag}>{flagFor(m.country)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        {/* CTA */}
        <View style={styles.ctaWrap}>
          <Button
            label="Demander à rejoindre"
            loading={joining}
            onPress={handleJoin}
          />
          {joinMsg ? (
            <Text style={{ marginTop: 10, textAlign: "center", color: Colors.textMuted, fontSize: 13 }}>
              {joinMsg}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: Colors.text },
  scroll: { paddingHorizontal: Spacing.xl, gap: 16, paddingTop: 4 },
  errorText: { textAlign: "center", color: Colors.textMuted, marginTop: 60, fontSize: 15 },

  heroCard: { gap: 12, padding: Spacing.xl },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  heroName: { fontSize: 20, fontWeight: "800", color: Colors.text, letterSpacing: -0.4 },
  heroDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
  heroTags: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  freqBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  freqText: { fontSize: 11, fontWeight: "600", color: Colors.secondary },
  countryBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  countryText: { fontSize: 11, fontWeight: "600", color: Colors.primaryDark },
  ringWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    gap: 2,
  },
  ringScore: { fontSize: 18, fontWeight: "800" },
  ringLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: "600" },

  complianceWrap: { gap: 6 },
  complianceHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  complianceLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  compBar: {
    height: 6,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  compFill: { height: "100%", borderRadius: Radius.full },

  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statVal: { fontSize: 13, fontWeight: "700", color: Colors.text, textAlign: "center" },
  statLbl: { fontSize: 10, color: Colors.textMuted, textAlign: "center" },

  chartCard: { padding: Spacing.xl, gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },

  membersCard: { padding: Spacing.xl },
  membersList: { marginTop: Spacing.md, gap: 10 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitial: { fontSize: 14, fontWeight: "700", color: Colors.secondary },
  memberName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  memberRole: { fontSize: 11, color: Colors.textMuted },
  memberFlag: { fontSize: 18 },

  ctaWrap: { paddingTop: 4 },
});
