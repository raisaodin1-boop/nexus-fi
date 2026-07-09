import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, TouchableOpacity, View, Clipboard, ActivityIndicator } from "react-native";
import { ShieldCheck, Link2, Copy } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";

import { api } from "@/src/api";
import { Card } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";

type CertMeta = {
  hash: string;
  verify_url: string;
  polygon_stub: string;
};

export function IdentityVerificationCard() {
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<CertMeta | null>(null);

  const ensureCert = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.post<CertMeta>("/certificates/mint", {
        doc_id: "identity-profile",
        doc_type: "identity",
      });
      setCert(result);
    } catch {
      setCert(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { ensureCert(); }, [ensureCert]);

  const copyLink = async () => {
    if (!cert?.verify_url) return;
    Clipboard.setString(cert.verify_url);
  };

  const shareLink = async () => {
    if (!cert?.verify_url) return;
    try {
      await Share.share({ message: `Vérifiez mon identité financière HODIX : ${cert.verify_url}` });
    } catch { /* noop */ }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ShieldCheck color={Colors.accent} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Identité vérifiable publiquement</Text>
          <Text style={styles.sub}>QR · Hash · Signature · Lien public (type Stripe Identity)</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.secondary} style={{ marginVertical: 20 }} />
      ) : cert ? (
        <>
          <View style={styles.qrWrap}>
            <QRCode value={cert.verify_url} size={128} color={Colors.primary} backgroundColor="#fff" />
          </View>
          <Text style={styles.url} numberOfLines={2}>{cert.verify_url.replace("https://www.", "")}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Hash SHA-256</Text>
            <Text style={styles.metaVal} numberOfLines={1}>{cert.hash.slice(0, 24)}…</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Ancrage blockchain</Text>
            <Text style={styles.metaVal} numberOfLines={1}>{cert.polygon_stub.slice(0, 18)}…</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btn} onPress={copyLink}>
              <Copy color={Colors.secondary} size={16} />
              <Text style={styles.btnText}>Copier le lien</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={shareLink}>
              <Link2 color="#fff" size={16} />
              <Text style={[styles.btnText, { color: "#fff" }]}>Partager</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={ensureCert} style={styles.retry}>
          <Text style={styles.retryText}>Générer mon lien de vérification</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  title: { fontSize: 15, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 11, color: Colors.textMuted, marginTop: 3, lineHeight: 16 },
  qrWrap: { alignSelf: "center", padding: 12, backgroundColor: "#fff", borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  url: { textAlign: "center", fontSize: 12, fontWeight: "700", color: Colors.secondary },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metaLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  metaVal: { fontSize: 11, color: Colors.text, fontWeight: "700", flex: 1, textAlign: "right" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.secondaryLight,
  },
  btnPrimary: { backgroundColor: Colors.secondary },
  btnText: { fontSize: 12, fontWeight: "800", color: Colors.secondary },
  retry: { paddingVertical: 14, alignItems: "center" },
  retryText: { color: Colors.secondary, fontWeight: "700" },
});
