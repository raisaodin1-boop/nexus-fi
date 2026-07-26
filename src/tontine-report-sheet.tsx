import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Flag, Paperclip, X } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Button } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

const REASONS: { code: string; label: string }[] = [
  { code: "fraude", label: "Fraude / escroquerie" },
  { code: "non_paiement", label: "Non-paiement / disparition" },
  { code: "mauvaise_gestion", label: "Mauvaise gestion" },
  { code: "faux_membres", label: "Faux membres / multi-comptes" },
  { code: "harcelement", label: "Harcèlement" },
  { code: "autre", label: "Autre" },
];

type Props = {
  tontineId: string;
  tontineName?: string;
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function TontineReportSheet({ tontineId, tontineName, visible, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState("fraude");
  const [detail, setDetail] = useState("");
  const [proofs, setProofs] = useState<{ path: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setReason("fraude");
    setDetail("");
    setProofs([]);
    setBusy(false);
    setUploading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickProof = async () => {
    if (proofs.length >= 5) {
      Alert.alert("Limite", "Maximum 5 preuves.");
      return;
    }
    try {
      setUploading(true);
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Autorisez l'accès aux photos pour joindre une preuve.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
        base64: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.base64) return;
      const asset = picked.assets[0];
      const mime = asset.mimeType ?? "image/jpeg";
      const up = await api.post<{ path: string }>(`/tontines/${tontineId}/report-proof/upload`, {
        base64: asset.base64,
        mime,
      });
      setProofs((prev) => [...prev, { path: up.path, label: `Preuve ${prev.length + 1}` }]);
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.detail : "Impossible d'ajouter la preuve.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (detail.trim().length < 10) {
      Alert.alert("Détail requis", "Décrivez le problème en au moins 10 caractères.");
      return;
    }
    if (proofs.length < 1) {
      Alert.alert("Preuve requise", "Joignez au moins une photo ou un document.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/tontines/${tontineId}/report`, {
        reason_code: reason,
        reason_detail: detail.trim(),
        proof_paths: proofs.map((p) => p.path),
      });
      Alert.alert(
        "Signalement envoyé",
        "HODIX a bien reçu votre signalement. Un admin l'examinera.",
      );
      onSubmitted?.();
      close();
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.detail : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Signaler la tontine</Text>
              {tontineName ? <Text style={styles.sub} numberOfLines={1}>{tontineName}</Text> : null}
            </View>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={12}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Motif</Text>
            <View style={styles.reasonWrap}>
              {REASONS.map((r) => {
                const active = reason === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    style={[styles.reasonChip, active && styles.reasonChipOn]}
                    onPress={() => setReason(r.code)}
                  >
                    <Text style={[styles.reasonText, active && styles.reasonTextOn]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Explication</Text>
            <TextInput
              style={styles.input}
              value={detail}
              onChangeText={setDetail}
              placeholder="Décrivez les faits avec précision…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>Preuves ({proofs.length}/5)</Text>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={pickProof}
              disabled={uploading || proofs.length >= 5}
            >
              {uploading ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Paperclip size={16} color={Colors.primary} />
              )}
              <Text style={styles.attachText}>
                {uploading ? "Envoi…" : "Joindre une photo / capture"}
              </Text>
            </TouchableOpacity>
            {proofs.map((p) => (
              <View key={p.path} style={styles.proofRow}>
                <Text style={styles.proofLabel}>{p.label}</Text>
                <TouchableOpacity onPress={() => setProofs((prev) => prev.filter((x) => x.path !== p.path))}>
                  <Text style={styles.proofRemove}>Retirer</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={styles.hint}>
              Les signalements abusifs peuvent entraîner des sanctions. Les preuves sont visibles uniquement par HODIX.
            </Text>

            <Button
              label={busy ? "Envoi…" : "Envoyer le signalement"}
              onPress={submit}
              loading={busy}
              disabled={busy || uploading}
              testID="tontine-report-submit"
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function TontineReportTrigger({
  tontineId,
  tontineName,
  hidden,
}: {
  tontineId: string;
  tontineName?: string;
  /** Hide for tontine owner */
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        testID="tontine-report-trigger"
      >
        <Flag size={14} color={Colors.danger} />
        <Text style={styles.triggerText}>Signaler cette tontine</Text>
      </TouchableOpacity>
      <TontineReportSheet
        tontineId={tontineId}
        tontineName={tontineName}
        visible={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  triggerText: { color: Colors.danger, fontWeight: "700", fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: "900", color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: "600" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: Spacing.xl, gap: 10, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: "800", color: Colors.textMuted, marginTop: 4 },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonChipOn: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  reasonText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  reasonTextOn: { color: "#991B1B" },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    color: Colors.text,
    backgroundColor: Colors.bg,
    fontSize: 14,
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    backgroundColor: Colors.primaryLight,
  },
  attachText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  proofRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  proofLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },
  proofRemove: { fontSize: 12, fontWeight: "700", color: Colors.danger },
  hint: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginVertical: 4 },
});
