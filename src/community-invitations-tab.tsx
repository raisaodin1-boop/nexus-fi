import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell, ChevronRight, Mail } from "lucide-react-native";

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
];

type Notif = {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  is_read?: boolean;
  created_at?: string;
  metadata?: {
    tontine_id?: string;
    association_id?: string;
    requester_id?: string;
  } | null;
};

export function CommunityInvitationsTab() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items?: Notif[] }>("/notifications");
      const invites = (data?.items ?? []).filter((n) =>
        INVITE_TYPES.includes(String(n.type ?? "")),
      );
      setItems(invites);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />;
  }

  if (items.length === 0) {
    return (
      <View style={{ paddingHorizontal: Spacing.xl, marginTop: 12 }}>
        <Card>
          <EmptyState
            title="Aucune invitation"
            description="Quand quelqu'un vous invite ou demande à rejoindre votre groupe, cela apparaîtra ici."
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
      <Text style={styles.hint}>{items.length} invitation(s) récente(s)</Text>
      {items.map((n) => (
        <TouchableOpacity
          key={n.id}
          activeOpacity={0.88}
          style={[styles.row, Shadow.card, !n.is_read && styles.rowUnread]}
          onPress={() => {
            const tid = n.metadata?.tontine_id;
            const aid = n.metadata?.association_id;
            if (tid) router.push(`/tontines/${tid}` as any);
            else if (aid) router.push(`/associations/${aid}` as any);
            else router.push("/manage" as any);
          }}
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
  rowUnread: { borderColor: Colors.warning, backgroundColor: Colors.warningLight },
  icon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.warningLight, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "800", color: Colors.text },
  body: { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  joinLink: { marginTop: 16, alignItems: "center" },
  joinLinkText: { fontSize: 14, fontWeight: "700", color: Colors.secondary },
});
