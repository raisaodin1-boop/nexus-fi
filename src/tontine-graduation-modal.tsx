import { Linking, Modal, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

export interface GraduationInvite {
  tontine_id: string;
  tontine_name: string;
  invite_code: string;
  cycle_completed: number;
  deeplink: string;
}

interface Props {
  visible: boolean;
  invite: GraduationInvite | null;
  onClose: () => void;
}

export function TontineGraduationModal({ visible, invite, onClose }: Props) {
  if (!invite) return null;

  const message = `🎉 Cycle ${invite.cycle_completed} terminé sur « ${invite.tontine_name} » !\n\nRejoignez notre prochaine tontine sur HODIX :\n📌 Code : *${invite.invite_code}*\n\n${invite.deeplink}`;

  const shareWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message });
    } catch {
      await Share.share({ message });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, Shadow.cardDark]}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Félicitations !</Text>
          <Text style={styles.sub}>
            Le cycle {invite.cycle_completed} de « {invite.tontine_name} » est bouclé. Invitez vos proches à rejoindre la prochaine tontine.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Code d'invitation</Text>
            <Text style={styles.code}>{invite.invite_code}</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={shareWhatsApp}>
            <Text style={styles.primaryText}>Inviter via WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onClose}>
            <Text style={styles.ghostText}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "center", padding: Spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: "center" },
  emoji: { fontSize: 44, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "900", color: Colors.text, marginBottom: 8 },
  sub: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 16 },
  codeBox: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.lg, padding: 14, width: "100%", alignItems: "center", marginBottom: 16 },
  codeLabel: { fontSize: 11, color: Colors.textSubtle, fontWeight: "700", letterSpacing: 0.5 },
  code: { fontSize: 28, fontWeight: "900", color: Colors.primary, letterSpacing: 4, marginTop: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  primaryBtn: { backgroundColor: "#25D366", width: "100%", paddingVertical: 14, borderRadius: Radius.lg, alignItems: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  ghostBtn: { paddingVertical: 10 },
  ghostText: { color: Colors.textMuted, fontWeight: "700" },
});
