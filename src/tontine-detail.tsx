// Tontine detail — cycle dashboard, rotation order, disbursement history.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft, ArrowDown, ArrowUp, Award, CheckCircle, ChevronRight,
  Copy, Crown, MessageSquare, RefreshCw, Shield, Shuffle, Smartphone, Trophy, Users as UsersIcon,
  Wallet, X,
} from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { openPaymentScreen } from "@/src/payment-nav";
import { supabase } from "@/src/supabase";
import { Button, Card, Field, SkeletonBox, SkeletonCard } from "@/src/ui";
import { DocumentButton } from "@/src/document-button";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

/* ─── Types ─────────────────────────────────────────── */

interface Member {
  id: string;
  user_id: string;
  full_name: string;
  role: "admin" | "member";
  rotation_position: number;
  has_received: boolean;
  status: "a_jour" | "en_retard" | "suspendu" | "exclu";
  cycles_paid: number;
  cycles_late?: number;
}

interface Contribution {
  id: string;
  user_id: string;
  full_name: string;
  amount: number;
  created_at: string;
  cycle: number | null;
}

interface Disbursement {
  id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  amount: number;
  cycle: number;
  disbursed_at: string;
  note?: string | null;
}

interface CycleInfo {
  current_cycle: number;
  total_cycles: number;
  current_beneficiary_id: string | null;
  current_beneficiary_name: string | null;
  next_beneficiary_name: string | null;
  rotation_mode: "rotation" | "random" | "custom";
  cycle_start_date: string | null;
  compliance_pct: number;
}

interface TontineData {
  tontine: {
    id: string;
    name: string;
    description?: string | null;
    invite_code: string;
    contribution_amount: number;
    frequency: string;
    currency: string;
    members_count: number;
    total_collected: number;
    current_cycle: number;
    total_cycles: number;
    rotation_mode: string;
    status: string;
  };
  is_admin: boolean;
  members: Member[];
  contributions: Contribution[];
  disbursements?: Disbursement[];
  cycle?: CycleInfo;
  compliance_pct?: number;
}

/* ─── Helpers ────────────────────────────────────────── */

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function statusColor(s: string) {
  if (s === "suspendu") return Colors.danger;
  if (s === "en_retard") return Colors.warning;
  return Colors.accent;
}
function statusLabel(s: string) {
  if (s === "suspendu") return "Suspendu";
  if (s === "en_retard") return "En retard";
  return "À jour";
}

/* ─── Sub-components ─────────────────────────────────── */

function CycleBanner({ cycle, tontine, isAdmin, onAdvance, busy }: {
  cycle: CycleInfo | undefined;
  tontine: TontineData["tontine"];
  isAdmin: boolean;
  onAdvance: () => void;
  busy: boolean;
}) {
  const cur = cycle?.current_cycle ?? tontine.current_cycle ?? 1;
  const tot = cycle?.total_cycles ?? tontine.total_cycles ?? tontine.members_count ?? 1;
  const beneficiary = cycle?.current_beneficiary_name ?? "—";
  const next = cycle?.next_beneficiary_name;
  const pct = Math.round((cur / tot) * 100);

  return (
    <LinearGradient
      colors={[Colors.primary, Colors.gradMid, Colors.secondary]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.cycleBanner, Shadow.cardDark]}
    >
      {/* Cycle counter */}
      <View style={styles.cycleHeader}>
        <View style={styles.cycleCounterBox}>
          <Text style={styles.cycleLabel}>CYCLE EN COURS</Text>
          <Text style={styles.cycleCounter}>{cur}<Text style={styles.cycleTotal}>/{tot}</Text></Text>
        </View>
        <View style={styles.complianceBox}>
          <Text style={styles.complianceLabel}>Conformité</Text>
          <Text style={styles.complianceValue}>{cycle?.compliance_pct ?? 0}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.cycleProgressBg}>
        <View style={[styles.cycleProgressFill, { width: `${pct}%` }]} />
      </View>

      {/* Beneficiary */}
      <View style={styles.beneficiaryRow}>
        <Award color={Colors.accent} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={styles.beneficiaryLabel}>
            {beneficiary !== "—" ? "Bénéficiaire ce cycle" : "Aucun bénéficiaire assigné"}
          </Text>
          <Text style={styles.beneficiaryName}>{beneficiary}</Text>
        </View>
        {next && (
          <View style={styles.nextBox}>
            <Text style={styles.nextLabel}>Prochain</Text>
            <Text style={styles.nextName}>{next}</Text>
          </View>
        )}
      </View>

      {isAdmin && (
        <TouchableOpacity
          onPress={onAdvance}
          disabled={busy}
          style={styles.advanceBtn}
          activeOpacity={0.85}
        >
          {busy
            ? <ActivityIndicator color={Colors.primary} size="small" />
            : <><RefreshCw color={Colors.primary} size={14} /><Text style={styles.advanceBtnText}>Passer au cycle suivant</Text></>}
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

function RotationSection({ members, isAdmin, tontineId, onReload, rotationMode }: {
  members: Member[];
  isAdmin: boolean;
  tontineId: string;
  onReload: () => void;
  rotationMode: string;
}) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<Member[]>([...members].sort((a, b) => a.rotation_position - b.rotation_position));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...order];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setOrder(next);
  };
  const moveDown = (i: number) => {
    if (i === order.length - 1) return;
    const next = [...order];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setOrder(next);
  };

  const saveRotation = async () => {
    setSaving(true); setError(null);
    try {
      await api.patch(`/tontines/${tontineId}/rotation`, {
        order: order.map((m, i) => ({ member_id: m.id, position: i + 1 })),
      });
      setEditing(false);
      onReload();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setSaving(false); }
  };

  const shuffleOrder = () => {
    const shuffled = [...order].sort(() => Math.random() - 0.5);
    setOrder(shuffled);
  };

  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ordre de rotation</Text>
        {isAdmin && !editing && (
          <TouchableOpacity onPress={() => { setOrder([...members].sort((a, b) => a.rotation_position - b.rotation_position)); setEditing(true); }} style={styles.editBtn}>
            <Text style={styles.editBtnText}>Modifier</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing && (
        <View style={styles.rotationToolbar}>
          <TouchableOpacity onPress={shuffleOrder} style={styles.toolbarBtn}>
            <Shuffle color={Colors.secondary} size={14} />
            <Text style={styles.toolbarBtnText}>Mélanger</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setEditing(false)} style={[styles.toolbarBtn, { borderColor: Colors.border }]}>
            <X color={Colors.textMuted} size={14} />
          </TouchableOpacity>
          <TouchableOpacity onPress={saveRotation} disabled={saving} style={[styles.toolbarBtn, { backgroundColor: Colors.secondary, borderColor: Colors.secondary }]}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.toolbarBtnText, { color: "#fff" }]}>Sauvegarder</Text>}
          </TouchableOpacity>
        </View>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={{ gap: 8 }}>
        {(editing ? order : [...members].sort((a, b) => a.rotation_position - b.rotation_position)).map((m, i) => {
          const received = m.has_received;
          return (
            <Card key={m.id} style={[styles.rotRow, received && styles.rotRowReceived]}>
              <View style={[styles.rotBadge, { backgroundColor: received ? Colors.accent : Colors.primary }]}>
                <Text style={styles.rotBadgeText}>{i + 1}</Text>
              </View>
              <View style={styles.rotAvatar}>
                <Text style={styles.rotAvatarLetter}>{m.full_name?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rotName}>{m.full_name}</Text>
                <Text style={styles.rotStatus}>
                  {received ? "✓ A déjà reçu" : `Cycle ${m.rotation_position}`}
                  {m.role === "admin" ? " · Admin" : ""}
                </Text>
              </View>
              {editing && (
                <View style={styles.rotControls}>
                  <TouchableOpacity onPress={() => moveUp(i)} disabled={i === 0} style={[styles.rotArrow, i === 0 && { opacity: 0.3 }]}>
                    <ArrowUp color={Colors.primary} size={14} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveDown(i)} disabled={i === order.length - 1} style={[styles.rotArrow, i === order.length - 1 && { opacity: 0.3 }]}>
                    <ArrowDown color={Colors.primary} size={14} />
                  </TouchableOpacity>
                </View>
              )}
              {!editing && received && <CheckCircle color={Colors.accent} size={16} />}
            </Card>
          );
        })}
      </View>
    </View>
  );
}

function DisbursementModal({ visible, tontineId, members, currentCycle, currency, onClose, onSuccess }: {
  visible: boolean;
  tontineId: string;
  members: Member[];
  currentCycle: number;
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!beneficiaryId) { setError("Sélectionnez un bénéficiaire"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setError(null); setBusy(true);
    try {
      await api.post(`/tontines/${tontineId}/disbursements`, {
        beneficiary_id: beneficiaryId,
        amount: amt,
        cycle: currentCycle,
        note: note || null,
      });
      setBeneficiaryId(""); setAmount(""); setNote("");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enregistrer une remise</Text>
              <TouchableOpacity onPress={onClose}><X color={Colors.textMuted} size={22} /></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>Cycle {currentCycle}</Text>

              <Text style={styles.fieldLabel}>Bénéficiaire</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 2 }}>
                  {members.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setBeneficiaryId(m.user_id)}
                      style={[styles.memberChip, beneficiaryId === m.user_id && styles.memberChipActive]}
                    >
                      <Text style={[styles.memberChipText, beneficiaryId === m.user_id && { color: "#fff" }]}>
                        {m.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Field label="Montant remis" value={amount} onChangeText={setAmount} placeholder="50 000" keyboardType="numeric" testID="disb-amount" />
              <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Ex : remis en espèces le 01/06" testID="disb-note" />

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Button label="Confirmer la remise" onPress={submit} loading={busy} testID="disb-submit" />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DisbursementHistory({ disbursements, currency }: { disbursements: Disbursement[]; currency: string }) {
  if (disbursements.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Wallet color={Colors.textMuted} size={32} />
        <Text style={styles.emptyText}>Aucune remise enregistrée</Text>
        <Text style={styles.emptySubtext}>Les remises approuvées par l'admin apparaîtront ici.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {disbursements.map((d) => (
        <Card key={d.id} style={styles.disbRow}>
          <View style={[styles.disbCycleBadge]}>
            <Text style={styles.disbCycleText}>C{d.cycle}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.disbName}>{d.beneficiary_name}</Text>
            <Text style={styles.disbDate}>{formatDate(d.disbursed_at)}</Text>
            {d.note ? <Text style={styles.disbNote}>{d.note}</Text> : null}
          </View>
          <Text style={styles.disbAmount}>{formatXAF(d.amount, currency)}</Text>
        </Card>
      ))}
    </View>
  );
}

/* ─── Main view ──────────────────────────────────────── */

export function TontineDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<TontineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [showDisbModal, setShowDisbModal] = useState(false);
  const [advanceBusy, setAdvanceBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"cycle" | "rotation" | "history" | "members" | "contributions">("cycle");

  const load = useCallback(async () => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch { return null; }
    };
    const [d, disbs] = await Promise.all([
      safe(() => api.get<TontineData>(`/tontines/${id}`)),
      safe(() => api.get<Disbursement[]>(`/tontines/${id}/disbursements`)),
    ]);
    if (d) setData(d);
    if (disbs) setDisbursements(disbs);
    setLoading(false);
  }, [id]);

  // Real-time: subscribe only while screen is focused
  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`rt-tontine-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tontine_contributions", filter: `tontine_id=eq.${id}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tontine_members", filter: `tontine_id=eq.${id}` }, () => { load(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tontines", filter: `id=eq.${id}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]));

  const advanceCycle = async () => {
    setAdvanceBusy(true);
    try {
      await api.post(`/tontines/${id}/advance`);
      await load();
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.detail : "Impossible d'avancer le cycle");
    } finally { setAdvanceBusy(false); }
  };

  const openPayment = () => {
    if (!data) return;
    const amount = data.tontine.contribution_amount;
    if (!amount || amount <= 0) {
      Alert.alert("Montant invalide", "Le montant de cotisation n'est pas configuré pour cette tontine.");
      return;
    }
    openPaymentScreen(router, {
      kind: "tontine_contribution",
      tontine_id: id,
      amount,
      label: data.tontine.name,
    });
  };

  const shareWhatsApp = async () => {
    if (!data) return;
    const t = data.tontine;
    const msg = `🏦 Rejoignez la tontine *"${t.name}"* sur Hodix !\n\n📌 Code : *${t.invite_code}*\n\nhttps://hodix.app`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message: msg });
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color={Colors.primary} size={22} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 12, paddingBottom: 100 }}>
          <SkeletonBox height={200} borderRadius={20} />
          <SkeletonCard /><SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { tontine, is_admin, members, contributions, cycle } = data;
  const currentCycle = tontine.current_cycle ?? 1;
  const hasPaidCurrentCycle = !!user?.id && contributions.some(
    (c) => c.user_id === user.id && c.cycle === currentCycle,
  );
  const canContribute = !!tontine.contribution_amount && tontine.contribution_amount > 0;

  const ContributePanel = () => (
    <View style={{ marginTop: 16, gap: 10 }}>
      <Text style={styles.sectionTitle}>
        {hasPaidCurrentCycle ? "Cotisation du cycle" : "Payer ma cotisation"}
      </Text>
      {hasPaidCurrentCycle ? (
        <Card style={{ padding: 14, gap: 6, borderColor: Colors.accent, borderWidth: 1 }}>
          <Text style={{ color: Colors.accent, fontWeight: "800" }}>✓ Cotisation enregistrée pour le cycle {currentCycle}</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
            Montant : {formatXAF(tontine.contribution_amount, tontine.currency)}
          </Text>
        </Card>
      ) : canContribute ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
            Montant du cycle : {formatXAF(tontine.contribution_amount, tontine.currency)}
          </Text>
          <Button
            label={`Cotiser — ${formatXAF(tontine.contribution_amount, tontine.currency)}`}
            onPress={openPayment}
            icon={<Smartphone color="#fff" size={16} />}
            testID="tontine-pay"
          />
          <Text style={{ color: Colors.textSubtle, fontSize: 11, textAlign: "center" }}>
            Paiement électronique CinetPay uniquement — crédit après confirmation du débit
          </Text>
        </Card>
      ) : (
        <Card><Text style={styles.emptyText}>Montant de cotisation non configuré.</Text></Card>
      )}
    </View>
  );

  const TABS = [
    { key: "cycle" as const, label: "Cycle" },
    { key: "rotation" as const, label: "Rotation" },
    { key: "history" as const, label: "Remises" },
    { key: "members" as const, label: "Membres" },
    { key: "contributions" as const, label: "Cotisations" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={Colors.primary} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tontine.name}</Text>
          <Text style={styles.headerSub}>{tontine.members_count} membres · {tontine.frequency}</Text>
        </View>
        <TouchableOpacity onPress={shareWhatsApp} style={styles.waBtn}>
          <MessageSquare color="#fff" size={16} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── TAB: CYCLE ── */}
        {activeTab === "cycle" && (
          <>
            <CycleBanner
              cycle={cycle}
              tontine={tontine}
              isAdmin={is_admin}
              onAdvance={advanceCycle}
              busy={advanceBusy}
            />

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatXAF(tontine.total_collected, tontine.currency)}</Text>
                <Text style={styles.statLabel}>Total collecté</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatXAF(tontine.contribution_amount, tontine.currency)}</Text>
                <Text style={styles.statLabel}>Contribution</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{tontine.status}</Text>
                <Text style={styles.statLabel}>Statut</Text>
              </View>
            </View>

            {/* Share code */}
            <TouchableOpacity onPress={shareWhatsApp} style={styles.codeRow}>
              <Copy color={Colors.secondary} size={14} />
              <Text style={styles.codeText}>{tontine.invite_code}</Text>
              <Text style={styles.codeCta}>Partager</Text>
            </TouchableOpacity>

            <ContributePanel />

            {/* PDF certificate */}
            <View style={{ marginTop: 16 }}>
              <DocumentButton kind="tontine_certificate" refId={id} compact />
            </View>

            {/* Leaderboard CTA */}
            <TouchableOpacity onPress={() => router.push(`/tontines/leaderboard?id=${id}`)} style={[styles.disbBtn, Shadow.card]} testID="tontine-leaderboard-btn">
              <LinearGradient colors={[Colors.secondary, Colors.gradEnd]} style={styles.disbBtnGrad}>
                <Trophy color="#fff" size={18} />
                <Text style={styles.disbBtnText}>Classement</Text>
                <ChevronRight color="#fff" size={16} />
              </LinearGradient>
            </TouchableOpacity>

            {/* Security CTA */}
            <TouchableOpacity
              onPress={() => router.push(`/tontines/security?id=${id}` as any)}
              style={{ marginBottom: 12 }}
              activeOpacity={0.85}
              testID="tontine-security-btn"
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
                backgroundColor: "#FEF3C7", borderRadius: 14, borderWidth: 1, borderColor: "#F59E0B44" }}>
                <Shield size={20} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#92400E", fontWeight: "800", fontSize: 13 }}>Sécurité & Garanties</Text>
                  <Text style={{ color: "#B45309", fontSize: 11, marginTop: 1 }}>Escrow · Fonds de réserve · Votes d'exclusion</Text>
                </View>
                <Text style={{ color: "#F59E0B", fontSize: 20, fontWeight: "300" }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Admin: Record disbursement */}
            {is_admin && (
              <TouchableOpacity onPress={() => setShowDisbModal(true)} style={[styles.disbBtn, Shadow.card]}>
                <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.disbBtnGrad}>
                  <Wallet color="#fff" size={18} />
                  <Text style={styles.disbBtnText}>Enregistrer une remise</Text>
                  <ChevronRight color="#fff" size={16} />
                </LinearGradient>
              </TouchableOpacity>
            )}

          </>
        )}

        {/* ── TAB: ROTATION ── */}
        {activeTab === "rotation" && (
          <RotationSection
            members={members}
            isAdmin={is_admin}
            tontineId={id}
            onReload={load}
            rotationMode={tontine.rotation_mode}
          />
        )}

        {/* ── TAB: REMISES (DISBURSEMENT HISTORY) ── */}
        {activeTab === "history" && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Historique des remises</Text>
              {is_admin && (
                <TouchableOpacity onPress={() => setShowDisbModal(true)} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>+ Nouvelle</Text>
                </TouchableOpacity>
              )}
            </View>
            <DisbursementHistory disbursements={disbursements} currency={tontine.currency} />
          </View>
        )}

        {/* ── TAB: MEMBERS ── */}
        {activeTab === "members" && (
          <View style={{ gap: 8 }}>
            {members.map((m) => (
              <Card key={m.id} style={styles.memberRow}>
                <View style={styles.rotAvatar}>
                  <Text style={styles.rotAvatarLetter}>{m.full_name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {m.role === "admin" ? <Crown color={Colors.accent} size={12} /> : <UsersIcon color={Colors.textSubtle} size={12} />}
                    <Text style={styles.rotName}>{m.full_name}</Text>
                    {m.status === "exclu" && (
                      <View style={{ backgroundColor: "#FEE2E2", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#EF4444", fontSize: 10, fontWeight: "700" }}>⛔ Exclu</Text>
                      </View>
                    )}
                    {(m.status === "en_retard" || (m.cycles_late ?? 0) > 0) && m.status !== "exclu" && (
                      <View style={{ backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#D97706", fontSize: 10, fontWeight: "700" }}>⚠️ En retard</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rotStatus}>
                    Pos. #{m.rotation_position} · {m.cycles_paid ?? 0} cycle(s) payé(s)
                    {m.has_received ? " · ✓ A reçu" : ""}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor(m.status)}20`, borderColor: statusColor(m.status) }]}>
                  <Text style={[styles.statusText, { color: statusColor(m.status) }]}>{statusLabel(m.status)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* ── TAB: CONTRIBUTIONS ── */}
        {activeTab === "contributions" && (
          <View style={{ gap: 8 }}>
            <ContributePanel />
            {contributions.length === 0
              ? <Card><Text style={styles.emptyText}>Aucune cotisation enregistrée.</Text></Card>
              : contributions.map((c) => (
                  <Card key={c.id} style={styles.contribRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.disbName}>{c.full_name}</Text>
                      <Text style={styles.disbDate}>
                        {formatDate(c.created_at)}{c.cycle ? ` · Cycle ${c.cycle}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.disbAmount}>+{formatXAF(c.amount, tontine.currency)}</Text>
                  </Card>
                ))}
          </View>
        )}
      </ScrollView>

      {/* Disbursement modal */}
      <DisbursementModal
        visible={showDisbModal}
        tontineId={id}
        members={members}
        currentCycle={tontine.current_cycle ?? 1}
        currency={tontine.currency}
        onClose={() => setShowDisbModal(false)}
        onSuccess={load}
      />
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: Colors.primary, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  headerSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 1 },
  waBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },

  // Tabs
  tabsRow: { paddingHorizontal: Spacing.xl, paddingVertical: 10, gap: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },

  // Cycle banner
  cycleBanner: { borderRadius: 22, padding: 22, overflow: "hidden" },
  cycleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  cycleCounterBox: {},
  cycleLabel: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  cycleCounter: { color: "#fff", fontSize: 48, fontWeight: "900", lineHeight: 52, letterSpacing: -2 },
  cycleTotal: { fontSize: 22, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
  complianceBox: { alignItems: "flex-end" },
  complianceLabel: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  complianceValue: { color: Colors.accent, fontSize: 28, fontWeight: "900" },
  cycleProgressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden", marginBottom: 18 },
  cycleProgressFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },
  beneficiaryRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.1)", padding: 14, borderRadius: 14, marginBottom: 14 },
  beneficiaryLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700" },
  beneficiaryName: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 2 },
  nextBox: { alignItems: "flex-end" },
  nextLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700" },
  nextName: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700", marginTop: 2 },
  advanceBtn: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  advanceBtnText: { color: Colors.primary, fontWeight: "900", fontSize: 13 },

  // Stats
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  statValue: { color: Colors.primary, fontSize: 13, fontWeight: "900", textAlign: "center" },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },

  // Code row
  codeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  codeText: { flex: 1, color: Colors.primary, fontWeight: "800", letterSpacing: 2, fontSize: 15 },
  codeCta: { color: Colors.secondary, fontWeight: "700", fontSize: 12 },

  // Disbursement button
  disbBtn: { marginTop: 16, borderRadius: Radius.xl, overflow: "hidden" },
  disbBtnGrad: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, justifyContent: "center" },
  disbBtnText: { color: "#fff", fontWeight: "900", fontSize: 15, flex: 1 },

  // Section
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: Colors.primary, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  editBtnText: { color: Colors.secondary, fontSize: 12, fontWeight: "700" },

  // Rotation toolbar
  rotationToolbar: { flexDirection: "row", gap: 8, marginBottom: 12, alignItems: "center" },
  toolbarBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.secondary },
  toolbarBtnText: { color: Colors.secondary, fontSize: 12, fontWeight: "700" },

  // Rotation row
  rotRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  rotRowReceived: { borderColor: Colors.accent, borderWidth: 1 },
  rotBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rotBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  rotAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rotAvatarLetter: { color: Colors.primary, fontWeight: "900", fontSize: 13 },
  rotName: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  rotStatus: { color: Colors.textMuted, fontSize: 11, fontWeight: "500", marginTop: 1 },
  rotControls: { flexDirection: "row", gap: 4 },
  rotArrow: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },

  // Member row
  memberRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },

  // Contribution row
  contribRow: { flexDirection: "row", alignItems: "center", padding: 12 },

  // Disbursement history
  disbRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  disbCycleBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  disbCycleText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  disbName: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  disbDate: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  disbNote: { color: Colors.textMuted, fontSize: 11, fontStyle: "italic", marginTop: 2 },
  disbAmount: { color: Colors.accent, fontWeight: "900", fontSize: 16 },

  // Misc
  fieldLabel: { color: Colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  errorText: { color: Colors.danger, fontSize: 13, fontWeight: "600", backgroundColor: `${Colors.danger}15`, padding: 10, borderRadius: 10, marginBottom: 10 },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
  emptySubtext: { color: Colors.textSubtle, fontSize: 12, textAlign: "center" },

  // Member chip
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  memberChipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  memberChipText: { fontSize: 13, fontWeight: "700", color: Colors.text },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, paddingBottom: 40, maxHeight: "85%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { color: Colors.primary, fontSize: 18, fontWeight: "900" },
  modalSubtitle: { color: Colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 18 },
});
