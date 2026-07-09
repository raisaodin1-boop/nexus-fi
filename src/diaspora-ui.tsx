import { StyleSheet, Text, TouchableOpacity, View, Clipboard } from "react-native";
import { Copy, Globe, Info } from "lucide-react-native";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DIASPORA_MANUAL_BANNER } from "@/src/diaspora-config";

export type DiasporaStatus =
  | "pending_payment"
  | "proof_submitted"
  | "under_review"
  | "validated"
  | "rejected"
  | "needs_info"
  | "suspicious";

export const DIASPORA_STATUS_CONFIG: Record<DiasporaStatus, { label: string; bg: string; fg: string }> = {
  pending_payment: { label: "En attente de paiement", bg: "#F3F4F6", fg: "#6B7280" },
  proof_submitted: { label: "Preuve envoyée", bg: Colors.infoLight, fg: Colors.info },
  under_review: { label: "En cours de vérification", bg: Colors.infoLight, fg: Colors.info },
  needs_info: { label: "Informations requises", bg: Colors.warningLight, fg: Colors.warning },
  validated: { label: "Validée", bg: Colors.successLight, fg: Colors.success },
  rejected: { label: "Rejetée", bg: Colors.dangerLight, fg: Colors.danger },
  suspicious: { label: "En examen", bg: Colors.warningLight, fg: Colors.warning },
};

export function DiasporaStatusBadge({ status }: { status: string }) {
  const cfg = DIASPORA_STATUS_CONFIG[status as DiasporaStatus] ?? DIASPORA_STATUS_CONFIG.pending_payment;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

export function DiasporaManualBanner() {
  return (
    <View style={styles.banner}>
      <Info color={Colors.info} size={18} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>{DIASPORA_MANUAL_BANNER.title}</Text>
        <Text style={styles.bannerBody}>{DIASPORA_MANUAL_BANNER.body}</Text>
      </View>
    </View>
  );
}

export function DiasporaHeroStrip() {
  return (
    <View style={styles.heroStrip}>
      <Globe color={Colors.primary} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={styles.heroTitle}>HODIX Diaspora</Text>
        <Text style={styles.heroSub}>
          Cotisez à vos tontines et soutenez votre épargne familiale, même depuis l'étranger.
        </Text>
      </View>
    </View>
  );
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  const { show } = useToast();
  const copy = async () => {
    Clipboard.setString(value);
    show(`${label} copié`, "success");
  };
  return (
    <View style={styles.copyRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue} selectable>{value}</Text>
      </View>
      <TouchableOpacity onPress={copy} style={styles.copyBtn} accessibilityLabel={`Copier ${label}`}>
        <Copy color={Colors.primary} size={16} />
      </TouchableOpacity>
    </View>
  );
}

export function SecurityNotice() {
  return (
    <View style={styles.securityBox}>
      <Text style={styles.securityTitle}>Votre sécurité</Text>
      <Text style={styles.securityLine}>• HODIX ne demande jamais votre PIN Mobile Money ni vos codes OTP.</Text>
      <Text style={styles.securityLine}>• Vérifiez toujours les coordonnées affichées dans l'application.</Text>
      <Text style={styles.securityLine}>• Ne payez jamais un administrateur sur un numéro personnel non affiché par HODIX.</Text>
      <Text style={styles.securityLine}>• Chaque cotisation doit contenir une référence unique.</Text>
    </View>
  );
}

export function ComingSoonRoadmap() {
  const items = [
    "Paiement par carte Visa et Mastercard",
    "Apple Pay et Google Pay",
    "Prélèvement bancaire et paiement automatisé",
    "Wallet multidevise et validation plus rapide",
    "Des partenaires de paiement internationaux seront intégrés progressivement.",
  ];
  return (
    <View style={styles.roadmap}>
      <Text style={styles.roadmapTitle}>Bientôt disponible</Text>
      {items.map((it) => (
        <Text key={it} style={styles.roadmapItem}>· {it}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  banner: {
    flexDirection: "row", gap: 10, padding: Spacing.md,
    backgroundColor: Colors.infoLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.info + "33", marginBottom: Spacing.md,
  },
  bannerTitle: { fontSize: 13, fontWeight: "800", color: Colors.info },
  bannerBody: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  heroStrip: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    padding: Spacing.lg, backgroundColor: Colors.primaryLight,
    borderRadius: Radius.xl, marginBottom: Spacing.md,
  },
  heroTitle: { fontSize: 18, fontWeight: "900", color: Colors.primary },
  heroSub: { fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 19 },
  copyRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  copyLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  copyValue: { fontSize: 14, fontWeight: "800", color: Colors.text, marginTop: 2 },
  copyBtn: { padding: 8, borderRadius: 10, backgroundColor: Colors.primaryLight },
  securityBox: {
    padding: Spacing.lg, backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg, gap: 6,
  },
  securityTitle: { fontSize: 14, fontWeight: "900", color: Colors.text, marginBottom: 4 },
  securityLine: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  roadmap: {
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    borderStyle: "dashed",
  },
  roadmapTitle: { fontSize: 13, fontWeight: "900", color: Colors.textMuted, marginBottom: 8 },
  roadmapItem: { fontSize: 12, color: Colors.textSubtle, lineHeight: 20 },
});
