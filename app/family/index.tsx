import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Users, UserPlus, ChevronRight } from "lucide-react-native";
import { api, formatXAF } from "@/src/api";
import { Card, Button, EmptyState } from "@/src/ui";
import { Colors, Spacing } from "@/src/theme";

interface Member {
  id: string;
  name: string;
  is_me: boolean;
}

interface Goal {
  name: string;
  current_amount: number;
  target_amount: number;
  savings_type: string;
  owner_name: string;
}

interface FamilyOverview {
  members: Member[];
  combined_savings: number;
  goals: Goal[];
}

const REL_OPTIONS = [
  { value: "enfant", label: "Enfant" },
  { value: "conjoint", label: "Conjoint/e" },
  { value: "parent", label: "Parent" },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function GoalProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? Colors.success : pct >= 80 ? Colors.accent : Colors.secondary;
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}

function InviteForm({
  email,
  setEmail,
  rel,
  setRel,
  inviting,
  onInvite,
}: {
  email: string;
  setEmail: (v: string) => void;
  rel: string;
  setRel: (v: string) => void;
  inviting: boolean;
  onInvite: () => void;
}) {
  return (
    <Card style={styles.inviteCard}>
      <View style={styles.inviteHeader}>
        <UserPlus color={Colors.secondary} size={18} />
        <Text style={styles.inviteTitle}>Inviter un membre</Text>
      </View>
      <TextInput
        style={styles.emailInput}
        placeholder="Adresse email"
        placeholderTextColor={Colors.textSubtle}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View style={styles.relRow}>
        {REL_OPTIONS.map((opt) => {
          const selected = rel === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setRel(opt.value)}
              style={[
                styles.relChip,
                selected
                  ? { backgroundColor: Colors.secondary, borderColor: Colors.secondary }
                  : { backgroundColor: "transparent", borderColor: Colors.border },
              ]}
            >
              <Text
                style={[
                  styles.relChipText,
                  { color: selected ? "#fff" : Colors.textMuted },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Button
        label={inviting ? "Envoi…" : "Inviter"}
        onPress={onInvite}
        disabled={inviting || !email.trim()}
        loading={inviting}
      />
    </Card>
  );
}

export default function FamilyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FamilyOverview | null>(null);
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("enfant");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<FamilyOverview>("/family/overview");
      setData(res);
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await api.post("/family/link", { email: email.trim(), relationship: rel });
      Alert.alert("Invitation envoyée", "Votre invitation famille a été envoyée !");
      setEmail("");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Erreur");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.secondary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const members = data?.members ?? [];
  const goals = data?.goals ?? [];
  const combinedSavings = data?.combined_savings ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Compte Famille</Text>
            <Text style={styles.subtitle}>Vue consolidée</Text>
          </View>
          <View style={styles.headerIcon}>
            <Users color={Colors.secondary} size={24} />
          </View>
        </View>

        {/* Total card */}
        <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg }}>
          <Card dark style={styles.totalCard}>
            <Text style={styles.totalLabel}>Épargne combinée</Text>
            <Text style={styles.totalAmount}>{formatXAF(combinedSavings)}</Text>
            <Text style={styles.memberCount}>
              {members.length} membre{members.length !== 1 ? "s" : ""}
            </Text>
          </Card>
        </View>

        {members.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.xl }}>
            <EmptyState
              title="Aucun membre famille"
              description="Invitez vos proches pour suivre vos épargnes combinées et objectifs communs."
              icon={<Users color={Colors.secondary} size={32} />}
            />
            <InviteForm
              email={email}
              setEmail={setEmail}
              rel={rel}
              setRel={setRel}
              inviting={inviting}
              onInvite={invite}
            />
          </View>
        ) : (
          <>
            {/* Members section */}
            <View style={{ paddingHorizontal: Spacing.xl }}>
              <Text style={styles.sectionTitle}>Membres</Text>
              <Card>
                {members.map((m, i) => (
                  <View
                    key={m.id}
                    style={[
                      styles.memberRow,
                      i < members.length - 1 && styles.memberDivider,
                    ]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(m.name)}</Text>
                    </View>
                    <Text style={styles.memberName}>{m.name}</Text>
                    {m.is_me ? (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>Vous</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </Card>
            </View>

            {/* Invite form */}
            <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
              <InviteForm
                email={email}
                setEmail={setEmail}
                rel={rel}
                setRel={setRel}
                inviting={inviting}
                onInvite={invite}
              />
            </View>

            {/* Goals section */}
            {goals.length > 0 ? (
              <View style={{ paddingHorizontal: Spacing.xl, marginTop: Spacing.xl }}>
                <Text style={styles.sectionTitle}>Objectifs</Text>
                {goals.map((g, i) => {
                  const pct =
                    g.target_amount > 0
                      ? Math.round((g.current_amount / g.target_amount) * 100)
                      : 0;
                  return (
                    <Card key={i} style={{ marginBottom: 10 }}>
                      <View style={styles.goalHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.goalName}>{g.name}</Text>
                          <Text style={styles.goalOwner}>{g.owner_name}</Text>
                        </View>
                        <Text style={styles.goalPct}>{pct}%</Text>
                      </View>
                      <GoalProgressBar pct={pct} />
                      <View style={styles.goalAmounts}>
                        <Text style={styles.goalCurrent}>
                          {formatXAF(g.current_amount)}
                        </Text>
                        <Text style={styles.goalTarget}>
                          / {formatXAF(g.target_amount)}
                        </Text>
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 14, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  totalCard: {
    borderRadius: 20,
    padding: Spacing.xl,
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  totalLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  totalAmount: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  memberCount: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.3,
    marginBottom: Spacing.md,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  memberDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.secondary, fontWeight: "800", fontSize: 14 },
  memberName: { flex: 1, color: Colors.text, fontWeight: "700", fontSize: 15 },
  youBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  youBadgeText: { color: Colors.primary, fontWeight: "700", fontSize: 11 },
  inviteCard: { gap: 12 },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  inviteTitle: { color: Colors.text, fontWeight: "800", fontSize: 16 },
  emailInput: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  relRow: { flexDirection: "row", gap: 8 },
  relChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  relChipText: { fontSize: 13, fontWeight: "700" },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 999,
    overflow: "hidden",
    marginVertical: 8,
  },
  progressFill: { height: "100%", borderRadius: 999 },
  goalHeader: { flexDirection: "row", alignItems: "flex-start" },
  goalName: { color: Colors.text, fontWeight: "700", fontSize: 15 },
  goalOwner: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  goalPct: { color: Colors.textMuted, fontWeight: "700", fontSize: 13 },
  goalAmounts: { flexDirection: "row", alignItems: "center", gap: 4 },
  goalCurrent: { color: Colors.text, fontWeight: "700", fontSize: 14 },
  goalTarget: { color: Colors.textMuted, fontSize: 13 },
});
