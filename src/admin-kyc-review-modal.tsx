import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CheckCircle, ExternalLink, FileImage, X, XCircle } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { MIN_TOUCH } from "@/src/hooks/use-responsive";

export interface KycReviewTarget {
  user_id: string;
  full_name: string;
  kyc_status: string;
}

interface KycDocSlot {
  path: string;
  url: string | null;
}

interface KycDetail {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  date_of_birth: string | null;
  birth_place: string | null;
  profession: string | null;
  kyc_status: string;
  submitted_at: string | null;
  id_type: string | null;
  verification_mode: string | null;
  documents: {
    id_front: KycDocSlot | null;
    id_back: KycDocSlot | null;
    selfie: KycDocSlot | null;
  };
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function DocPreview({ label, doc }: { label: string; doc: KycDocSlot | null }) {
  if (!doc) {
    return (
      <View style={styles.docCard}>
        <Text style={styles.docLabel}>{label}</Text>
        <View style={styles.docMissing}>
          <FileImage color={Colors.textMuted} size={28} />
          <Text style={styles.docMissingText}>Non fourni</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.docCard}>
      <Text style={styles.docLabel}>{label}</Text>
      {doc.url ? (
        <>
          <Image source={{ uri: doc.url }} style={styles.docImage} resizeMode="contain" />
          {Platform.OS === "web" && (
            <TouchableOpacity style={styles.openLink} onPress={() => window.open(doc.url!, "_blank")}>
              <ExternalLink color={Colors.secondary} size={14} />
              <Text style={styles.openLinkText}>Ouvrir en plein écran</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.docMissing}>
          <Text style={styles.docMissingText}>Document inaccessible — vérifiez les droits Storage admin.</Text>
        </View>
      )}
    </View>
  );
}

export function KycReviewModal({
  target,
  onClose,
  onUpdated,
}: {
  target: KycReviewTarget | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { show } = useToast();
  const [detail, setDetail] = useState<KycDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const loadDetail = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const data = await api.get<KycDetail>(`/admin/kyc/${userId}`);
      setDetail(data);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Impossible de charger le dossier", "error");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose, show]);

  useEffect(() => {
    if (!target) {
      setDetail(null);
      setRejectReason("");
      setShowRejectForm(false);
      return;
    }
    loadDetail(target.user_id);
  }, [target, loadDetail]);

  const handleApprove = async () => {
    if (!target) return;
    setActing(true);
    try {
      await api.post("/admin/kyc/approve", { user_id: target.user_id });
      show("KYC approuvé — notification envoyée", "success");
      onUpdated();
      onClose();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!target) return;
    const reason = rejectReason.trim();
    if (!reason) {
      show("Décrivez ce que l'utilisateur doit corriger", "error");
      return;
    }
    setActing(true);
    try {
      await api.post("/admin/kyc/reject", { user_id: target.user_id, reason });
      show("KYC rejeté — notification envoyée", "success");
      onUpdated();
      onClose();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setActing(false);
    }
  };

  const pending = target && (target.kyc_status === "pending_review" || target.kyc_status === "pending");
  const docCount = detail
    ? [detail.documents.id_front, detail.documents.id_back, detail.documents.selfie].filter(Boolean).length
    : 0;

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Revue KYC</Text>
              <Text style={styles.sheetSub}>{target?.full_name}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Fermer">
              <X color={Colors.textMuted} size={22} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.secondary} size="large" />
              <Text style={styles.loadingText}>Chargement du dossier…</Text>
            </View>
          ) : detail ? (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Identité déclarée</Text>
                <FieldRow label="Nom complet" value={detail.full_name} />
                <FieldRow label="Email" value={detail.email} />
                <FieldRow label="Téléphone" value={detail.phone} />
                <FieldRow label="Date de naissance" value={detail.date_of_birth} />
                <FieldRow label="Lieu de naissance" value={detail.birth_place} />
                <FieldRow label="Profession" value={detail.profession} />
                <FieldRow label="Adresse" value={[detail.address, detail.city, detail.country].filter(Boolean).join(", ")} />
                <FieldRow label="Type de pièce" value={detail.id_type} />
                <FieldRow label="Mode" value={detail.verification_mode} />
                {detail.submitted_at && (
                  <FieldRow label="Soumis le" value={new Date(detail.submitted_at).toLocaleString("fr-FR")} />
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Documents ({docCount})</Text>
                <Text style={styles.sectionHint}>Comparez le nom et la photo avec les informations du profil.</Text>
                <DocPreview label="Recto pièce d'identité" doc={detail.documents.id_front} />
                <DocPreview label="Verso pièce d'identité" doc={detail.documents.id_back} />
                <DocPreview label="Selfie de vérification" doc={detail.documents.selfie} />
              </View>

              {pending && (
                <View style={styles.actions}>
                  {!showRejectForm ? (
                    <>
                      <TouchableOpacity
                        style={[styles.approveBtn, acting && styles.disabled]}
                        onPress={handleApprove}
                        disabled={acting}
                      >
                        <CheckCircle color="#fff" size={18} />
                        <Text style={styles.approveText}>Valider le KYC</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rejectOutlineBtn, acting && styles.disabled]}
                        onPress={() => setShowRejectForm(true)}
                        disabled={acting}
                      >
                        <XCircle color={Colors.danger} size={18} />
                        <Text style={styles.rejectOutlineText}>Rejeter le dossier</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.rejectBox}>
                      <Text style={styles.rejectTitle}>Motif du rejet (visible par l'utilisateur)</Text>
                      <TextInput
                        style={styles.rejectInput}
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        placeholder="Ex. : Photo floue, nom illisible, selfie ne correspond pas à la pièce…"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        textAlignVertical="top"
                      />
                      <View style={styles.rejectActions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRejectForm(false)} disabled={acting}>
                          <Text style={styles.cancelText}>Annuler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.rejectBtn, acting && styles.disabled]} onPress={handleReject} disabled={acting}>
                          {acting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.rejectText}>Confirmer le rejet</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    padding: Platform.OS === "web" ? 24 : 0,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: Platform.OS === "web" ? 20 : undefined,
    maxHeight: Platform.OS === "web" ? "92%" : "94%",
    width: Platform.OS === "web" ? "100%" : undefined,
    maxWidth: Platform.OS === "web" ? 720 : undefined,
    alignSelf: "center",
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: "900", color: Colors.primary },
  sheetSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { alignItems: "center", justifyContent: "center", padding: 48, gap: 12 },
  loadingText: { color: Colors.textMuted, fontWeight: "600" },
  scroll: { padding: Spacing.xl, paddingBottom: 40, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: Colors.primary },
  sectionHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  fieldRow: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontSize: 14, fontWeight: "600", color: Colors.text, marginTop: 2 },
  docCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 12,
    gap: 8,
    backgroundColor: "#FAFBFC",
  },
  docLabel: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  docImage: {
    width: "100%",
    height: 220,
    borderRadius: Radius.md,
    backgroundColor: "#E2E8F0",
  },
  docMissing: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: Radius.md,
  },
  docMissingText: { fontSize: 12, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 12 },
  openLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  openLinkText: { fontSize: 12, fontWeight: "700", color: Colors.secondary },
  actions: { gap: 10, marginTop: 4 },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  approveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rejectOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  rejectOutlineText: { color: Colors.danger, fontWeight: "800", fontSize: 15 },
  rejectBox: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
    borderRadius: Radius.lg,
    padding: 14,
    gap: 10,
  },
  rejectTitle: { fontSize: 13, fontWeight: "800", color: "#991B1B" },
  rejectInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: "#fff",
  },
  rejectActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: Colors.textMuted, fontWeight: "700" },
  rejectBtn: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    minWidth: 140,
    alignItems: "center",
  },
  rejectText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
