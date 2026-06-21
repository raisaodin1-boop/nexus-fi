import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import {
  Shield,
  Clock,
  AlertTriangle,
  Users,
  Star,
  TrendingDown,
  CheckCircle,
  XCircle,
  Handshake,
} from "lucide-react-native";
import { api, formatXAF } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Card, Button } from "@/src/ui";
import { VerifiedName } from "@/src/verified-name";
import { Colors, Spacing } from "@/src/theme";

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

interface TontineMemberOption {
  user_id: string;
  full_name: string;
  kyc_verified?: boolean;
}

/* ── Types ─────────────────────────────────────────────────── */

interface EscrowData {
  status: "held" | "released" | "disputed";
  amount: number;
  hours_until_release?: number | null;
  released_at?: string | null;
  dispute_count: number;
  currency?: string;
}

interface ReserveData {
  balance: number;
  coverage_percent: number;
  covers_full_cycle: boolean;
  currency?: string;
}

interface OverdueMember {
  user_id: string;
  full_name: string;
  kyc_verified?: boolean;
  cycles_late: number;
  days_overdue: number;
}

interface ExclusionVote {
  target_user_id: string;
  target_name: string;
  vote_count: number;
  threshold: number;
  will_be_excluded: boolean;
}

interface CreatorReputation {
  avg_rating: number | null;
  rating_count: number;
  creator_id: string;
}

interface GuarantorRow {
  id: string;
  member_id: string;
  member_name: string;
  member_kyc_verified?: boolean;
  guarantor_name: string;
  guarantor_kyc_verified?: boolean;
  status: string;
}

interface MyGuarantor {
  id: string;
  guarantor_name: string;
  guarantor_kyc_verified?: boolean;
}

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function coverageColor(pct: number, full: boolean): string {
  if (full) return Colors.success;
  if (pct >= 50) return Colors.warning;
  return Colors.danger;
}

const EXCLUSION_REASONS = ["Non-paiement", "Comportement frauduleux", "Absent"];

/* ── Screen ─────────────────────────────────────────────────── */

export default function SecurityScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [reserve, setReserve] = useState<ReserveData | null>(null);
  const [overdue, setOverdue] = useState<OverdueMember[]>([]);
  const [votes, setVotes] = useState<ExclusionVote[]>([]);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [tontineName, setTontineName] = useState("");

  // Escrow dispute state
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [showDisputeInput, setShowDisputeInput] = useState(false);

  // Vote exclusion modal
  const [voteTarget, setVoteTarget] = useState<OverdueMember | null>(null);
  const [voteReason, setVoteReason] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteResult, setVoteResult] = useState<string | null>(null);

  // Creator rating
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);

  const [guarantors, setGuarantors] = useState<GuarantorRow[]>([]);
  const [myGuarantors, setMyGuarantors] = useState<MyGuarantor[]>([]);
  const [tontineMembers, setTontineMembers] = useState<TontineMemberOption[]>([]);
  const [selectedGuarantors, setSelectedGuarantors] = useState<TontineMemberOption[]>([]);
  const [guarantorSearch, setGuarantorSearch] = useState("");
  const [guarantorBusy, setGuarantorBusy] = useState(false);

  const guarantorSuggestions = useMemo(() => {
    const q = normalizeSearch(guarantorSearch.trim());
    if (q.length < 2) return [];
    const taken = new Set([
      user?.id,
      ...selectedGuarantors.map((g) => g.user_id),
    ].filter(Boolean));
    return tontineMembers
      .filter((m) => !taken.has(m.user_id))
      .filter((m) => normalizeSearch(m.full_name).includes(q))
      .slice(0, 8);
  }, [guarantorSearch, tontineMembers, selectedGuarantors, user?.id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
        try { return await fn(); } catch { return null; }
      };

      const [escrowRes, reserveRes, overdueRes, votesRes, tontineRes, guarantorsRes, myGuarantorsRes] = await Promise.all([
        safe(() => api.get<EscrowData>(`/tontines/${id}/escrow`)),
        safe(() => api.get<ReserveData>(`/tontines/${id}/reserve`)),
        safe(() => api.get<OverdueMember[]>(`/tontines/${id}/overdue`)),
        safe(() => api.get<ExclusionVote[]>(`/tontines/${id}/exclusion-votes`)),
        safe(() => api.get<any>(`/tontines/${id}`)),
        safe(() => api.get<GuarantorRow[]>(`/tontines/${id}/guarantors`)),
        safe(() => api.get<MyGuarantor[]>(`/tontines/${id}/my-guarantors`)),
      ]);

      if (escrowRes) setEscrow(escrowRes);
      if (reserveRes) setReserve(reserveRes);
      if (overdueRes) setOverdue(overdueRes);
      if (votesRes) setVotes(votesRes);
      if (guarantorsRes) setGuarantors(guarantorsRes);
      if (myGuarantorsRes) setMyGuarantors(myGuarantorsRes);

      if (tontineRes) {
        setTontineName(tontineRes.tontine?.name ?? "");
        const ownerId = tontineRes.tontine?.owner_id ?? null;
        const currentUserId = user?.id ?? null;
        const isCreatorUser = ownerId && currentUserId && ownerId === currentUserId;
        setIsCreator(!!isCreatorUser);

        const members = (tontineRes.members ?? [])
          .filter((m: { user_id?: string }) => m.user_id)
          .map((m: { user_id: string; full_name?: string; kyc_verified?: boolean }) => ({
            user_id: m.user_id,
            full_name: m.full_name?.trim() || "Membre",
            kyc_verified: m.kyc_verified ?? false,
          }));
        setTontineMembers(members);

        if (ownerId && !isCreatorUser) {
          const rep = await safe(() => api.get<CreatorReputation>(`/creator-reputation/${ownerId}`));
          if (rep) setReputation(rep);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitDispute = async () => {
    if (!disputeReason.trim()) {
      Alert.alert("Requis", "Veuillez décrire le problème.");
      return;
    }
    setDisputeBusy(true);
    try {
      await api.post(`/tontines/${id}/escrow-dispute`, { reason: disputeReason.trim() });
      setDisputeReason("");
      setShowDisputeInput(false);
      Alert.alert("Signalé", "Votre signalement a été transmis à l'équipe HODIX.");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Impossible d'envoyer le signalement.");
    } finally {
      setDisputeBusy(false);
    }
  };

  const submitVote = async () => {
    if (!voteTarget || !voteReason) return;
    setVoteBusy(true);
    try {
      const res = await api.post<any>(`/tontines/${id}/vote-exclusion`, {
        user_id: voteTarget.user_id,
        reason: voteReason,
      });
      const msg = res?.message ?? `Vote enregistré — ${res?.vote_count ?? "?"}/${res?.threshold ?? "?"} votes requis`;
      setVoteResult(msg);
    } catch (e: any) {
      setVoteResult(e?.detail ?? "Erreur lors du vote.");
    } finally {
      setVoteBusy(false);
    }
  };

  const closeVoteModal = () => {
    setVoteTarget(null);
    setVoteReason(null);
    setVoteResult(null);
    load();
  };

  const submitRating = async () => {
    if (rating === 0) {
      Alert.alert("Requis", "Veuillez sélectionner une note.");
      return;
    }
    setRatingBusy(true);
    try {
      await api.post(`/tontines/${id}/rate-creator`, { rating, comment: ratingComment || undefined });
      Alert.alert("Merci", "Votre évaluation a été enregistrée.");
      setRating(0);
      setRatingComment("");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Impossible d'enregistrer l'évaluation.");
    } finally {
      setRatingBusy(false);
    }
  };

  const addGuarantor = (member: TontineMemberOption) => {
    if (selectedGuarantors.length >= 2) return;
    if (selectedGuarantors.some((g) => g.user_id === member.user_id)) return;
    setSelectedGuarantors((prev) => [...prev, member]);
    setGuarantorSearch("");
  };

  const removeGuarantor = (userId: string) => {
    setSelectedGuarantors((prev) => prev.filter((g) => g.user_id !== userId));
  };

  const submitGuarantors = async () => {
    if (selectedGuarantors.length === 0) {
      Alert.alert("Requis", "Choisissez au moins un garant parmi les membres (max 2).");
      return;
    }
    setGuarantorBusy(true);
    try {
      const res = await api.post<{ assigned: number }>(`/tontines/${id}/guarantors`, {
        guarantors: selectedGuarantors.map((g) => g.user_id),
      });
      Alert.alert("Giga-Garant", `${res.assigned} garant(s) enregistré(s).`);
      setSelectedGuarantors([]);
      setGuarantorSearch("");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? e?.message ?? "Impossible d'enregistrer les garants.");
    } finally {
      setGuarantorBusy(false);
    }
  };

  const activateGuarantee = (member: OverdueMember) => {
    Alert.alert(
      "Activer Giga-Garant",
      `Notifier les garants de ${member.full_name} pour défaut de paiement ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Activer",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.post<{ claimed: number }>(`/tontines/${id}/guarantors/claim`, {
                user_id: member.user_id,
                reason: "Défaut de cotisation",
              });
              Alert.alert("Garantie activée", `${res.claimed} garant(s) notifié(s).`);
              load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.detail ?? "Impossible d'activer la garantie.");
            }
          },
        },
      ],
    );
  };

  /* ── Render ── */

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sécurité</Text>
        </View>
        <ActivityIndicator color={Colors.secondary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const escrowStatusColor =
    escrow?.status === "released"
      ? Colors.success
      : escrow?.status === "disputed"
      ? Colors.danger
      : Colors.warning;

  const escrowStatusLabel =
    escrow?.status === "released"
      ? "Libéré"
      : escrow?.status === "disputed"
      ? "Gelé — litige"
      : "En attente";

  const reserveColor = reserve
    ? coverageColor(reserve.coverage_percent, reserve.covers_full_cycle)
    : Colors.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Sécurité</Text>
          {tontineName ? <Text style={styles.headerSub} numberOfLines={1}>{tontineName}</Text> : null}
        </View>
        <Shield size={20} color={Colors.primary} />
      </View>

      <Text style={styles.screenSubtitle}>Tableau de bord de sécurité</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── A. Escrow Card ── */}
        {escrow && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Shield size={16} color={escrowStatusColor} />
              <Text style={styles.cardTitle}>Escrow</Text>
              <View style={[styles.statusBadge, { backgroundColor: escrowStatusColor + "20", borderColor: escrowStatusColor + "44" }]}>
                <Text style={[styles.statusBadgeText, { color: escrowStatusColor }]}>{escrowStatusLabel}</Text>
              </View>
            </View>

            {escrow.status === "disputed" && (
              <View style={styles.alertBox}>
                <AlertTriangle size={14} color={Colors.danger} />
                <Text style={styles.alertText}>
                  Fonds gelés — en cours de résolution par l'équipe HODIX
                </Text>
              </View>
            )}

            <View style={styles.escrowInfo}>
              {escrow.status !== "released" && escrow.hours_until_release != null ? (
                <View style={styles.infoRow}>
                  <Clock size={13} color={Colors.textMuted} />
                  <Text style={styles.infoText}>
                    Fonds libérés dans {escrow.hours_until_release}h
                  </Text>
                </View>
              ) : escrow.released_at ? (
                <View style={styles.infoRow}>
                  <CheckCircle size={13} color={Colors.success} />
                  <Text style={styles.infoText}>Libéré le {formatDate(escrow.released_at)}</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Montant retenu :</Text>
                <Text style={styles.infoValue}>{formatXAF(escrow.amount, escrow.currency)}</Text>
              </View>

              {escrow.dispute_count > 0 && (
                <View style={styles.infoRow}>
                  <AlertTriangle size={13} color={Colors.warning} />
                  <Text style={styles.infoText}>{escrow.dispute_count} litige(s) signalé(s)</Text>
                </View>
              )}
            </View>

            {escrow.status === "held" && (
              <>
                {showDisputeInput ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Décrivez le problème..."
                      placeholderTextColor={Colors.textSubtle}
                      value={disputeReason}
                      onChangeText={setDisputeReason}
                      multiline
                      numberOfLines={3}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => setShowDisputeInput(false)}
                        style={[styles.chipBtn, { flex: 1 }]}
                      >
                        <Text style={styles.chipBtnText}>Annuler</Text>
                      </TouchableOpacity>
                      <Button
                        label="Envoyer"
                        onPress={submitDispute}
                        loading={disputeBusy}
                        variant="danger"
                        style={{ flex: 1, paddingVertical: 10 }}
                      />
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowDisputeInput(true)}
                    style={styles.disputeBtn}
                    activeOpacity={0.85}
                  >
                    <AlertTriangle size={14} color={Colors.warning} />
                    <Text style={styles.disputeBtnText}>⚠️ Signaler un problème</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Card>
        )}

        {/* ── B. Reserve Fund Card ── */}
        {reserve && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Shield size={16} color={reserveColor} />
              <Text style={styles.cardTitle}>Fonds de réserve</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Solde :</Text>
              <Text style={[styles.infoValue, { color: reserveColor }]}>
                {formatXAF(reserve.balance, reserve.currency)}
              </Text>
            </View>

            {/* Coverage bar */}
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(reserve.coverage_percent, 100)}%` as any,
                      backgroundColor: reserveColor,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.coverageText, { color: reserveColor }]}>
                {reserve.coverage_percent}% couverture
              </Text>
            </View>

            <Text style={styles.coverageDesc}>
              Ce fonds couvre {reserve.coverage_percent}% d'un cycle complet en cas de défaillance
            </Text>
          </Card>
        )}

        {/* ── B2. Giga-Garant ── */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Handshake size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Giga-Garant — caution solidaire</Text>
          </View>
          <Text style={styles.coverageDesc}>
            Désignez jusqu'à 2 membres HODIX comme garants. En cas de défaut, l'admin peut activer la garantie solidaire.
          </Text>

          {myGuarantors.length > 0 && (
            <View style={{ gap: 6, marginTop: 8 }}>
              <Text style={styles.infoLabel}>Vos garants :</Text>
              {myGuarantors.map((g) => (
                <View key={g.id} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.infoText}>• </Text>
                  <VerifiedName
                    name={g.guarantor_name}
                    kycVerified={g.guarantor_kyc_verified}
                    style={styles.infoText}
                  />
                </View>
              ))}
            </View>
          )}

          {selectedGuarantors.length > 0 && (
            <View style={styles.guarantorChips}>
              {selectedGuarantors.map((g) => (
                <View key={g.user_id} style={styles.guarantorChip}>
                  <VerifiedName
                    name={g.full_name}
                    kycVerified={g.kyc_verified}
                    style={styles.guarantorChipText}
                    badgeSize={13}
                  />
                  <TouchableOpacity
                    onPress={() => removeGuarantor(g.user_id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Retirer ${g.full_name}`}
                  >
                    <Text style={styles.guarantorChipRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: 10 }}>
            <TextInput
              style={[styles.textInput, styles.guarantorSearchInput]}
              placeholder={
                selectedGuarantors.length >= 2
                  ? "Maximum 2 garants atteint"
                  : "Tapez au moins 2 lettres du nom…"
              }
              placeholderTextColor={Colors.textSubtle}
              value={guarantorSearch}
              onChangeText={setGuarantorSearch}
              editable={selectedGuarantors.length < 2}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {guarantorSuggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {guarantorSuggestions.map((m) => (
                  <TouchableOpacity
                    key={m.user_id}
                    style={styles.suggestionRow}
                    onPress={() => addGuarantor(m)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.suggestionAvatar}>
                      <Text style={styles.suggestionInitial}>{m.full_name[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                    <VerifiedName name={m.full_name} kycVerified={m.kyc_verified} style={styles.suggestionName} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {guarantorSearch.trim().length >= 2 && guarantorSuggestions.length === 0 && (
              <Text style={styles.noSuggestion}>Aucun membre trouvé</Text>
            )}
          </View>

          <Button
            label="Enregistrer mes garants"
            onPress={submitGuarantors}
            loading={guarantorBusy}
            disabled={selectedGuarantors.length === 0}
            style={{ marginTop: 8 }}
          />

          {guarantors.length > 0 && (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Text style={styles.infoLabel}>Garants du groupe</Text>
              {guarantors.slice(0, 8).map((g) => (
                <View key={g.id} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  <VerifiedName name={g.member_name} kycVerified={g.member_kyc_verified} style={styles.infoText} />
                  <Text style={styles.infoText}>→</Text>
                  <VerifiedName name={g.guarantor_name} kycVerified={g.guarantor_kyc_verified} style={styles.infoText} />
                  <Text style={styles.infoText}>({g.status})</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── C. Overdue Members Card ── */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <TrendingDown size={16} color={overdue.length > 0 ? Colors.danger : Colors.success} />
            <Text style={styles.cardTitle}>Membres en retard</Text>
          </View>

          {overdue.length === 0 ? (
            <View style={styles.infoRow}>
              <CheckCircle size={14} color={Colors.success} />
              <Text style={[styles.infoText, { color: Colors.success, fontWeight: "700" }]}>
                Tous les membres sont à jour
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 4 }}>
              {overdue.map((m) => (
                <View key={m.user_id} style={styles.overdueRow}>
                  <View style={styles.overdueAvatar}>
                    <Text style={styles.overdueInitial}>{m.full_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <VerifiedName name={m.full_name} kycVerified={m.kyc_verified} style={styles.overdueName} />
                    <Text style={styles.overdueDetail}>
                      {m.cycles_late} cycle(s) de retard · {m.days_overdue} jour(s)
                    </Text>
                  </View>
                  {m.cycles_late > 1 && (
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => { setVoteTarget(m); setVoteReason(null); setVoteResult(null); }}
                        style={styles.voteBtn}
                        activeOpacity={0.85}
                      >
                        <XCircle size={12} color={Colors.danger} />
                        <Text style={styles.voteBtnText}>Voter l'exclusion</Text>
                      </TouchableOpacity>
                      {isCreator && (
                        <TouchableOpacity onPress={() => activateGuarantee(m)} style={styles.guarantorBtn} activeOpacity={0.85}>
                          <Handshake size={12} color={Colors.primary} />
                          <Text style={styles.guarantorBtnText}>Giga-Garant</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── D. Exclusion Votes Card ── */}
        {votes.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Users size={16} color={Colors.danger} />
              <Text style={styles.cardTitle}>Votes d'exclusion en cours</Text>
            </View>
            <View style={{ gap: 12, marginTop: 4 }}>
              {votes.map((v) => {
                const voteColor = v.will_be_excluded ? Colors.danger : Colors.warning;
                const pct = Math.min((v.vote_count / v.threshold) * 100, 100);
                return (
                  <View key={v.target_user_id} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.voteName}>{v.target_name}</Text>
                      <Text style={[styles.voteCount, { color: voteColor }]}>
                        {v.vote_count}/{v.threshold}
                      </Text>
                    </View>
                    <View style={styles.progressBg}>
                      <View
                        style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: voteColor }]}
                      />
                    </View>
                    {v.will_be_excluded && (
                      <Text style={[styles.exclusionWarning, { color: voteColor }]}>
                        Seuil atteint — exclusion imminente
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* ── E. Creator Rating (only if not creator) ── */}
        {!isCreator && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Star size={16} color={Colors.warning} />
              <Text style={styles.cardTitle}>Évaluer le créateur</Text>
            </View>

            {reputation?.avg_rating != null && (
              <View style={styles.infoRow}>
                <Text style={styles.starDisplay}>
                  {"★".repeat(Math.round(reputation.avg_rating))}{"☆".repeat(5 - Math.round(reputation.avg_rating))}
                </Text>
                <Text style={styles.ratingCount}>
                  {reputation.avg_rating.toFixed(1)} ({reputation.rating_count} avis)
                </Text>
              </View>
            )}

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setRating(s)}
                  activeOpacity={0.7}
                  style={styles.starBtn}
                >
                  <Text style={[styles.starChar, { color: s <= rating ? Colors.warning : Colors.border }]}>
                    {s <= rating ? "★" : "☆"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.textInput, { marginTop: 10 }]}
              placeholder="Commentaire (optionnel)"
              placeholderTextColor={Colors.textSubtle}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={2}
            />

            <Button
              label="Évaluer le créateur"
              onPress={submitRating}
              loading={ratingBusy}
              style={{ marginTop: 10 }}
            />
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Vote Exclusion Modal */}
      <Modal
        visible={!!voteTarget}
        transparent
        animationType="slide"
        onRequestClose={closeVoteModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Voter l'exclusion</Text>
              <TouchableOpacity onPress={closeVoteModal}>
                <XCircle size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {voteResult ? (
              <View style={{ gap: 16, paddingTop: 8 }}>
                <Text style={styles.voteResultText}>{voteResult}</Text>
                <Button label="Fermer" onPress={closeVoteModal} variant="secondary" />
              </View>
            ) : (
              <>
                {voteTarget && (
                  <Text style={styles.modalSubtitle}>
                    Cibler : {voteTarget.full_name} ({voteTarget.cycles_late} cycle(s) de retard)
                  </Text>
                )}
                <Text style={styles.fieldLabel}>Raison</Text>
                <View style={styles.chipRow}>
                  {EXCLUSION_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setVoteReason(r)}
                      style={[
                        styles.reasonChip,
                        voteReason === r && styles.reasonChipActive,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.reasonChipText,
                          voteReason === r && styles.reasonChipTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Button
                  label="Confirmer le vote"
                  onPress={submitVote}
                  loading={voteBusy}
                  variant="danger"
                  disabled={!voteReason}
                  style={{ marginTop: 16 }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: { fontSize: 20, color: Colors.primary, fontWeight: "700" },
  headerTitle: { color: Colors.primary, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  headerSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 1 },

  screenSubtitle: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "600",
  },

  scroll: { padding: Spacing.xl, gap: 14 },

  card: { padding: 16, gap: 10 },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: Colors.text },

  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },

  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.dangerLight,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.danger + "44",
  },
  alertText: { flex: 1, color: Colors.danger, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  escrowInfo: { gap: 6 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  infoValue: { fontSize: 15, fontWeight: "800", color: Colors.text },
  infoText: { fontSize: 13, color: Colors.textMuted, fontWeight: "500" },

  disputeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.warning + "44",
    marginTop: 4,
  },
  disputeBtnText: { color: Colors.warning, fontWeight: "700", fontSize: 13 },

  textInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surface,
    minHeight: 70,
    textAlignVertical: "top",
  },
  guarantorSearchInput: {
    minHeight: 44,
    textAlignVertical: "center",
  },
  guarantorChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  guarantorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: Colors.primary + "33",
  },
  guarantorChipText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  guarantorChipRemove: { fontSize: 18, fontWeight: "700", color: Colors.primary, lineHeight: 20 },
  suggestionList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionInitial: { fontSize: 13, fontWeight: "800", color: Colors.primary },
  suggestionName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  noSuggestion: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 4,
  },

  chipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBtnText: { color: Colors.textMuted, fontWeight: "700", fontSize: 14 },

  progressBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  coverageText: { fontSize: 13, fontWeight: "700" },
  coverageDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginTop: 4 },

  overdueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dangerLight,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.danger + "22",
  },
  overdueAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.danger + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  overdueInitial: { color: Colors.danger, fontWeight: "900", fontSize: 13 },
  overdueName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  overdueDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.danger + "44",
  },
  voteBtnText: { fontSize: 10, fontWeight: "700", color: Colors.danger },
  guarantorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.primary + "44",
  },
  guarantorBtnText: { fontSize: 10, fontWeight: "700", color: Colors.primary },

  voteName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  voteCount: { fontSize: 13, fontWeight: "800" },
  exclusionWarning: { fontSize: 11, fontWeight: "700" },

  starsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  starBtn: { padding: 4 },
  starChar: { fontSize: 28, lineHeight: 32 },
  starDisplay: { fontSize: 18, color: Colors.warning, letterSpacing: 2 },
  ratingCount: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 100,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: Colors.primary },
  modalSubtitle: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: Colors.text, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  reasonChipActive: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  reasonChipText: { fontSize: 13, fontWeight: "700", color: Colors.text },
  reasonChipTextActive: { color: "#fff" },
  voteResultText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.success,
    textAlign: "center",
    padding: 16,
    backgroundColor: Colors.successLight,
    borderRadius: 12,
  },
});
