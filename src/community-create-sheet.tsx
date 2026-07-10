import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Building2, Landmark, Network, Users, X } from "lucide-react-native";
import { useRouter } from "expo-router";

import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const OPTIONS = [
  {
    key: "tontine",
    title: "Créer une Tontine",
    subtitle: "Njangi / Likelemba — cycles rotatifs classiques",
    tag: "Populaire",
    icon: Users,
    color: Colors.primary,
    route: "/tontines/create",
  },
  {
    key: "association",
    title: "Créer une Association",
    subtitle: "Réunions, membres, caisse et projets",
    tag: null,
    icon: Building2,
    color: Colors.secondary,
    route: "/associations/create",
  },
  {
    key: "cooperative",
    title: "Créer une Coopérative",
    subtitle: "Structure économique à but lucratif",
    tag: null,
    icon: Network,
    color: Colors.brandNavy,
    route: "/cooperatives/create",
  },
  {
    key: "fund",
    title: "Créer un Projet / Fonds",
    subtitle: "Épargne cible : terrain, mariage, urgence",
    tag: null,
    icon: Landmark,
    color: Colors.accentDark,
    route: "/funds/create",
  },
] as const;

export function CommunityCreateSheet({ visible, onClose }: Props) {
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Que souhaitez-vous créer ?</Text>
              <Text style={styles.sheetSub}>Choisissez selon votre besoin réel</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <X color={Colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10 }}>
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <TouchableOpacity
                  key={opt.key}
                  testID={`create-sheet-${opt.key}`}
                  activeOpacity={0.88}
                  style={[styles.option, Shadow.card]}
                  onPress={() => {
                    onClose();
                    router.push(opt.route as any);
                  }}
                >
                  <View style={[styles.iconBox, { backgroundColor: opt.color + "18" }]}>
                    <Icon color={opt.color} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.optionTitle}>{opt.title}</Text>
                      {opt.tag ? (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>{opt.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.optionSub}>{opt.subtitle}</Text>
                  </View>
                </TouchableOpacity>
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
    flex: 1,
    backgroundColor: "rgba(12, 26, 46, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: 10,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  sheetSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  optionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  optionSub: { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  tag: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  tagText: { fontSize: 10, fontWeight: "800", color: Colors.success },
});
