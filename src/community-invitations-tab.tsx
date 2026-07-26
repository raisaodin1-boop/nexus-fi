import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell, Check, ChevronRight, Mail, MessageCircle, X } from "lucide-react-native";

import { api } from "@/src/api";
import { Card, EmptyState } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

const INVITE_TYPES = [
  "join_request",
  "join_request_sent",
  "invite",
  "invitation",
  "association_join_request",
  "tontine_join_request",
  "join_request_needs_info",
];

type Notif = {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  is_read?: boolean;
  created_at?: string;
  action_url?: string;
  metadata?: {
    tontine_id?: string;
    association_id?: string;
    requester_id?: string;
    request_id?: string;
    group_type?: string;
    action_url?: string;
  } | null;
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
  status?: string;
  owner_note?: string | null;
  created_at: string;
};

function resolveInviteUrl(n: Notif): string {
  const raw = n.action_url || n.metadata?.action_url || "";
  if (raw.includes("tab=manage") || n.type === "join_request" || n.type === "association_join_request") {
    return "/manage";
  }
  if (raw) return raw;
  if (n.metadata?.tontine_id) return `/tontines/${n.metadata.tontine_id}`;
  if (n.metadata?.association_id) return `/associations/${n.metadata.association_id}`;
  return "/manage";
}

export function CommunityInvitationsTab() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [joinReqs, setJoinReqs] = useState<JoinReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [infoText, setInfoText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, tontineJr, assocJr] = await Promise.all([
        api.get<{ items?: Notif[] }>("/notifications"),
        api.get<JoinReq[]>("/tontines/join-requests").catch(() => []),
        api.get<JoinReq[]>("/associations/join-requests").catch(() => []),
      ]);
      const invites = (data?.items ?? []).filter((n) =>
        INVITE_TYPES.includes(String(n.type ?? "")),
      );
      setItems(invites);
      const merged = [
        ...(tontineJr ?? []).map((r) => ({ ...r, group_type: "tontine" as const })),
        ...(assocJr ?? []).map((r) => ({ ...r, group_type: "association" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setJoinReqs(merged);
    } catch {
      setItems([]);
      setJoinReqs([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respondJoin = async (id: string, approve: boolean, groupType: "tontine" | "association") => {
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

  const askInfo = async (id: string) => {
    const note = infoText.trim();
    if (!note) {
      Alert.alert("Message requis", "Indiquez ce que vous voulez savoir au membre.");
      return;
    }
    setBusyId(id);
    try {
      await api.post("/tontines/request-join-info", { request_id: id, message: note });
      setInfoFor(null);
      setInfoText("");
      Alert.alert("Envoyé", "Le membre a été informé. La demande reste en attente.");
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.detail ?? "Action impossible");
    }
    setBusyId(null);
  };

  if (loading) {
    return <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />;
  }

  if (joinReqs.length === 0 && items.length === 0) {
    return (
      <View style={{ paddingHorizontal: Spacing.xl, marginTop: 12 }}>
        <Card>
          <EmptyState
            title="Aucune invitation"
            description="Quand quelqu'un demande à rejoindre votre groupe, vous pourrez accepter, refuser ou demander plus d'infos ici."
            icon={<Mail color={Colors.textMuted} size={28} />}
          />
        </Card>
        <TouchableOpacity
          style={styles.joinLink}
          onPress={() => router.push("/tontines/join" as any)}
        >
          <Text style={styles.joinLinkText}>J'ai un code d'invitation →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: Spacing.xl, gap: 10, paddingBottom: 24 }}>
      {joinReqs.length > 0 ? (
        <>
          <Text style={styles.hint}>Demandes à traiter ({joinReqs.length})</Text>
          {joinReqs.map((r) => (
            <View key={r.id} style={[styles.row, Shadow.card, styles.reqCard]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{r.requester_name}</Text>
                <Text style={styles.body}>
                  → {r.group_type === "tontine" ? (r.tontine_name ?? "Tontine") : (r.association_name ?? "Association")}
                  {r.status === "needs_info" ? " · En attente d'infos" : ""}
                </Text>
                {r.message ? <Text style={styles.body}>Message : {r.message}</Text> : null}
                {r.owner_note ? <Text style={styles.note}>Infos demandées : {r.owner_note}</Text> : null}

                {infoFor === r.id ? (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: précisez votre quartier / numéro WhatsApp…"
                      placeholderTextColor={Colors.textSubtle}
                      value={infoText}
                      onChangeText={setInfoText}
                      multiline
                    />
                    <View style={styles.reqActions}>
                      <TouchableOpacity
                        style={[styles.actBtn, styles.actOk]}
                        disabled={busyId === r.id}
                        onPress={() => askInfo(r.id)}
                      >
                        <Text style={styles.actText}>Envoyer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actBtn, styles.actMuted]}
                        onPress={() => { setInfoFor(null); setInfoText(""); }}
                      >
                        <Text style={styles.actText}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
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
                    {r.group_type === "tontine" ? (
                      <TouchableOpacity
                        style={[styles.actBtn, styles.actInfo]}
                        disabled={busyId === r.id}
                        onPress={() => { setInfoFor(r.id); setInfoText(""); }}
                      >
                        <MessageCircle size={14} color="#fff" />
                        <Text style={styles.actText}>Infos</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {items.length > 0 ? (
        <>
          <Text style={styles.hint}>Historique notifications ({items.length})</Text>
          {items.map((n) => (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.88}
              style={[styles.row, Shadow.card, !n.is_read && styles.rowUnread]}
              onPress={() => router.push(resolveInviteUrl(n) as any)}
            >
              <View style={styles.icon}>
                <Bell color={Colors.warning} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{n.title}</Text>
                {n.body ? <Text style={styles.body} numberOfLines={2}>{n.body}</Text> : null}
              </View>
              <ChevronRight color={Colors.textSubtle} size={16} />
            </TouchableOpacity>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: Colors.textMuted, fontWeight: "600", marginBottom: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  reqCard: { alignItems: "stretch" },
  rowUnread: { borderColor: Colors.warning, backgroundColor: Colors.warningLight },
  icon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.warningLight, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "800", color: Colors.text },
  body: { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  note: { fontSize: 12, color: Colors.secondary, marginTop: 2, fontWeight: "600" },
  joinLink: { marginTop: 16, alignItems: "center" },
  joinLinkText: { fontSize: 14, fontWeight: "700", color: Colors.secondary },
  reqActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  actOk: { backgroundColor: Colors.accent },
  actNo: { backgroundColor: Colors.danger },
  actInfo: { backgroundColor: Colors.secondary },
  actMuted: { backgroundColor: Colors.textMuted },
  actText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 10, minHeight: 64, color: Colors.text, backgroundColor: Colors.bg,
    textAlignVertical: "top",
  },
});
