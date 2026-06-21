import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CheckCircle, Crown, Trash2, XCircle } from "lucide-react-native";
import { api, ApiError } from "@/src/api";
import { Card } from "@/src/ui";
import { VerifiedName } from "@/src/verified-name";
import { Colors, Radius, Spacing } from "@/src/theme";
import { isKycVerified } from "@/src/profile-display";

export interface PromotionRequestRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  kyc_status?: string;
  reason: string;
  status: string;
  created_at: string;
}

interface Props {
  requests: PromotionRequestRow[];
  compact?: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function AdminPromotionRequestsPanel({
  requests,
  compact,
  onChanged,
  onError,
  onSuccess,
}: Props) {
  const [rows, setRows] = useState(requests);
  useEffect(() => { setRows(requests); }, [requests]);

  const pending = rows.filter((r) => r.status === "pending");

  const handle = async (req: PromotionRequestRow, approve: boolean) => {
    try {
      await api.post(approve ? "/admin/promotion/approve" : "/admin/promotion/reject", {
        user_id: req.user_id,
        request_id: req.id,
      });
      setRows((prev) => prev.map((r) => (
        r.id === req.id ? { ...r, status: approve ? "approved" : "rejected" } : r
      )));
      onSuccess(approve ? `${req.full_name} promu(e) Manager` : `Demande de ${req.full_name} refusée`);
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.detail : "Erreur");
      onChanged();
    }
  };

  const remove = async (req: PromotionRequestRow) => {
    try {
      await api.del(`/admin/promotion-requests/${req.id}`);
      setRows((prev) => prev.filter((r) => r.id !== req.id));
      onSuccess("Demande supprimée");
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.detail : "Erreur");
    }
  };

  if (!pending.length) {
    return (
      <Card style={styles.emptyCard}>
        <Crown color={Colors.textMuted} size={22} />
        <Text style={styles.emptyTitle}>Aucune demande Manager en attente</Text>
        <Text style={styles.emptyDesc}>Les nouvelles demandes apparaîtront ici.</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {pending.map((req) => (
        <Card key={req.id} style={styles.card}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <VerifiedName
                name={req.full_name}
                kycVerified={isKycVerified(req.kyc_status)}
                style={styles.name}
              />
              <Text style={styles.email} numberOfLines={1}>{req.email}</Text>
              <Text style={styles.date}>
                {new Date(req.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </Text>
            </View>
            <View style={[styles.kycPill, isKycVerified(req.kyc_status) ? styles.kycOk : styles.kycMissing]}>
              <Text style={[styles.kycPillText, isKycVerified(req.kyc_status) ? styles.kycOkText : styles.kycMissingText]}>
                {isKycVerified(req.kyc_status) ? "KYC OK" : "KYC requis"}
              </Text>
            </View>
          </View>

          {!compact ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Motivation</Text>
              <Text style={styles.reasonText}>{req.reason}</Text>
            </View>
          ) : (
            <Text style={styles.reasonPreview} numberOfLines={2}>{req.reason}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => handle(req, true)} activeOpacity={0.85}>
              <CheckCircle color="#fff" size={14} />
              <Text style={styles.approveText}>Valider</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handle(req, false)} activeOpacity={0.85}>
              <XCircle color="#fff" size={14} />
              <Text style={styles.rejectText}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(req)} activeOpacity={0.85}>
              <Trash2 color={Colors.danger} size={14} />
            </TouchableOpacity>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: { alignItems: "center", padding: 20, gap: 6 },
  emptyTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  emptyDesc: { color: Colors.textMuted, fontSize: 12, textAlign: "center" },
  card: { padding: 14, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { color: Colors.text, fontWeight: "800", fontSize: 15 },
  email: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  date: { color: Colors.textSubtle, fontSize: 11, marginTop: 4 },
  kycPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  kycOk: { backgroundColor: "#DBEAFE" },
  kycMissing: { backgroundColor: "#FEF3C7" },
  kycPillText: { fontSize: 10, fontWeight: "800" },
  kycOkText: { color: "#1D4ED8" },
  kycMissingText: { color: "#92400E" },
  reasonBox: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10 },
  reasonLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  reasonText: { color: Colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 },
  reasonPreview: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.danger,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  deleteBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger + "44",
    backgroundColor: Colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
});
