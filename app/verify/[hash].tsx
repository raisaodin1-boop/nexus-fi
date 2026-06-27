import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle, ShieldCheck, XCircle } from "lucide-react-native";

import { verifyCertificateByHash, type CertificateVerification } from "@/src/db/verify";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

const NAVY = "#0B1F3A";
const EMERALD = "#10B981";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function docTypeLabel(docType: string) {
  const map: Record<string, string> = {
    identity: "Certificat d'identité HODIX",
    "trust-score": "Certificat Trust Score",
    savings: "Certificat d'épargne",
    kyc: "Attestation KYC",
  };
  return map[docType] ?? `Certificat ${docType}`;
}

export default function VerifyCertificateScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<CertificateVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await verifyCertificateByHash(String(hash ?? ""));
        if (!cancelled) setCert(result);
      } catch (e: any) {
        if (!cancelled) {
          setCert(null);
          setError(e?.detail ?? "Certificat introuvable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hash]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient colors={[NAVY, "#1a3a5c"]} style={[styles.hero, Shadow.cardDark]}>
          <ShieldCheck color={EMERALD} size={36} />
          <Text style={styles.heroTitle}>Vérification HODIX</Text>
          <Text style={styles.heroSub}>Authenticité du certificat financier</Text>
        </LinearGradient>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.secondary} size="large" />
            <Text style={styles.muted}>Vérification en cours…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.card, styles.invalidCard, Shadow.card]}>
            <XCircle color="#DC2626" size={40} />
            <Text style={styles.invalidTitle}>Certificat non vérifié</Text>
            <Text style={styles.muted}>{error}</Text>
            <Text style={styles.hashLabel}>Hash consulté</Text>
            <Text style={styles.hashValue}>{String(hash ?? "").slice(0, 16)}…</Text>
          </View>
        ) : null}

        {!loading && cert ? (
          <View style={[styles.card, styles.validCard, Shadow.card]}>
            <CheckCircle color={EMERALD} size={44} />
            <Text style={styles.validTitle}>Certificat authentique</Text>
            <Text style={styles.validSub}>Ce document a été émis et enregistré par HODIX.</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Titulaire</Text>
              <Text style={styles.value}>{cert.holder_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Type</Text>
              <Text style={styles.value}>{docTypeLabel(cert.doc_type)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Émis le</Text>
              <Text style={styles.value}>{formatDate(cert.issued_at)}</Text>
            </View>
            {cert.chain_ref ? (
              <View style={styles.row}>
                <Text style={styles.label}>Réf. blockchain</Text>
                <Text style={[styles.value, styles.mono]}>{cert.chain_ref}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.label}>Empreinte SHA-256</Text>
              <Text style={[styles.value, styles.mono]}>{cert.content_hash.slice(0, 24)}…</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.footer}>
          HODIX — Finance communautaire avec identité vérifiable.{"\n"}
          www.hodix.app
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.xl, paddingBottom: 48, gap: 16 },
  hero: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: "center", gap: 8 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center" },
  center: { alignItems: "center", paddingVertical: 40, gap: 12 },
  muted: { color: Colors.textMuted, fontSize: 14, textAlign: "center" },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.border },
  validCard: { borderColor: "#A7F3D0" },
  invalidCard: { borderColor: "#FECACA" },
  validTitle: { color: "#059669", fontSize: 20, fontWeight: "900" },
  validSub: { color: Colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 8 },
  invalidTitle: { color: "#DC2626", fontSize: 18, fontWeight: "800" },
  row: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  label: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", flex: 1 },
  value: { color: Colors.text, fontSize: 13, fontWeight: "700", flex: 1.2, textAlign: "right" },
  mono: { fontFamily: "monospace", fontSize: 11 },
  hashLabel: { color: Colors.textSubtle, fontSize: 11, marginTop: 8 },
  hashValue: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 11 },
  footer: { color: Colors.textSubtle, fontSize: 11, textAlign: "center", marginTop: 8, lineHeight: 16 },
});
