// Messagerie interne HODIX — membre ↔ admin, propriétaire ↔ membres tontine
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send, MessageCircle, Users, Shield } from "lucide-react-native";

import { Colors, Radius, Spacing, Shadow } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  tontine_id: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
}

interface Conversation {
  admin_thread: boolean;
  tontines: { id: string; name: string }[];
}

type ThreadType = "admin" | "tontine";

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tontine_id?: string; tontine_name?: string }>();

  const [conversations, setConversations] = useState<Conversation | null>(null);
  const [activeThread, setActiveThread] = useState<{ type: ThreadType; id?: string; name: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Conversation>("/messages/conversations");
        setConversations(data);
        // Auto-open thread from params
        if (params.tontine_id) {
          openThread({ type: "tontine", id: params.tontine_id, name: params.tontine_name ?? "Tontine" });
        }
      } catch {}
      setLoadingConv(false);
    })();
  }, []);

  const openThread = useCallback(async (thread: { type: ThreadType; id?: string; name: string }) => {
    setActiveThread(thread);
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const path = thread.type === "admin" ? "/messages/admin" : `/messages/tontine/${thread.id}`;
      const data = await api.get<Message[]>(path);
      setMessages(data);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
    setLoadingMsgs(false);
  }, []);

  const sendMsg = async () => {
    if (!text.trim() || !activeThread) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      const body: any = { content };
      if (activeThread.type === "tontine") body.tontine_id = activeThread.id;
      // For admin thread: no recipient_id (admin reads via admin panel)
      await api.post("/messages", body);
      // Refresh
      const path = activeThread.type === "admin" ? "/messages/admin" : `/messages/tontine/${activeThread.id}`;
      const data = await api.get<Message[]>(path);
      setMessages(data);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {}
    setSending(false);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const isMe = (msg: Message) => msg.sender_id === user?.id;

  // ── Thread view ──────────────────────────────────────────────
  if (activeThread) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <LinearGradient colors={["#0D0F1A", "#1A1B2E"]} style={styles.threadHeader}>
          <TouchableOpacity onPress={() => setActiveThread(null)} style={styles.iconBtn}>
            <ArrowLeft color="#fff" size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {activeThread.type === "admin"
                ? <Shield color={Colors.accent} size={14} />
                : <Users color={Colors.primary} size={14} />}
              <Text style={styles.threadName} numberOfLines={1}>{activeThread.name}</Text>
            </View>
            <Text style={styles.threadSub}>
              {activeThread.type === "admin" ? "Support & Administration" : "Groupe de cotisation"}
            </Text>
          </View>
        </LinearGradient>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          {loadingMsgs ? (
            <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: messages.length === 0 ? "center" : "flex-start" }}
              ListEmptyComponent={
                <View style={styles.emptyThread}>
                  <MessageCircle color={Colors.textSubtle} size={36} />
                  <Text style={styles.emptyThreadText}>Démarrez la conversation…</Text>
                </View>
              }
              renderItem={({ item }) => {
                const mine = isMe(item);
                return (
                  <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                    {!mine && item.sender_name ? (
                      <Text style={styles.bubbleSender}>{item.sender_name}</Text>
                    ) : null}
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMe]}>{item.content}</Text>
                    <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMe]}>{formatTime(item.created_at)}</Text>
                  </View>
                );
              }}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              value={text}
              onChangeText={setText}
              placeholder="Écrire un message…"
              placeholderTextColor={Colors.textSubtle}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMsg}
              disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={18} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Conversation list ────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={["#0D0F1A", "#1A1B2E"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color="#fff" size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messagerie</Text>
      </LinearGradient>

      {loadingConv ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={styles.sectionLabel}>Support</Text>
          <TouchableOpacity style={styles.convRow} onPress={() => openThread({ type: "admin", name: "Administration HODIX" })}>
            <View style={[styles.convIcon, { backgroundColor: Colors.accent + "20" }]}>
              <Shield color={Colors.accent} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.convName}>Administration HODIX</Text>
              <Text style={styles.convSub}>Questions, signalements, support</Text>
            </View>
          </TouchableOpacity>

          {(conversations?.tontines ?? []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Mes tontines</Text>
              {(conversations?.tontines ?? []).map(t => (
                <TouchableOpacity key={t.id} style={styles.convRow} onPress={() => openThread({ type: "tontine", id: t.id, name: t.name })}>
                  <View style={[styles.convIcon, { backgroundColor: Colors.primary + "20" }]}>
                    <Users color={Colors.primary} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.convName}>{t.name}</Text>
                    <Text style={styles.convSub}>Groupe de cotisation</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {(conversations?.tontines ?? []).length === 0 && (
            <View style={styles.emptyBox}>
              <MessageCircle color={Colors.textSubtle} size={32} />
              <Text style={styles.emptyTitle}>Pas encore de tontines</Text>
              <Text style={styles.emptyText}>Rejoignez ou créez une tontine pour accéder à la messagerie de groupe.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: Spacing.xl, paddingTop: 20, paddingBottom: 8 },
  convRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: Spacing.xl, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  convIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  convName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  convSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: "500" },

  emptyBox: { margin: Spacing.xl, padding: 32, alignItems: "center", gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { color: Colors.text, fontWeight: "800", fontSize: 15 },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  // Thread
  threadHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  threadName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  threadSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600", marginTop: 1 },

  bubble: { maxWidth: "78%", padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: "flex-start", backgroundColor: Colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  bubbleSender: { fontSize: 11, fontWeight: "700", color: Colors.primary, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: Colors.textSubtle, marginTop: 4, textAlign: "right" },
  bubbleTimeMe: { color: "rgba(255,255,255,0.6)" },

  emptyThread: { alignItems: "center", gap: 10 },
  emptyThreadText: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },

  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, paddingBottom: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  msgInput: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: Colors.text, maxHeight: 120, borderWidth: 1, borderColor: Colors.border, outlineStyle: "none" } as any,
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.4 },
});
