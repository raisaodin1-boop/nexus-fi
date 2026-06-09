// GROUPS - Tontines, Associations, Cooperatives, Funds
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Users, Building2, Network, Wallet, ChevronRight, Globe } from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { Card, EmptyState, Button } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { supabase } from "@/src/supabase";

type Tab = "tontines" | "associations" | "cooperatives" | "funds";

interface Item {
  id: string;
  name: string;
  description?: string | null;
  invite_code?: string;
  members_count?: number;
  contribution_amount?: number;
  total_collected?: number;
  current_balance?: number;
  target_amount?: number | null;
  currency?: string;
}

export default function Groups() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tontines");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ep =
        tab === "tontines" ? "/tontines"
        : tab === "associations" ? "/associations"
        : tab === "cooperatives" ? "/cooperatives"
        : "/funds";
      const data = await api.get<Item[]>(ep);
      setItems(data);
    } catch {}
    setLoading(false);
  }, [tab]);

  // Real-time: subscribe only while screen is focused, auto-cleanup on blur
  useFocusEffect(useCallback(() => {
    load();
    if (tab !== "tontines") return;
    const ch = supabase
      .channel(`rt-groups-tontines`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tontines" }, () => { load(); })
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [tab, load]));

  const tabs: { key: Tab; label: string; icon: any; color: string }[] = [
    { key: "tontines", label: "Tontines", icon: Users, color: Colors.accent },
    { key: "associations", label: "Associations", icon: Building2, color: Colors.secondary },
    { key: "cooperatives", label: "Coopératives", icon: Network, color: Colors.primary },
    { key: "funds", label: "Fonds", icon: Wallet, color: Colors.accentDark },
  ];

  const createRoute = `/${tab === "funds" ? "funds" : tab}/create` as const;
  const joinRoute = (tab === "tontines" || tab === "associations" || tab === "cooperatives")
    ? (`/${tab}/join` as const) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Communauté</Text>
          <Text style={styles.subtitle}>Tontines, associations & fonds</Text>
        </View>
        <TouchableOpacity
          testID={`groups-create-${tab}`}
          onPress={() => router.push(createRoute as any)}
          style={styles.fab}
        >
          <Plus color="#fff" size={22} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          const Icon = t.icon;
          return (
            <TouchableOpacity
              testID={`tab-${t.key}`}
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tabBtn,
                active ? { backgroundColor: Colors.primary } : { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
              ]}
            >
              <Icon color={active ? "#fff" : t.color} size={16} />
              <Text style={[styles.tabLabel, { color: active ? "#fff" : Colors.text }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Public directory banner — tontines tab only */}
        {tab === "tontines" ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 8 }}>
            <TouchableOpacity
              testID="groups-directory-tontines"
              activeOpacity={0.85}
              onPress={() => router.push("/tontines/directory" as any)}
              style={[styles.joinCta, Shadow.card, { backgroundColor: Colors.secondaryLight, borderColor: Colors.secondary, borderWidth: 1 }]}
            >
              <View style={[styles.joinIcon, { backgroundColor: Colors.secondary }]}>
                <Globe color="#fff" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.joinTitle, { color: Colors.secondary }]}>Annuaire Public</Text>
                <Text style={styles.joinSub}>Découvrez et rejoignez des tontines publiques</Text>
              </View>
              <ChevronRight color={Colors.secondary} size={18} />
            </TouchableOpacity>
          </View>
        ) : null}

        {joinRoute ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginBottom: 12 }}>
            <TouchableOpacity
              testID={`groups-join-${tab}`}
              activeOpacity={0.85}
              onPress={() => router.push(joinRoute as any)}
              style={[styles.joinCta, Shadow.card]}
            >
              <View style={styles.joinIcon}>
                <Users color={Colors.secondary} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.joinTitle}>Rejoindre via code d'invitation</Text>
                <Text style={styles.joinSub}>Entrez le code partagé par l'admin</Text>
              </View>
              <ChevronRight color={Colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: 20 }}>
            <Card>
              <EmptyState
                title={`Aucune ${tabs.find(t => t.key === tab)?.label.toLowerCase()} pour l'instant`}
                description="Créez-en une nouvelle ou rejoignez-en une avec un code d'invitation."
                cta={<Button label="Créer maintenant" onPress={() => router.push(createRoute as any)} />}
              />
            </Card>
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.xl, gap: 12 }}>
            {items.map((it) => (
              <TouchableOpacity
                testID={`group-item-${it.id}`}
                key={it.id}
                activeOpacity={0.85}
                onPress={() => router.push(`/${tab}/${it.id}` as any)}
              >
                <Card style={{ padding: 18 }}>
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{it.name}</Text>
                      {it.description ? (
                        <Text style={styles.itemDesc} numberOfLines={2}>{it.description}</Text>
                      ) : null}
                      <View style={styles.itemMeta}>
                        {it.members_count !== undefined ? (
                          <Text style={styles.metaPill}>{it.members_count} membre(s)</Text>
                        ) : null}
                        {it.invite_code ? (
                          <Text style={[styles.metaPill, { backgroundColor: Colors.primary, color: "#fff" }]}>
                            {it.invite_code}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <ChevronRight color={Colors.textSubtle} size={20} />
                  </View>
                  {it.contribution_amount !== undefined ? (
                    <View style={styles.itemFooter}>
                      <Text style={styles.itemSub}>Contribution</Text>
                      <Text style={styles.itemValue}>{formatXAF(it.contribution_amount, it.currency)}</Text>
                    </View>
                  ) : it.current_balance !== undefined ? (
                    <View style={styles.itemFooter}>
                      <Text style={styles.itemSub}>Solde</Text>
                      <Text style={styles.itemValue}>{formatXAF(it.current_balance, it.currency)}</Text>
                    </View>
                  ) : it.total_collected !== undefined ? (
                    <View style={styles.itemFooter}>
                      <Text style={styles.itemSub}>Total collecté</Text>
                      <Text style={styles.itemValue}>{formatXAF(it.total_collected, it.currency)}</Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  h1: { color: Colors.primary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  fab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.secondary,
    alignItems: "center", justifyContent: "center", ...Shadow.card,
  },
  tabsRow: { paddingHorizontal: Spacing.xl, gap: 8, paddingBottom: 16 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full,
  },
  tabLabel: { fontWeight: "700", fontSize: 13 },
  joinCta: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border,
  },
  joinIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
  },
  joinTitle: { color: Colors.text, fontWeight: "800", fontSize: 14 },
  joinSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  itemRow: { flexDirection: "row", alignItems: "center" },
  itemName: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  itemDesc: { color: Colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  itemMeta: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  metaPill: {
    fontSize: 11, fontWeight: "700", backgroundColor: Colors.surfaceAlt,
    color: Colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, letterSpacing: 0.3,
  },
  itemFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  itemSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  itemValue: { color: Colors.primary, fontSize: 16, fontWeight: "800" },
});
