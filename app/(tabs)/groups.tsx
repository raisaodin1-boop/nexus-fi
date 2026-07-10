// Community hub — intention-first groups experience
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  ChevronRight,
  Compass,
  Mail,
  Network,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { supabase } from "@/src/supabase";
import { SkeletonList } from "@/src/ui";
import { CommunityCreateSheet } from "@/src/community-create-sheet";
import { CommunityIntentionHub } from "@/src/community-intention-hub";
import { CommunityDiscoverTab } from "@/src/community-discover-tab";
import { CommunityInvitationsTab } from "@/src/community-invitations-tab";
import { CommunityModulesSheet } from "@/src/community-modules-sheet";

type HubTab = "mine" | "discover" | "invites";
type GroupKind = "tontines" | "associations" | "cooperatives" | "funds";

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
  is_public?: boolean;
  kind: GroupKind;
  owner_id?: string;
}

const KIND_META: Record<GroupKind, { label: string; color: string; icon: typeof Users }> = {
  tontines: { label: "Tontine", color: Colors.primary, icon: Users },
  associations: { label: "Association", color: Colors.secondary, icon: Building2 },
  cooperatives: { label: "Coopérative", color: Colors.brandNavy, icon: Network },
  funds: { label: "Fonds", color: Colors.accentDark, icon: Wallet },
};

export default function Groups() {
  const router = useRouter();
  const { user } = useAuth();
  const [hubTab, setHubTab] = useState<HubTab>("mine");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCount, setInviteCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [modulesGroup, setModulesGroup] = useState<Item | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const [tontines, associations, cooperatives, funds] = await Promise.all([
        api.get<Omit<Item, "kind">[]>("/tontines").catch(() => []),
        api.get<Omit<Item, "kind">[]>("/associations").catch(() => []),
        api.get<Omit<Item, "kind">[]>("/cooperatives").catch(() => []),
        api.get<Omit<Item, "kind">[]>("/funds").catch(() => []),
      ]);
      const merged: Item[] = [
        ...(tontines ?? []).map((x) => ({ ...x, kind: "tontines" as const })),
        ...(associations ?? []).map((x) => ({ ...x, kind: "associations" as const })),
        ...(cooperatives ?? []).map((x) => ({ ...x, kind: "cooperatives" as const })),
        ...(funds ?? []).map((x) => ({ ...x, kind: "funds" as const })),
      ];
      setItems(merged);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  const loadInviteBadge = useCallback(async () => {
    try {
      const data = await api.get<{ items?: { type?: string; is_read?: boolean }[] }>("/notifications");
      const n = (data?.items ?? []).filter((x) =>
        ["join_request", "join_request_sent", "invite", "invitation", "association_join_request", "tontine_join_request"].includes(String(x.type ?? ""))
        && !x.is_read,
      ).length;
      setInviteCount(n);
    } catch {
      setInviteCount(0);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadMine();
    loadInviteBadge();
    const ch = supabase
      .channel("rt-community-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "tontines" }, () => { loadMine(); })
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [loadMine, loadInviteBadge]));

  const isEmpty = !loading && items.length === 0;

  const hubTabs: { key: HubTab; label: string; icon: typeof Users; badge?: number }[] = useMemo(() => [
    { key: "mine", label: "Mes Groupes", icon: Users },
    { key: "discover", label: "Découvrir", icon: Compass },
    { key: "invites", label: "Invitations", icon: Mail, badge: inviteCount },
  ], [inviteCount]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Votre Hub Communautaire</Text>
          <Text style={styles.subtitle}>
            Rejoignez ou bâtissez la confiance financière avec vos proches.
          </Text>
        </View>
        <TouchableOpacity
          testID="groups-manage-dash"
          onPress={() => router.push("/manage" as any)}
          style={styles.manageBtn}
        >
          <Settings2 color={Colors.primary} size={18} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="groups-create-fab"
          onPress={() => setCreateOpen(true)}
          style={styles.fab}
        >
          <Plus color="#fff" size={22} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {hubTabs.map((t) => {
          const active = hubTab === t.key;
          const Icon = t.icon;
          return (
            <TouchableOpacity
              key={t.key}
              testID={`hub-tab-${t.key}`}
              onPress={() => setHubTab(t.key)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Icon color={active ? "#fff" : Colors.textMuted} size={15} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              {t.badge && t.badge > 0 ? (
                <View style={[styles.badge, active && styles.badgeOnActive]}>
                  <Text style={styles.badgeText}>{t.badge > 9 ? "9+" : t.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {hubTab === "discover" ? (
          <CommunityDiscoverTab />
        ) : hubTab === "invites" ? (
          <CommunityInvitationsTab />
        ) : loading ? (
          <View style={{ paddingHorizontal: Spacing.xl, marginTop: 12 }}>
            <SkeletonList count={4} />
          </View>
        ) : isEmpty ? (
          <CommunityIntentionHub onDiscover={() => setHubTab("discover")} />
        ) : (
          <View style={{ paddingHorizontal: Spacing.xl, gap: 12 }}>
            <TouchableOpacity
              testID="groups-manage-banner"
              activeOpacity={0.9}
              onPress={() => router.push("/manage" as any)}
              style={[styles.manageBanner, Shadow.card]}
            >
              <View style={styles.manageBannerIcon}>
                <Settings2 color="#fff" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.manageBannerTitle}>Tableau de gestion</Text>
                <Text style={styles.manageBannerSub}>
                  Demandes d'adhésion, modules et pilotage de vos communautés
                </Text>
              </View>
              <ChevronRight color={Colors.primary} size={18} />
            </TouchableOpacity>

            <View style={styles.mineHead}>
              <Text style={styles.mineTitle}>{items.length} communauté(s)</Text>
              <TouchableOpacity onPress={() => setHubTab("discover")}>
                <Text style={styles.discoverLink}>Découvrir →</Text>
              </TouchableOpacity>
            </View>

            {items.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              const visibility = it.is_public === false ? "Privée" : "Publique";
              const visColor = it.is_public === false ? Colors.warning : Colors.success;
              const isOwner = !!(it.owner_id && user?.id && it.owner_id === user.id);
              return (
                <View key={`${it.kind}-${it.id}`} style={[styles.groupCard, Shadow.card]}>
                  <TouchableOpacity
                    testID={`group-item-${it.id}`}
                    activeOpacity={0.88}
                    onPress={() => router.push(`/${it.kind}/${it.id}` as any)}
                  >
                    <View style={styles.groupTop}>
                      <View style={[styles.kindIcon, { backgroundColor: meta.color + "18" }]}>
                        <Icon color={meta.color} size={18} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                          <View style={[styles.kindPill, { backgroundColor: meta.color + "18" }]}>
                            <Text style={[styles.kindPillText, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                        </View>
                        {it.description ? (
                          <Text style={styles.itemDesc} numberOfLines={2}>{it.description}</Text>
                        ) : null}
                        <View style={styles.itemMeta}>
                          <Text style={[styles.metaPill, { backgroundColor: visColor + "22", color: visColor }]}>
                            {visibility}
                          </Text>
                          {it.members_count !== undefined ? (
                            <Text style={styles.metaPill}>{it.members_count} membre(s)</Text>
                          ) : null}
                          {it.invite_code ? (
                            <Text style={[styles.metaPill, styles.codePill]}>{it.invite_code}</Text>
                          ) : null}
                        </View>
                      </View>
                      <ChevronRight color={Colors.textSubtle} size={18} />
                    </View>

                    <View style={styles.groupFooter}>
                      <View style={styles.trustMini}>
                        <ShieldCheck size={12} color={Colors.success} />
                        <Text style={styles.trustMiniText}>Trust Score</Text>
                      </View>
                      {it.contribution_amount !== undefined ? (
                        <Text style={styles.itemValue}>{formatXAF(it.contribution_amount, it.currency)}</Text>
                      ) : it.current_balance !== undefined ? (
                        <Text style={styles.itemValue}>{formatXAF(it.current_balance, it.currency)}</Text>
                      ) : it.total_collected !== undefined ? (
                        <Text style={styles.itemValue}>{formatXAF(it.total_collected, it.currency)}</Text>
                      ) : (
                        <Text style={styles.itemSub}>Voir le groupe</Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {isOwner ? (
                    <TouchableOpacity
                      style={styles.modulesBtn}
                      onPress={() => router.push("/manage" as any)}
                    >
                      <Settings2 size={13} color={Colors.primary} />
                      <Text style={styles.modulesBtnText}>Ouvrir le tableau de gestion</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CommunityCreateSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
      <CommunityModulesSheet
        visible={modulesOpen}
        onClose={() => setModulesOpen(false)}
        groupId={modulesGroup?.id}
        groupName={modulesGroup?.name}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: 12,
  },
  h1: { color: Colors.brandNavy, fontSize: 24, fontWeight: "900", letterSpacing: -0.4 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18, maxWidth: 280 },
  fab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center", ...Shadow.card,
  },
  manageBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.primary + "33",
  },
  manageBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.primary + "33",
  },
  manageBannerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  manageBannerTitle: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  manageBannerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    gap: 8,
    paddingBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.brandNavy, borderColor: Colors.brandNavy },
  tabLabel: { fontWeight: "700", fontSize: 12, color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: Colors.warning, alignItems: "center", justifyContent: "center",
  },
  badgeOnActive: { backgroundColor: Colors.accent },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  mineHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4,
  },
  mineTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  discoverLink: { fontSize: 13, fontWeight: "700", color: Colors.info },
  groupCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  groupTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  kindIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: { flex: 1, color: Colors.text, fontSize: 16, fontWeight: "800" },
  kindPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  kindPillText: { fontSize: 10, fontWeight: "800" },
  itemDesc: { color: Colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  itemMeta: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  metaPill: {
    fontSize: 11, fontWeight: "700", backgroundColor: Colors.surfaceAlt,
    color: Colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  codePill: { backgroundColor: Colors.primary, color: "#fff" },
  groupFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  trustMini: { flexDirection: "row", alignItems: "center", gap: 4 },
  trustMiniText: { fontSize: 12, fontWeight: "700", color: Colors.success },
  itemSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  itemValue: { color: Colors.primary, fontSize: 15, fontWeight: "800" },
  modulesBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingVertical: 4,
  },
  modulesBtnText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
});
