// HODIX Referral — Programme de parrainage
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { Clipboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Copy, Gift, Users, Star, Share2, MessageCircle, ChevronLeft } from "lucide-react-native";

import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { api } from "@/src/api";

interface ReferralInfo {
  invite_code: string;
  referral_count: number;
  bonus_points: number;
  referrals: { full_name: string; joined_at: string }[];
}

function Toast({ visible, message }: { visible: boolean; message: string }) {
  if (!visible) return null;
  return (
    <View style={styles.toast}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

export default function ReferralScreen() {
  const router = useRouter();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<ReferralInfo>("/users/me/referral");
        setInfo(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  const copyCode = async () => {
    if (!info) return;
    Clipboard.setString(info.invite_code);
    showToast();
  };

  const shareWhatsApp = () => {
    if (!info) return;
    const text = `Rejoignez HODIX avec mon code ${info.invite_code} et gagnez des bonus ! https://hodix.app`;
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Share.share({ message: text });
    });
  };

  const shareNative = async () => {
    if (!info) return;
    const text = `Rejoignez HODIX avec mon code ${info.invite_code} et gagnez des bonus ! https://hodix.app`;
    try {
      await Share.share({ message: text, title: "Rejoignez HODIX" });
    } catch {}
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Toast visible={toastVisible} message="Code copié !" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Header gradient */}
        <LinearGradient colors={[Colors.gold, Colors.goldDark]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color="#fff" size={22} />
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Gift color="#fff" size={36} />
          </View>
          <Text style={styles.headerTitle}>Programme de parrainage</Text>
          <Text style={styles.headerSub}>
            Invitez vos proches et gagnez des bonus à chaque inscription
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={Colors.gold} size="large" style={{ marginTop: 40 }} />
          ) : !info ? (
            <Text style={styles.errorText}>Impossible de charger les informations.</Text>
          ) : (
            <>
              {/* Code block */}
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>Votre code de parrainage</Text>
                <Text style={styles.codeValue}>{info.invite_code}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={copyCode} activeOpacity={0.8} testID="referral-copy">
                  <Copy color={Colors.gold} size={16} />
                  <Text style={styles.copyBtnText}>Copier le code</Text>
                </TouchableOpacity>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Users color={Colors.gold} size={22} />
                  <Text style={styles.statValue}>{info.referral_count}</Text>
                  <Text style={styles.statLabel}>Filleuls</Text>
                </View>
                <View style={styles.statCard}>
                  <Star color={Colors.gold} size={22} />
                  <Text style={styles.statValue}>{info.bonus_points} XAF</Text>
                  <Text style={styles.statLabel}>Bonus cotisation</Text>
                </View>
              </View>

              {/* Share buttons */}
              <TouchableOpacity style={styles.whatsappBtn} onPress={shareWhatsApp} activeOpacity={0.85} testID="referral-whatsapp">
                <MessageCircle color="#fff" size={20} />
                <Text style={styles.whatsappText}>Partager sur WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareBtn} onPress={shareNative} activeOpacity={0.85} testID="referral-share">
                <Share2 color={Colors.gold} size={18} />
                <Text style={styles.shareBtnText}>Partager</Text>
              </TouchableOpacity>

              {/* Referrals list */}
              {info.referrals.length > 0 ? (
                <View style={styles.listSection}>
                  <Text style={styles.listTitle}>Mes filleuls</Text>
                  {info.referrals.map((ref, i) => (
                    <View key={i} style={[styles.referralRow, i < info.referrals.length - 1 && styles.referralBorder]}>
                      <View style={styles.referralAvatar}>
                        <Text style={styles.referralAvatarLetter}>
                          {ref.full_name?.[0]?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.referralName}>{ref.full_name}</Text>
                        <Text style={styles.referralDate}>Inscrit le {formatDate(ref.joined_at)}</Text>
                      </View>
                      <View style={styles.bonusPill}>
                        <Text style={styles.bonusPillText}>+500 XAF</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyBox}>
                  <Gift color={Colors.textSubtle} size={32} />
                  <Text style={styles.emptyTitle}>Pas encore de filleuls</Text>
                  <Text style={styles.emptyText}>
                    Partagez votre code et gagnez 50 points par inscription !
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingTop: 16,
    paddingBottom: 48,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 4,
    marginBottom: 8,
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    fontWeight: "500",
  },
  body: { paddingHorizontal: Spacing.xl, marginTop: -24 },

  // Code card
  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderColor: Colors.gold + "40",
    ...(Shadow.card as any),
    marginBottom: 16,
  },
  codeLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  codeValue: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 26,
    fontWeight: "900",
    color: Colors.primary,
    letterSpacing: 2,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.gold + "15",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.gold + "50",
  },
  copyBtnText: { color: Colors.goldDark, fontWeight: "800", fontSize: 14 },

  // Stats
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Shadow.card as any),
  },
  statValue: { color: Colors.primary, fontSize: 28, fontWeight: "900" },
  statLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },

  // Share buttons
  whatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#25D366",
    borderRadius: Radius.xl,
    paddingVertical: 14,
    marginBottom: 12,
  },
  whatsappText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: Colors.gold + "50",
    marginBottom: 24,
  },
  shareBtnText: { color: Colors.goldDark, fontWeight: "800", fontSize: 15 },

  // Referrals list
  listSection: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Shadow.card as any),
  },
  listTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  referralBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  referralAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  referralAvatarLetter: { color: Colors.goldDark, fontWeight: "900", fontSize: 16 },
  referralName: { color: Colors.text, fontWeight: "700", fontSize: 14 },
  referralDate: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  bonusPill: {
    backgroundColor: Colors.accent + "15",
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  bonusPillText: { color: Colors.accent, fontWeight: "800", fontSize: 12 },

  // Empty state
  emptyBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { color: Colors.text, fontWeight: "800", fontSize: 15 },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  // Toast
  toast: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    zIndex: 999,
  },
  toastText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Error
  errorText: { color: Colors.danger, textAlign: "center", marginTop: 40, fontWeight: "600" },
});
