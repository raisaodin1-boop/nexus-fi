import { StyleSheet, Text, TouchableOpacity, View, Clipboard } from "react-native";
import { Copy, Shield } from "lucide-react-native";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { DIASPORA_MANUAL_BANNER } from "@/src/diaspora-config";
import { DiasporaPalette } from "@/src/diaspora-shell";

export type DiasporaStatus =
  | "pending_payment"
  | "proof_submitted"
  | "under_review"
  | "validated"
  | "rejected"
  | "needs_info"
  | "suspicious";

export const DIASPORA_STATUS_CONFIG: Record<DiasporaStatus, { label: string; bg: string; fg: string }> = {
  pending_payment: { label: "À régler", bg: "#EEF2F8", fg: "#5B6B7F" },
  proof_submitted: { label: "Preuve reçue", bg: Colors.infoLight, fg: Colors.info },
  under_review: { label: "Vérification", bg: Colors.infoLight, fg: Colors.info },
  needs_info: { label: "Infos requises", bg: Colors.warningLight, fg: Colors.warning },
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

/** Compact validation notice — not a loud banner. */
export function DiasporaManualBanner({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.notice, compact && styles.noticeCompact]}>
      <View style={styles.noticeBar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle}>{DIASPORA_MANUAL_BANNER.title}</Text>
        {!compact ? <Text style={styles.noticeBody}>{DIASPORA_MANUAL_BANNER.body}</Text> : null}
      </View>
    </View>
  );
}

export function DiasporaHeroStrip() {
  return (
    <View style={styles.heroStrip}>
      <Text style={styles.heroEyeline}>HODIX Diaspora</Text>
      <Text style={styles.heroTitle}>Cotisez depuis l'étranger</Text>
      <Text style={styles.heroSub}>
        Vos tontines familiales, en devise locale, avec validation HODIX.
      </Text>
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

export function SecurityNotice({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <View style={styles.securityCompact}>
        <Shield color={DiasporaPalette.teal} size={16} />
        <Text style={styles.securityCompactText}>
          HODIX ne demande jamais votre PIN Mobile Money ni vos codes OTP.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.securityBox}>
      <Text style={styles.securityTitle}>Votre sécurité</Text>
      <Text style={styles.securityLine}>HODIX ne demande jamais votre PIN Mobile Money ni vos codes OTP.</Text>
      <Text style={styles.securityLine}>Vérifiez toujours les coordonnées affichées dans l'application.</Text>
      <Text style={styles.securityLine}>Chaque cotisation porte une référence unique à indiquer au paiement.</Text>
    </View>
  );
}

export function ComingSoonRoadmap() {
  const items = [
    "Carte Visa / Mastercard",
    "Apple Pay et Google Pay",
    "Prélèvement automatisé",
  ];
  return (
    <View style={styles.roadmap}>
      <Text style={styles.roadmapTitle}>Prochaines évolutions</Text>
      <Text style={styles.roadmapBody}>
        {items.join(" · ")}. Des partenaires internationaux seront ajoutés progressivement.
      </Text>
    </View>
  );
}

export function DiasporaJourneySteps() {
  const steps = [
    { n: "01", title: "Inscription", body: "Identité et preuve de résidence hors Cameroun." },
    { n: "02", title: "Validation", body: "Examen manuel par HODIX sous 24–48 h ouvrées." },
    { n: "03", title: "Espace Diaspora", body: "Cotisations en devise locale, suivi et preuves." },
  ];
  return (
    <View style={styles.journey}>
      {steps.map((s, i) => (
        <View key={s.n} style={[styles.journeyRow, i === steps.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.journeyN}>{s.n}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.journeyTitle}>{s.title}</Text>
            <Text style={styles.journeyBody}>{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  notice: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  noticeCompact: { paddingVertical: 10 },
  noticeBar: { width: 3, borderRadius: 2, backgroundColor: DiasporaPalette.teal },
  noticeTitle: { fontSize: 12, fontWeight: "800", color: DiasporaPalette.navy },
  noticeBody: { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  heroStrip: { gap: 6, marginBottom: Spacing.md },
  heroEyeline: { fontSize: 11, fontWeight: "800", color: DiasporaPalette.gold, letterSpacing: 2 },
  heroTitle: { fontSize: 22, fontWeight: "900", color: Colors.text, letterSpacing: -0.4 },
  heroSub: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  copyRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  copyLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  copyValue: { fontSize: 14, fontWeight: "800", color: Colors.text, marginTop: 2 },
  copyBtn: { padding: 8, borderRadius: Radius.md, backgroundColor: Colors.primaryLight },
  securityBox: {
    padding: Spacing.lg, backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: Radius.lg, gap: 8,
  },
  securityTitle: { fontSize: 14, fontWeight: "800", color: Colors.text, marginBottom: 2 },
  securityLine: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  securityCompact: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  securityCompactText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 17 },
  roadmap: { paddingVertical: 8, gap: 4 },
  roadmapTitle: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: 0.3 },
  roadmapBody: { fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 18 },
  journey: { gap: 0 },
  journeyRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  journeyN: {
    fontSize: 15,
    fontWeight: "900",
    color: DiasporaPalette.teal,
    width: 28,
    letterSpacing: -0.5,
  },
  journeyTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  journeyBody: { fontSize: 13, color: Colors.textMuted, marginTop: 3, lineHeight: 19 },
});
