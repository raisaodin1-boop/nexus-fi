import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  Check,
  ChevronRight,
  Landmark,
  Network,
  Settings2,
  ShieldAlert,
  Users,
  X,
} from "lucide-react-native";

import { api, formatXAF } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card, EmptyState } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";
import { CommunityModulesSheet } from "@/src/community-modules-sheet";
import { useLiveDashboardSync } from "@/src/hooks/use-live-dashboard";

type Owned = {
  tontines: any[];
  associations: any[];
  cooperatives: any[];
  funds: any[];
};

type JoinReq = {
  id: string;
  group_type?: "tontine" | "association";
  association_id?: string;
  association_name?: string;
  tontine_id?: string;
  tontine_name?: string;
  requester_name: string;
  message?: string | null;
  created_at: string;
};

type RemovalReq = {
  id: string;
  group_type: string;
  group_id: string;
  target_name: string;
  requester_name: string;
  reason: string;
};

const ASSOC_MODULES = [
  "Gestion des membres", "Tontines", "Cotisations", "Réunions", "Votes",
  "Documents", "Annonces", "Discussions", "Comptabilité", "Caisse",
  "Projets", "Rapports financiers",
];

export function CreatorManageDashboard({ embed = false }: { embed?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [owned, setOwned] = useState<Owned | null>(null);
  const [joinReqs, setJoinReqs] = useState<JoinReq[]>([]);
  const [removals, setRemovals] = useState<RemovalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [modulesGroup, setModulesGroup] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const [o, assocJr, tontineJr] = await Promise.all([
        api.get<Owned>("/creator/owned"),
        api.get<JoinReq[]>("/associations/join-requests"),
        api.get<JoinReq[]>("/tontines/join-requests"),
      ]);
      setOwned(o);
      const merged = [
        ...(assocJr ?? []).map((r) => ({ ...r, group_type: "association" as const })),
        ...(tontineJr ?? []).map((r) => ({ ...r, group_type: "tontine" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setJoinReqs(merged);
      if (isPlatformAdmin) {
        const rr = await api.get<RemovalReq[]>("/governance/removal-requests").catch(() => []);
        setRemovals(rr ?? []);
      }
    } catch (e: any) {
      setOwned({ tontines: [], associations: [], cooperatives: [], funds: [] });
      setJoinReqs([]);
      if (!opts?.quiet) {
        Alert.alert("Erreur", e?.detail ?? "Impossible de charger le tableau de gestion.");
      }
    }
    setLoading(false);
  }, [isPlatformAdmin]);

  const quietReload = useCallback(() => load({ quiet: true }), [load]);
  useLiveDashboardSync(user?.id, { mode: "manager", reload: quietReload });

  const totalOwned =
    (owned?.tontines.length ?? 0) +
    (owned?.associations.length ?? 0) +
    (owned?.cooperatives.length ?? 0) +
    (owned?.funds.length ?? 0);

  const respondJoin = async (id: string, approve: boolean, groupType: "tontine" | "association" = "association") => {
    setBusyId(id);
    try {
      if (groupType === "tontine") {
        await api.post("/tontines/respond-join", { request_id: id, approve });
      } else {
        await api.post("/associations/respond-join", { request_id: id, approve });
      }
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Action impossible");
    }
    setBusyId(null);
  };

  const respondRemoval = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await api.post("/governance/respond-removal", { request_id: id, approve });
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Action impossible");
    }
    setBusyId(null);
  };

  const deleteAssoc = (id: string, name: string) => {
    Alert.alert(
      "Supprimer l'association ?",
      `« ${name} » sera définitivement supprimée. Réservé à l'admin HODIX.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await api.post("/admin/associations/delete", {
                association_id: id,
                reason: "Non conforme / décision admin",
              });
              await load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.detail ?? "Suppression impossible");
            }
          },
        },
      ],
    );
  };

  const body = (
    <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100, gap: 14 }}>
      {!embed ? (
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.h1}>Tableau de gestion</Text>
      <Text style={styles.sub}>
        Pilotez vos tontines, associations et fonds — demandes d'adhésion et modules à la carte.
      </Text>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : totalOwned === 0 && !isPlatformAdmin ? (
        <Card>
          <EmptyState
            title="Aucune communauté créée"
            description="Créez une tontine, une association ou un fonds pour activer votre tableau de gestion."
          />
          <Button label="Créer maintenant" onPress={() => router.push("/(tabs)/groups" as any)} style={{ marginTop: 12 }} />
        </Card>
      ) : (
        <>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>
              Demandes d'adhésion {joinReqs.length > 0 ? `(${joinReqs.length})` : ""}
            </Text>
            {joinReqs.length === 0 ? (
              <Card>
                <Text style={{ color: Colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                  Aucune demande en attente. Quand quelqu'un demande à rejoindre une de vos tontines ou associations publiques, elle apparaîtra ici.
                </Text>
              </Card>
            ) : (
              joinReqs.map((r) => (
                <Card key={r.id} style={styles.reqCard}>
                  <Text style={styles.reqTitle}>{r.requester_name}</Text>
                  <Text style={styles.reqSub}>
                    → {r.group_type === "tontine"
                      ? (r.tontine_name ?? "Tontine")
                      : (r.association_name ?? "Association")}
                    {" · "}{r.group_type === "tontine" ? "Tontine" : "Association"}
                  </Text>
                  {r.message ? <Text style={styles.reqMsg}>{r.message}</Text> : null}
                  <View style={styles.reqActions}>
                    <TouchableOpacity
                      style={[styles.actBtn, styles.actOk]}
                      disabled={busyId === r.id}
                      onPress={() => respondJoin(r.id, true, r.group_type === "tontine" ? "tontine" : "association")}
                    >
                      <Check size={14} color="#fff" />
                      <Text style={styles.actText}>Accepter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actBtn, styles.actNo]}
                      disabled={busyId === r.id}
                      onPress={() => respondJoin(r.id, false, r.group_type === "tontine" ? "tontine" : "association")}
                    >
                      <X size={14} color="#fff" />
                      <Text style={styles.actText}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </View>

          {isPlatformAdmin && removals.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Exclusions à valider (admin)</Text>
              {removals.map((r) => (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.row}>
                    <ShieldAlert size={16} color={Colors.warning} />
                    <Text style={styles.reqTitle}>{r.target_name}</Text>
                  </View>
                  <Text style={styles.reqSub}>
                    {r.group_type} · demandé par {r.requester_name}
                  </Text>
                  <Text style={styles.reqMsg}>{r.reason}</Text>
                  <View style={styles.reqActions}>
                    <TouchableOpacity style={[styles.actBtn, styles.actOk]} onPress={() => respondRemoval(r.id, true)}>
                      <Text style={styles.actText}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, styles.actNo]} onPress={() => respondRemoval(r.id, false)}>
                      <Text style={styles.actText}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          <OwnedSection
            title="Mes tontines"
            icon={Users}
            color={Colors.primary}
            items={owned?.tontines ?? []}
            onOpen={(id) => router.push(`/tontines/${id}` as any)}
            onModules={(it) => { setModulesGroup(it); setModulesOpen(true); }}
          />
          <OwnedSection
            title="Mes associations"
            icon={Building2}
            color={Colors.secondary}
            items={owned?.associations ?? []}
            onOpen={(id) => router.push(`/associations/${id}` as any)}
            onModules={(it) => { setModulesGroup(it); setModulesOpen(true); }}
            onAdminDelete={isPlatformAdmin ? deleteAssoc : undefined}
            showPublic
          />
          <OwnedSection
            title="Mes coopératives"
            icon={Network}
            color={Colors.brandNavy}
            items={owned?.cooperatives ?? []}
            onOpen={(id) => router.push(`/cooperatives/${id}` as any)}
            onModules={(it) => { setModulesGroup(it); setModulesOpen(true); }}
          />
          <OwnedSection
            title="Mes fonds"
            icon={Landmark}
            color={Colors.accentDark}
            items={owned?.funds ?? []}
            onOpen={(id) => router.push(`/funds/${id}` as any)}
            onModules={(it) => { setModulesGroup(it); setModulesOpen(true); }}
          />

          <Card style={{ padding: 14, gap: 8 }}>
            <Text style={styles.blockTitle}>Modules association (centre de services)</Text>
            <Text style={styles.sub}>Activez à la carte depuis Paramètres de chaque communauté :</Text>
            <View style={styles.modGrid}>
              {ASSOC_MODULES.map((m) => (
                <View key={m} style={styles.modChip}>
                  <Text style={styles.modChipText}>{m}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );

  return (
    <>
      {embed ? body : (
        <SafeAreaView style={styles.safe} edges={["top"]}>{body}</SafeAreaView>
      )}
      <CommunityModulesSheet
        visible={modulesOpen}
        onClose={() => setModulesOpen(false)}
        groupId={modulesGroup?.id}
        groupName={modulesGroup?.name}
      />
    </>
  );
}

function OwnedSection({
  title, icon: Icon, color, items, onOpen, onModules, onAdminDelete, showPublic,
}: {
  title: string;
  icon: typeof Users;
  color: string;
  items: any[];
  onOpen: (id: string) => void;
  onModules: (it: { id: string; name: string }) => void;
  onAdminDelete?: (id: string, name: string) => void;
  showPublic?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Icon size={16} color={color} />
        <Text style={styles.blockTitle}>{title}</Text>
      </View>
      {items.map((it) => (
        <View key={it.id} style={[styles.item, Shadow.card]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpen(it.id)} activeOpacity={0.85}>
            <Text style={styles.itemName}>{it.name}</Text>
            <Text style={styles.itemMeta}>
              {it.members_count ?? 0} membres
              {it.invite_code ? ` · Code ${it.invite_code}` : ""}
              {showPublic ? (it.is_public ? " · Publique" : " · Privée") : ""}
              {it.contribution_amount != null ? ` · ${formatXAF(it.contribution_amount)}` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onModules({ id: it.id, name: it.name })} style={styles.iconBtn}>
            <Settings2 size={16} color={Colors.primary} />
          </TouchableOpacity>
          <ChevronRight size={16} color={Colors.textSubtle} />
          {onAdminDelete ? (
            <TouchableOpacity onPress={() => onAdminDelete(it.id, it.name)} style={styles.delBtn}>
              <Text style={styles.delText}>Suppr.</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Prompt manager to request admin removal (cannot delete members themselves). */
export function requestMemberRemovalPrompt(opts: {
  group_type: "tontine" | "association" | "cooperative";
  group_id: string;
  target_user_id: string;
  target_name: string;
}) {
  Alert.prompt?.(
    "Demander l'exclusion",
    `Seul l'admin HODIX peut retirer un membre. Expliquez pourquoi retirer ${opts.target_name} :`,
    async (reason) => {
      if (!reason || reason.trim().length < 5) {
        Alert.alert("Raison trop courte", "Minimum 5 caractères.");
        return;
      }
      try {
        await api.post("/governance/request-removal", {
          group_type: opts.group_type,
          group_id: opts.group_id,
          target_user_id: opts.target_user_id,
          reason: reason.trim(),
        });
        Alert.alert("Demande envoyée", "L'administration HODIX traitera votre demande.");
      } catch (e: any) {
        Alert.alert("Erreur", e?.detail ?? "Envoi impossible");
      }
    },
  );

  // Fallback for Android / web without Alert.prompt
  if (!Alert.prompt) {
    Alert.alert(
      "Demander l'exclusion",
      `Seul l'admin HODIX peut retirer ${opts.target_name}. Continuer avec une raison standard ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Envoyer",
          onPress: async () => {
            try {
              await api.post("/governance/request-removal", {
                group_type: opts.group_type,
                group_id: opts.group_id,
                target_user_id: opts.target_user_id,
                reason: "Membre non conforme / demande gestionnaire",
              });
              Alert.alert("Demande envoyée", "L'administration HODIX traitera votre demande.");
            } catch (e: any) {
              Alert.alert("Erreur", e?.detail ?? "Envoi impossible");
            }
          },
        },
      ],
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.secondary, fontWeight: "700", marginBottom: 8 },
  h1: { fontSize: 24, fontWeight: "900", color: Colors.brandNavy },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginTop: 4 },
  block: { gap: 8, marginTop: 8 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  blockTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  item: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  itemName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  itemMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  iconBtn: { padding: 6 },
  delBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.dangerLight, borderRadius: 8 },
  delText: { fontSize: 11, fontWeight: "800", color: Colors.danger },
  reqCard: { padding: 14, gap: 6 },
  reqTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  reqSub: { fontSize: 12, color: Colors.textMuted },
  reqMsg: { fontSize: 12, color: Colors.text, fontStyle: "italic" },
  reqActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full,
  },
  actOk: { backgroundColor: Colors.success },
  actNo: { backgroundColor: Colors.danger },
  actText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  modGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  modChip: {
    backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full,
  },
  modChipText: { fontSize: 11, fontWeight: "700", color: Colors.textMuted },
});
