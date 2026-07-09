import { useCallback, useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Camera, FileUp, MessageCircle } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { useAuth } from "@/src/auth-context";
import { buildDiasporaWhatsAppUrl, maskPhone } from "@/src/diaspora-config";
import { DiasporaManualBanner } from "@/src/diaspora-ui";

async function pickImage(): Promise<{ base64: string; mime: string } | null> {
  const { launchImageLibraryAsync, MediaTypeOptions } = await import("expo-image-picker");
  const res = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, base64: true, quality: 0.75 });
  if (!res.canceled && res.assets[0]?.base64) {
    return { base64: res.assets[0].base64, mime: "image/jpeg" };
  }
  return null;
}

export default function DiasporaProofScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user } = useAuth();
  const [req, setReq] = useState<DiasporaRequest | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofLabel, setProofLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentTime, setPaymentTime] = useState("");
  const [txRef, setTxRef] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [comment, setComment] = useState("");
  const [declared, setDeclared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<DiasporaRequest>(`/diaspora/requests/${id}`);
      setReq(data);
      setAmount(String(data.amount_expected));
      setCurrency(data.currency);
      setPayerName(data.payer_name ?? user?.full_name ?? "");
      setPayerPhone(data.payer_phone ?? "");
    } catch {
      show("Demande introuvable", "error");
      router.back();
    }
  }, [id, router, show, user?.full_name]);

  useEffect(() => { load(); }, [load]);

  const uploadProof = async () => {
    const picked = await pickImage();
    if (!picked) return;
    try {
      const path = await api.post<string>("/diaspora/proof-upload", { base64: picked.base64, mime: picked.mime });
      setProofPath(path);
      setProofLabel("Capture / photo ajoutée");
      show("Fichier téléversé", "success");
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Échec du téléversement", "error");
    }
  };

  const submit = async () => {
    if (!req || !proofPath) { show("Pièce jointe obligatoire", "error"); return; }
    if (!declared) { show("Confirmez l'exactitude des informations", "error"); return; }
    if (!paymentDate.trim()) { show("Indiquez la date du paiement", "error"); return; }
    setLoading(true);
    try {
      await api.post(`/diaspora/requests/${req.id}/proof`, {
        proof_path: proofPath,
        declared_amount: Number(amount) || req.amount_expected,
        declared_currency: currency,
        payment_date: paymentDate,
        payment_time_approx: paymentTime || undefined,
        transaction_reference: txRef || undefined,
        payer_name: payerName || undefined,
        payer_phone: payerPhone || undefined,
        comment: comment || undefined,
        fraud_declaration: true,
      });
      setSubmitted(true);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setLoading(false);
    }
  };

  const openWhatsApp = () => {
    if (!req) return;
    const url = buildDiasporaWhatsAppUrl({
      reference: req.reference_code,
      tontine: req.tontine_name ?? "Tontine",
      amount: formatXAF(req.amount_expected),
      method: req.payment_method ?? "—",
      userName: user?.full_name ?? "Membre",
    });
    Linking.openURL(url).catch(() => show("WhatsApp indisponible", "error"));
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.success}>
          <Text style={styles.successTitle}>Preuve envoyée avec succès</Text>
          <Text style={styles.successSub}>
            Notre équipe va vérifier votre paiement. Vous recevrez une notification dès que le statut changera.
          </Text>
          <Text style={styles.status}>Statut : En cours de vérification</Text>
          <Button label="Voir mes cotisations" onPress={() => router.replace("/diaspora/contributions" as any)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={Colors.text} size={22} /></TouchableOpacity>
        <Text style={styles.title}>Envoyer ma preuve de paiement</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <DiasporaManualBanner />
        {req ? <Text style={styles.ref}>Réf. {req.reference_code} · {req.tontine_name}</Text> : null}

        <Card>
          <Text style={styles.section}>Pièce jointe (obligatoire)</Text>
          <View style={styles.uploadRow}>
            <TouchableOpacity style={styles.uploadBtn} onPress={uploadProof}>
              <Camera color={Colors.primary} size={20} />
              <Text style={styles.uploadText}>Photo / capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uploadBtn} onPress={uploadProof}>
              <FileUp color={Colors.primary} size={20} />
              <Text style={styles.uploadText}>Galerie / PDF</Text>
            </TouchableOpacity>
          </View>
          {proofLabel ? <Text style={styles.proofOk}>✓ {proofLabel}</Text> : null}
          <Text style={styles.hint}>Ne téléversez jamais de capture de PIN, OTP ou mot de passe.</Text>
        </Card>

        <Card>
          <Field label="Montant envoyé" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Field label="Devise" value={currency} onChangeText={setCurrency} />
          <Field label="Date du paiement (AAAA-MM-JJ)" value={paymentDate} onChangeText={setPaymentDate} placeholder="2026-07-18" />
          <Field label="Heure approximative" value={paymentTime} onChangeText={setPaymentTime} placeholder="14h30" />
          <Field label="Référence transaction (si disponible)" value={txRef} onChangeText={setTxRef} />
          <Field label="Nom du payeur" value={payerName} onChangeText={setPayerName} />
          <Field label="Numéro du payeur" value={payerPhone} onChangeText={setPayerPhone} keyboardType="phone-pad" />
          {payerPhone ? <Text style={styles.masked}>Affiché : {maskPhone(payerPhone)}</Text> : null}
          <Field label="Commentaire (facultatif)" value={comment} onChangeText={setComment} multiline />
        </Card>

        <TouchableOpacity style={styles.checkRow} onPress={() => setDeclared(!declared)}>
          <View style={[styles.checkbox, declared && styles.checkboxOn]} />
          <Text style={styles.checkText}>
            Je confirme que les informations fournies sont exactes. Toute fraude peut entraîner la suspension de mon compte.
          </Text>
        </TouchableOpacity>

        <Button label="Envoyer pour validation" onPress={submit} loading={loading} />

        <View style={styles.support}>
          <Text style={styles.supportQ}>Vous avez un problème avec l'envoi de votre preuve ?</Text>
          <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp}>
            <MessageCircle color="#fff" size={16} />
            <Text style={styles.waText}>Contacter le support HODIX sur WhatsApp</Text>
          </TouchableOpacity>
          <Text style={styles.waWarn}>Ne partagez jamais votre PIN, mot de passe ou OTP sur WhatsApp.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.lg },
  title: { fontSize: 18, fontWeight: "900", color: Colors.text, flex: 1 },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 48 },
  ref: { fontSize: 12, color: Colors.secondary, fontWeight: "700" },
  section: { fontSize: 13, fontWeight: "800", color: Colors.text, marginBottom: 10 },
  uploadRow: { flexDirection: "row", gap: 10 },
  uploadBtn: { flex: 1, alignItems: "center", gap: 6, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.primaryLight },
  uploadText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  proofOk: { color: Colors.success, fontWeight: "700", marginTop: 8 },
  hint: { fontSize: 11, color: Colors.danger, marginTop: 8 },
  masked: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: Colors.border, marginTop: 2 },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  support: { marginTop: 16, padding: Spacing.lg, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.lg },
  supportQ: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 10 },
  waBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#25D366", padding: 12, borderRadius: Radius.lg, justifyContent: "center" },
  waText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  waWarn: { fontSize: 10, color: Colors.textMuted, marginTop: 8, textAlign: "center" },
  success: { flex: 1, justifyContent: "center", padding: Spacing.xl, gap: 16 },
  successTitle: { fontSize: 22, fontWeight: "900", color: Colors.success, textAlign: "center" },
  successSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  status: { fontSize: 13, fontWeight: "800", color: Colors.info, textAlign: "center" },
});
