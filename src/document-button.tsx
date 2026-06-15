/**
 * DocumentButton — one-tap PDF generation + download/share.
 *
 * <DocumentButton kind="tontine_certificate" refId={tontineId} label="Certificat de participation" />
 */
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FileText } from "lucide-react-native";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { useDocument, DocKind } from "@/src/hooks/use-document";

const _BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

interface Props {
  kind: DocKind;
  refId?: string;
  label?: string;
  compact?: boolean;
}

const KIND_LABELS: Record<DocKind, string> = {
  tontine_certificate: "Certificat de participation",
  contribution_receipt: "Reçu de cotisation",
  tontine_disbursement: "Attestation de décaissement",
  savings_summary: "Relevé d'épargne",
  trust_score: "Certificat Trust Score",
};

export function DocumentButton({ kind, refId, label, compact = false }: Props) {
  const { generateAndDownload, generating, downloading } = useDocument();
  const busy = generating || downloading;
  const displayLabel = label ?? KIND_LABELS[kind];

  const handlePress = async () => {
    await generateAndDownload({ kind, ref_id: refId }, _BASE);
  };

  if (compact) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={busy}
        style={[styles.compact, busy ? { opacity: 0.6 } : null]}
        activeOpacity={0.75}
      >
        {busy ? (
          <ActivityIndicator size={14} color={Colors.secondary} />
        ) : (
          <FileText size={14} color={Colors.secondary} strokeWidth={2} />
        )}
        <Text style={styles.compactText}>{busy ? "Génération…" : "Télécharger PDF"}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={busy}
      style={[styles.btn, busy ? { opacity: 0.6 } : null]}
      activeOpacity={0.8}
    >
      <View style={styles.iconBox}>
        {busy ? (
          <ActivityIndicator size={20} color="#fff" />
        ) : (
          <FileText size={20} color="#fff" strokeWidth={2.5} />
        )}
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{busy ? "Génération en cours…" : displayLabel}</Text>
        <Text style={styles.sub}>
          {busy ? "Veuillez patienter" : "Signé · Horodaté · QR de vérification"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Documents list screen helper ────────────────────────────────────────────

export function DocumentsPanel() {
  const { listDocuments, refreshAndDownload, downloading } = useDocument();
  const [items, setItems] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    listDocuments().then((docs) => {
      setItems(docs);
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Aucun document généré pour l'instant.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      {items.map((doc) => (
        <TouchableOpacity
          key={doc.id}
          style={[styles.docRow, Shadow.card]}
          activeOpacity={0.8}
          onPress={() => refreshAndDownload(doc.id, doc.filename, doc.label, _BASE)}
        >
          <View style={styles.docIconBox}>
            <FileText size={22} color={Colors.secondary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.docLabel} numberOfLines={1}>{doc.label}</Text>
            <Text style={styles.docMeta}>
              {new Date(doc.created_at).toLocaleDateString("fr-FR")} · {Math.round(doc.size_bytes / 1024)} Ko
            </Text>
          </View>
          {downloading ? (
            <ActivityIndicator size={16} color={Colors.secondary} />
          ) : (
            <Text style={styles.dlText}>↓</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  compactText: { fontSize: 12, fontWeight: "600", color: Colors.secondary },
  center: { alignItems: "center", paddingVertical: Spacing.xl },
  empty: { fontSize: 13, color: Colors.textMuted },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  docLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },
  docMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  dlText: { fontSize: 18, fontWeight: "700", color: Colors.secondary },
});
