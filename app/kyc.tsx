import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ShieldCheck, CheckCircle, Clock, XCircle, Camera, User } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Button, Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { KycConsentModal } from "@/src/consent-modal";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface KycStatus {
  kyc_status?: string;
  status?: string;
  submitted_at?: string;
  verification_mode?: string;
  rejection_reason?: string | null;
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  address?: string;
  country?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof ShieldCheck; desc: string }> = {
  not_submitted: { label: "Non soumis", color: Colors.textMuted, icon: ShieldCheck, desc: "Téléversez votre pièce d'identité et un selfie pour activer les virements." },
  pending_review: { label: "En cours d'examen", color: Colors.warning, icon: Clock, desc: "Votre dossier est en cours de vérification." },
  approved: { label: "Approuvé", color: Colors.accent, icon: CheckCircle, desc: "Votre identité a été vérifiée avec succès !" },
  rejected: { label: "Rejeté", color: Colors.danger, icon: XCircle, desc: "Votre dossier a été rejeté. Vous pouvez le soumettre à nouveau." },
};

type DocSlot = "id_front" | "id_back" | "selfie";

const DOC_LABELS: Record<DocSlot, { title: string; hint: string }> = {
  id_front: { title: "Recto CNI / Passeport", hint: "Photo nette, sans reflet" },
  id_back: { title: "Verso (optionnel)", hint: "Si votre pièce a un verso" },
  selfie: { title: "Selfie de vérification", hint: "Visage visible, fond neutre" },
};

const KYC_DRAFT_KEY = "hodix_kyc_draft_id_front";

async function pickImage(): Promise<string | null> {
  const { launchImageLibraryAsync, MediaTypeOptions } = await import("expo-image-picker");
  const res = await launchImageLibraryAsync({
    mediaTypes: MediaTypeOptions.Images,
    base64: true,
    quality: 0.75,
    allowsEditing: true,
  });
  if (!res.canceled && res.assets[0]?.base64) return res.assets[0].base64;
  return null;
}

export default function KycScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocSlot, string>>>({});
  const [showConsent, setShowConsent] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.get<KycStatus>("/users/me"),
      api.get<any>("/users/me/kyc").catch(() => null),
      AsyncStorage.getItem(KYC_DRAFT_KEY).catch(() => null),
    ]).then(([profile, kyc, draftFront]) => {
      setStatus({
        ...profile,
        kyc_status: profile?.kyc_status ?? kyc?.status ?? "not_submitted",
        verification_mode: kyc?.verification_mode,
        submitted_at: kyc?.submitted_at,
        rejection_reason: kyc?.rejection_reason ?? null,
      });
      if (draftFront) {
        setDocs((d) => ({ ...d, id_front: draftFront }));
        AsyncStorage.removeItem(KYC_DRAFT_KEY).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickDoc = async (slot: DocSlot) => {
    try {
      const b64 = await pickImage();
      if (b64) setDocs((d) => ({ ...d, [slot]: b64 }));
    } catch {
      show("Impossible d'accéder à la galerie", "error");
    }
  };

  const handleSubmit = () => {
    if (!docs.id_front || !docs.selfie) {
      show("Recto de la pièce d'identité et selfie requis", "error");
      return;
    }
    setShowConsent(true);
  };

  const doSubmit = async () => {
    setShowConsent(false);
    setSubmitting(true);
    try {
      const r = await api.post<{ detail?: string; mode?: string }>("/kyc/submit", {
        id_front_base64: docs.id_front,
        id_back_base64: docs.id_back,
        selfie_base64: docs.selfie,
        id_type: "IDENTITY_CARD",
        country: status?.country,
      });
      show(r.detail ?? "Dossier KYC soumis !", "success");
      setStatus((s) => ({ ...s, kyc_status: "pending_review", verification_mode: r.mode }));
      setDocs({});
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur lors de la soumission", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const kycStatus = status?.kyc_status ?? "not_submitted";
  const info = STATUS_MAP[kycStatus] ?? STATUS_MAP.not_submitted;
  const Icon = info.icon;
  const canSubmit = kycStatus === "not_submitted" || kycStatus === "rejected";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vérification KYC</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 20, paddingBottom: 100 }}>
        <Card style={{ padding: 24, alignItems: "center", gap: 16 }}>
          <View style={[styles.iconBox, { backgroundColor: `${info.color}20` }]}>
            <Icon color={info.color} size={40} />
          </View>
          <Text style={[styles.statusLabel, { color: info.color }]}>{info.label}</Text>
          <Text style={styles.statusDesc}>{info.desc}</Text>
          {status?.verification_mode === "automated" && kycStatus === "pending_review" && (
            <Text style={styles.autoTag}>Vérification automatique Smile Identity en cours…</Text>
          )}
          {kycStatus === "rejected" && status?.rejection_reason ? (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionTitle}>Motif du rejet</Text>
              <Text style={styles.rejectionText}>{status.rejection_reason}</Text>
              <Text style={styles.rejectionHint}>Corrigez les points ci-dessus puis soumettez un nouveau dossier.</Text>
            </View>
          ) : null}
        </Card>

        {canSubmit && (
          <Card style={{ padding: 20, gap: 14 }}>
            <Text style={styles.sectionTitle}>Documents requis</Text>
            <Text style={styles.hint}>
              Vos fichiers sont stockés de façon sécurisée et ne sont accessibles qu'à vous et à l'équipe de conformité.
            </Text>
            {(Object.keys(DOC_LABELS) as DocSlot[]).map((slot) => {
              const meta = DOC_LABELS[slot];
              const picked = !!docs[slot];
              const required = slot === "id_front" || slot === "selfie";
              return (
                <TouchableOpacity
                  key={slot}
                  style={[styles.docRow, picked && styles.docRowDone]}
                  onPress={() => pickDoc(slot)}
                  testID={`kyc-pick-${slot}`}
                >
                  <View style={styles.docIcon}>
                    {slot === "selfie" ? <User color={picked ? Colors.accent : Colors.textMuted} size={22} /> : <Camera color={picked ? Colors.accent : Colors.textMuted} size={22} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>
                      {meta.title}{required ? " *" : ""}
                    </Text>
                    <Text style={styles.docHint}>{picked ? "✓ Document sélectionné" : meta.hint}</Text>
                  </View>
                  {picked && <CheckCircle color={Colors.accent} size={20} />}
                </TouchableOpacity>
              );
            })}
            <Button
              label="Soumettre pour vérification"
              onPress={handleSubmit}
              loading={submitting}
              testID="kyc-submit"
            />
          </Card>
        )}

        <Card style={{ padding: 20, gap: 12 }}>
          <Text style={styles.sectionTitle}>Niveaux de vérification</Text>
          {(() => {
            const profileComplete = !!(status?.full_name && status?.phone && status?.date_of_birth);
            return [
              {
                level: "Niveau 1",
                desc: profileComplete ? "Informations personnelles complètes ✓" : "Complétez nom, téléphone, date de naissance",
                done: profileComplete,
                action: !profileComplete ? () => router.push("/complete-profile") : undefined,
              },
              {
                level: "Niveau 2",
                desc: "Pièce d'identité + selfie vérifiés",
                done: kycStatus === "approved",
              },
            ].map((item) => (
              <View key={item.level} style={styles.levelRow}>
                <CheckCircle color={item.done ? Colors.accent : Colors.textMuted} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.levelTitle}>{item.level}</Text>
                  <Text style={styles.levelDesc}>{item.desc}</Text>
                  {item.action && (
                    <TouchableOpacity onPress={item.action} style={{ marginTop: 6 }}>
                      <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>Compléter le profil →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ));
          })()}
        </Card>
      </ScrollView>
      <KycConsentModal
        visible={showConsent}
        onAccept={doSubmit}
        onCancel={() => setShowConsent(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  iconBox: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 20, fontWeight: "900" },
  statusDesc: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  autoTag: { fontSize: 12, color: Colors.secondary, fontWeight: "700", textAlign: "center" },
  rejectionBox: {
    marginTop: 8,
    width: "100%",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: Radius.md,
    padding: 14,
    gap: 6,
  },
  rejectionTitle: { fontSize: 12, fontWeight: "800", color: "#991B1B", textTransform: "uppercase" },
  rejectionText: { fontSize: 14, color: "#7F1D1D", lineHeight: 20 },
  rejectionHint: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    borderStyle: "dashed", backgroundColor: Colors.surfaceAlt,
  },
  docRowDone: { borderColor: Colors.accent, borderStyle: "solid", backgroundColor: "#ECFDF5" },
  docIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  docHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  levelRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  levelTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  levelDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
