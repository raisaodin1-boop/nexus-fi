// Group detail (shared for tontines/associations/cooperatives)
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView,
  Share, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Copy, Crown, Users as UsersIcon, CreditCard, MessageSquare, Settings2, ShieldCheck } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import { openPaymentScreen, type PaymentKind } from "@/src/payment-nav";
import { Button, Card, Field } from "@/src/ui";
import { VerifiedName } from "@/src/verified-name";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { CommunityModulesSheet } from "@/src/community-modules-sheet";
import {
  CommunityModulesState,
  DEFAULT_COMMUNITY_MODULES,
  loadCommunityModules,
} from "@/src/community-modules-store";
import {
  CommunityDocumentsPlaceholder,
  CommunityProjectsPlaceholder,
} from "@/src/community-module-placeholders";

interface Member {
  id: string; user_id: string; full_name: string; kyc_verified?: boolean; role: string;
  rotation_position?: number; has_received?: boolean;
  status?: "a_jour" | "en_retard" | "suspendu";
  cycles_paid?: number;
}
interface Contrib { id: string; user_id: string; full_name: string; kyc_verified?: boolean; amount: number; created_at: string; cycle?: number }

interface Props {
  endpoint: string; // "/tontines/<id>" etc.
  contributeEndpoint: string;
  detailKey: "tontine" | "association" | "cooperative";
  testIDPrefix: string;
  showRotation?: boolean;
  advanceEndpoint?: string;
}

export function GroupDetailView({ endpoint, contributeEndpoint, detailKey, testIDPrefix, showRotation, advanceEndpoint }: Props) {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [modules, setModules] = useState<CommunityModulesState>({ ...DEFAULT_COMMUNITY_MODULES });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<any>(endpoint);
      if (!d?.[detailKey]) throw new Error("Groupe introuvable");
      setData(d);
      const gid = d?.[detailKey]?.id;
      if (gid) setModules(await loadCommunityModules(String(gid)));
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.detail : "Impossible de charger ce groupe");
    } finally {
      setLoading(false);
    }
  }, [endpoint, detailKey]);

  useEffectOnFocus(load);

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View></SafeAreaView>;
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.center, { padding: Spacing.xl, gap: 12 }]}>
          <Text style={{ color: Colors.text, fontWeight: "700", textAlign: "center" }}>{error ?? "Groupe introuvable"}</Text>
          <Button label="Réessayer" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }

  const item = data[detailKey];
  const isAdmin = data.is_admin;
  const members: Member[] = data.members ?? [];
  const contribs: Contrib[] = data.contributions ?? [];

  const shareWhatsApp = async () => {
    const appLink = "https://www.hodix.app";
    const message = `🏦 Rejoignez la tontine *"${item.name}"* sur Hodix !\n\n📌 Code d'invitation : *${item.invite_code}*\n\n📱 Téléchargez l'app : ${appLink}\n\nOu rejoignez directement : hodix://join?code=${item.invite_code}`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  };

  const shareGeneric = async () => {
    try {
      await Share.share({
        message: `Rejoignez "${item.name}" sur Hodix avec le code : ${item.invite_code} — https://www.hodix.app`,
      });
    } catch {}
  };

  const paymentKind: PaymentKind =
    detailKey === "tontine" ? "tontine_contribution"
    : detailKey === "association" ? "association_contribution"
    : "cooperative_contribution";

  const goToPayment = (payAmount?: number) => {
    const amt = payAmount ?? parseFloat(amount);
    if (!amt || amt <= 0) { setError("Montant invalide"); return; }
    setError(null);
    openPaymentScreen(router, {
      kind: paymentKind,
      amount: amt,
      label: item?.name,
      ...(detailKey === "tontine" ? { tontine_id: item.id } : {}),
      ...(detailKey === "association" ? { association_id: item.id } : {}),
      ...(detailKey === "cooperative" ? { cooperative_id: item.id } : {}),
    });
  };

  const advanceRotation = async () => {
    if (!advanceEndpoint) return;
    setBusy(true);
    try {
      await api.post(advanceEndpoint);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 60, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
            <Text style={styles.heroName}>{item.name}</Text>
            {item.description ? <Text style={styles.heroDesc}>{item.description}</Text> : null}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{item.members_count}</Text>
                <Text style={styles.heroStatLbl}>Membres</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>
                  {formatXAF(item.total_collected ?? item.total_capital ?? 0, item.currency)}
                </Text>
                <Text style={styles.heroStatLbl}>Collecté</Text>
              </View>
              {item.contribution_amount ? (
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>{formatXAF(item.contribution_amount, item.currency)}</Text>
                  <Text style={styles.heroStatLbl}>Contribution</Text>
                </View>
              ) : null}
            </View>
            {showRotation && data.compliance_pct !== undefined ? (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.compLbl}>Conformité {data.compliance_pct}%</Text>
                <View style={styles.compBar}><View style={[styles.compFill, { width: `${data.compliance_pct}%` }]} /></View>
              </View>
            ) : null}
            <View style={styles.codeRowContainer}>
              <TouchableOpacity onPress={shareGeneric} style={[styles.codeRow, { flex: 1 }]} testID={`${testIDPrefix}-share-code`}>
                <Copy color="#fff" size={14} />
                <Text style={styles.codeText}>{item.invite_code}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareWhatsApp} style={styles.whatsappCodeBtn} testID={`${testIDPrefix}-share-whatsapp`}>
                <MessageSquare color="#fff" size={14} />
                <Text style={styles.whatsappCodeBtnText}>WhatsApp ▶</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <TouchableOpacity onPress={shareWhatsApp} style={styles.whatsappBtn} testID={`${testIDPrefix}-whatsapp-share`}>
            <MessageSquare color="#fff" size={18} />
            <Text style={styles.whatsappBtnText}>Partager le lien sur WhatsApp</Text>
          </TouchableOpacity>

          <View style={styles.serviceRow}>
            <TouchableOpacity
              style={styles.serviceBtn}
              onPress={() => setModulesOpen(true)}
              testID={`${testIDPrefix}-modules`}
            >
              <Settings2 size={15} color={Colors.primary} />
              <Text style={styles.serviceBtnText}>Centre de services</Text>
            </TouchableOpacity>
            {showRotation && data.compliance_pct !== undefined ? (
              <View style={styles.trustChip}>
                <ShieldCheck size={13} color={Colors.success} />
                <Text style={styles.trustChipText}>Trust {data.compliance_pct}%</Text>
              </View>
            ) : (
              <View style={styles.trustChip}>
                <ShieldCheck size={13} color={Colors.success} />
                <Text style={styles.trustChipText}>Trust Score</Text>
              </View>
            )}
          </View>

          {isAdmin && modules.tontine && showRotation && advanceEndpoint ? (
            <View style={{ marginTop: 16, gap: 10 }}>
              <Button testID={`${testIDPrefix}-advance`} label={`Faire avancer le cycle (Cycle ${item.current_cycle})`} variant="accent" onPress={advanceRotation} loading={busy} />
              <Button
                testID={`${testIDPrefix}-send-reminders`}
                label="Envoyer rappels SMS aux membres"
                variant="secondary"
                icon={<MessageSquare color={Colors.primary} size={16} />}
                onPress={async () => {
                  try {
                    const r = await api.post<any>(`/sms/tontines/${item.id}/reminders`);
                    Alert.alert(
                      "Rappels envoyés",
                      `${r.sent} envoyés · ${r.skipped} ignorés (n° manquant) · ${r.failed} échecs.`,
                    );
                  } catch (e: any) {
                    Alert.alert("Erreur", e?.detail ?? "Échec");
                  }
                }}
              />
            </View>
          ) : null}

          {modules.treasury ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.section}>
              {detailKey === "tontine" ? "Cotiser" : "Contribuer"}
            </Text>
            <Card>
              {detailKey === "tontine" && item.contribution_amount ? (
                <Button
                  testID={`${testIDPrefix}-pay-fixed`}
                  label={`Payer ${formatXAF(item.contribution_amount, item.currency)}`}
                  variant="accent"
                  icon={<CreditCard color="#fff" size={18} />}
                  onPress={() => goToPayment(item.contribution_amount)}
                />
              ) : (
                <>
                  <Field
                    testID={`${testIDPrefix}-amount`}
                    label="Montant (XAF)"
                    placeholder={item.contribution_amount?.toString() ?? "10000"}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                  />
                  <Button
                    testID={`${testIDPrefix}-contribute`}
                    label="Payer — mode électronique"
                    onPress={() => goToPayment()}
                    disabled={!amount}
                  />
                </>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.paySubLabel}>
                Paiement MTN MoMo via Paynote uniquement — aucun crédit sans validation USSD.
              </Text>
            </Card>
          </View>
          ) : null}

          {modules.members ? (
          <>
          <Text style={styles.section}>Membres ({members.length})</Text>
          <View style={{ gap: 8 }}>
            {members.map((m) => {
              const statusMeta = m.status === "suspendu"
                ? { c: Colors.danger, lbl: "Suspendu" }
                : m.status === "en_retard"
                ? { c: Colors.warning, lbl: "En retard" }
                : { c: Colors.success, lbl: "À jour" };
              return (
                <Card key={m.id} style={styles.memberRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>{m.full_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <VerifiedName name={m.full_name} kycVerified={m.kyc_verified} style={styles.memberName} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      {m.role === "admin" ? <Crown color={Colors.accent} size={12} /> : <UsersIcon color={Colors.textSubtle} size={12} />}
                      <Text style={styles.memberRole}>{m.role === "admin" ? "Administrateur" : "Membre"}</Text>
                      {showRotation && m.rotation_position ? (
                        <Text style={styles.rotPos}>· #{m.rotation_position}{m.has_received ? " ✓" : ""}</Text>
                      ) : null}
                    </View>
                  </View>
                  {showRotation && m.status ? (
                    <View style={[styles.statusPill, { backgroundColor: statusMeta.c + "20", borderColor: statusMeta.c }]}>
                      <Text style={[styles.statusText, { color: statusMeta.c }]}>{statusMeta.lbl}</Text>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
          </>
          ) : null}

          {modules.treasury ? (
          <>
          <Text style={styles.section}>Contributions ({contribs.length})</Text>
          {contribs.length === 0 ? (
            <Card><Text style={styles.empty}>Aucune contribution pour l'instant.</Text></Card>
          ) : (
            <View style={{ gap: 8 }}>
              {contribs.slice(0, 30).map((c) => (
                <Card key={c.id} style={styles.contribRow}>
                  <View style={{ flex: 1 }}>
                    <VerifiedName name={c.full_name} kycVerified={c.kyc_verified} style={styles.contribName} />
                    <Text style={styles.contribDate}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}{c.cycle ? ` · Cycle ${c.cycle}` : ""}</Text>
                  </View>
                  <Text style={styles.contribAmt}>+{formatXAF(c.amount, item.currency)}</Text>
                </Card>
              ))}
            </View>
          )}
          </>
          ) : null}

          {modules.projects ? <CommunityProjectsPlaceholder /> : null}
          {modules.documents ? <CommunityDocumentsPlaceholder /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <CommunityModulesSheet
        visible={modulesOpen}
        onClose={() => setModulesOpen(false)}
        groupId={item.id}
        groupName={item.name}
        onChange={setModules}
      />
    </SafeAreaView>
  );
}

// Tiny helper to call load on focus without circular imports
function useEffectOnFocus(fn: () => void) {
  useFocusEffect(useCallback(() => { fn(); }, [fn]));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 12 },
  hero: { borderRadius: Radius.xxl, padding: 22, overflow: "hidden" },
  heroName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  heroDesc: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6, lineHeight: 18 },
  heroStats: { flexDirection: "row", gap: 16, marginTop: 18 },
  heroStat: { flex: 1 },
  heroStatVal: { color: Colors.accent, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  heroStatLbl: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2, fontWeight: "600", letterSpacing: 0.3 },
  compLbl: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  compBar: { marginTop: 6, height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" },
  compFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },
  codeRowContainer: { flexDirection: "row", gap: 8, marginTop: 16 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(16,185,129,0.18)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  codeText: { color: "#fff", fontWeight: "800", letterSpacing: 2, flex: 1 },
  codeShare: { color: Colors.accent, fontWeight: "700", fontSize: 12 },
  whatsappCodeBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#25D366", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  whatsappCodeBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  whatsappBtn: { backgroundColor: "#25D366", borderRadius: 14, padding: 14, flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 },
  whatsappBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  serviceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 12, gap: 10,
  },
  serviceBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + "33",
  },
  serviceBtnText: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  trustChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.successLight, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: Radius.full,
  },
  trustChipText: { fontSize: 12, fontWeight: "800", color: Colors.success },
  paySubLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 6 },
  adminNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 8, marginTop: -4 },
  section: { color: Colors.text, fontSize: 14, fontWeight: "800", marginTop: 24, marginBottom: 10, letterSpacing: -0.3 },
  fieldLbl: { color: Colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  memberOpt: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  memberOptText: { color: Colors.text, fontWeight: "600", fontSize: 13 },
  empty: { color: Colors.textMuted, textAlign: "center", padding: 20, fontSize: 13 },
  error: { backgroundColor: "#FEE2E2", color: Colors.danger, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: Colors.primary, fontWeight: "900", fontSize: 14 },
  memberName: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  memberRole: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  rotPos: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  contribRow: { flexDirection: "row", alignItems: "center", padding: 12 },
  contribName: { color: Colors.text, fontWeight: "700", fontSize: 13 },
  contribDate: { color: Colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "500" },
  contribAmt: { color: Colors.accentDark, fontWeight: "800", fontSize: 14 },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
});
