import { useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import {
  FileText,
  Landmark,
  Settings2,
  Users,
  Wallet,
  X,
} from "lucide-react-native";

import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

export type CommunityModuleKey =
  | "tontine"
  | "treasury"
  | "projects"
  | "members"
  | "documents";

const MODULES: {
  key: CommunityModuleKey;
  title: string;
  subtitle: string;
  icon: typeof Users;
  color: string;
  defaultOn: boolean;
}[] = [
  {
    key: "tontine",
    title: "Module Tontine",
    subtitle: "Cycles de paiement et tours de rôle",
    icon: Users,
    color: Colors.primary,
    defaultOn: true,
  },
  {
    key: "treasury",
    title: "Caisse & Cotisations",
    subtitle: "Trésorerie et suivi des paiements",
    icon: Wallet,
    color: Colors.warning,
    defaultOn: true,
  },
  {
    key: "projects",
    title: "Projets",
    subtitle: "Épargne cible (terrain, mariage…)",
    icon: Landmark,
    color: Colors.accentDark,
    defaultOn: false,
  },
  {
    key: "members",
    title: "Membres",
    subtitle: "Annuaire et rôles",
    icon: Users,
    color: Colors.secondary,
    defaultOn: true,
  },
  {
    key: "documents",
    title: "Documents & PV",
    subtitle: "Transparence et archives",
    icon: FileText,
    color: Colors.brandNavy,
    defaultOn: false,
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  groupName?: string;
};

export function CommunityModulesSheet({ visible, onClose, groupName }: Props) {
  const [enabled, setEnabled] = useState<Record<CommunityModuleKey, boolean>>(() =>
    Object.fromEntries(MODULES.map((m) => [m.key, m.defaultOn])) as Record<CommunityModuleKey, boolean>,
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.eyebrowRow}>
                <Settings2 size={14} color={Colors.primary} />
                <Text style={styles.eyebrow}>Centre de services</Text>
              </View>
              <Text style={styles.title}>Paramètres de la communauté</Text>
              {groupName ? <Text style={styles.sub}>{groupName}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color={Colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Activez uniquement les modules dont vous avez besoin — l'écran reste clair.
          </Text>

          <View style={{ gap: 10, marginTop: 12 }}>
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <View key={m.key} style={[styles.row, Shadow.card]}>
                  <View style={[styles.icon, { backgroundColor: m.color + "18" }]}>
                    <Icon color={m.color} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{m.title}</Text>
                    <Text style={styles.rowSub}>{m.subtitle}</Text>
                  </View>
                  <Switch
                    value={enabled[m.key]}
                    onValueChange={(v) => setEnabled((s) => ({ ...s, [m.key]: v }))}
                    trackColor={{ false: Colors.border, true: Colors.primary + "88" }}
                    thumbColor={enabled[m.key] ? Colors.primary : Colors.surfaceAlt}
                  />
                </View>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(12, 26, 46, 0.45)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl, paddingTop: 10, paddingBottom: 36,
  },
  handle: {
    alignSelf: "center", width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, marginBottom: 12,
  },
  header: { flexDirection: "row", gap: 8, marginBottom: 8 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { fontSize: 11, fontWeight: "800", color: Colors.primary, letterSpacing: 0.4 },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, marginTop: 4 },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  icon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
