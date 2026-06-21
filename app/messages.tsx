// Messagerie HODIX — direct, admin, tontines, annonces publicitaires
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Send,
  MessageCircle,
  Users,
  Shield,
  Megaphone,
  Plus,
  Search,
  X,
} from "lucide-react-native";

import { Colors, Radius, Spacing } from "@/src/theme";
import { api } from "@/src/api";
import { supabase } from "@/src/supabase";
import { useAuth } from "@/src/auth-context";
import { VerifiedName } from "@/src/verified-name";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  tontine_id: string | null;
  message_type: string;
  title?: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
}

interface ConversationItem {
  id: string;
  type: "direct" | "tontine" | "broadcast";
  name: string;
  subtitle?: string;
  peer_id?: string;
  tontine_id?: string;
  last_message?: string;
  last_at?: string;
  unread_count: number;
  is_admin?: boolean;
}

interface RecipientSuggestion {
  id: string;
  full_name: string;
  kyc_verified?: boolean;
  role: string;
  is_admin: boolean;
  subtitle: string;
}

type ActiveThread = {
  type: "direct" | "tontine" | "broadcast";
  id?: string;
  peer_id?: string;
  name: string;
};

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tontine_id?: string; tontine_name?: string; peer_id?: string; peer_name?: string }>();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatRef = useRef<FlatList>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get<{ items: ConversationItem[] }>("/messages/conversations");
      setConversations(data.items ?? []);
    } catch {
      setConversations([]);
    }
    setLoadingConv(false);
  }, []);

  const messagesPath = useCallback((thread: ActiveThread) => {
    if (thread.type === "broadcast") return "/messages/broadcast";
    if (thread.type === "tontine" && thread.id) return `/messages/tontine/${thread.id}`;
    if (thread.type === "direct" && thread.peer_id) return `/messages/direct/${thread.peer_id}`;
    return "/messages/admin";
  }, []);

  const markThreadRead = useCallback(async (thread: ActiveThread) => {
    try {
      await api.post("/messages/thread/read", {
        thread_type: thread.type,
        peer_id: thread.peer_id,
        tontine_id: thread.id,
      });
      loadConversations();
    } catch {}
  }, [loadConversations]);

  const loadMessages = useCallback(async (thread: ActiveThread) => {
    setLoadingMsgs(true);
    try {
      const data = await api.get<Message[]>(messagesPath(thread));
      setMessages(data);
      await markThreadRead(thread);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
    } catch {
      setMessages([]);
    }
    setLoadingMsgs(false);
  }, [markThreadRead, messagesPath]);

  const openThread = useCallback((thread: ActiveThread) => {
    setActiveThread(thread);
    setShowCompose(false);
    loadMessages(thread);
  }, [loadMessages]);

  useEffect(() => {
    loadConversations();
    if (params.tontine_id) {
      openThread({ type: "tontine", id: params.tontine_id, name: params.tontine_name ?? "Tontine" });
    } else if (params.peer_id) {
      openThread({ type: "direct", peer_id: params.peer_id, name: params.peer_name ?? "Membre" });
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`rt-messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        loadConversations();
        if (activeThread) loadMessages(activeThread);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, activeThread, loadConversations, loadMessages]);

  useEffect(() => {
    if (!showCompose) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<RecipientSuggestion[]>(`/messages/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
      setSearching(false);
    }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, showCompose]);

  const sendMsg = async () => {
    if (!text.trim() || !activeThread) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      const body: Record<string, string> = { content };
      if (activeThread.type === "tontine" && activeThread.id) body.tontine_id = activeThread.id;
      if (activeThread.type === "direct" && activeThread.peer_id) body.recipient_id = activeThread.peer_id;
      await api.post("/messages", body);
      await loadMessages(activeThread);
      loadConversations();
    } catch {}
    setSending(false);
  };

  const startDirectChat = (recipient: RecipientSuggestion) => {
    setShowCompose(false);
    setSearchQuery("");
    setSuggestions([]);
    openThread({ type: "direct", peer_id: recipient.id, name: recipient.full_name });
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return "";
    }
  };

  const formatRelative = (iso?: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "À l'instant";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
    return formatTime(iso);
  };

  const isMe = (msg: Message) => msg.sender_id === user?.id;

  const threadIcon = (type: string, isAdmin?: boolean) => {
    if (type === "broadcast") return <Megaphone color={Colors.secondary} size={22} />;
    if (type === "tontine") return <Users color={Colors.primary} size={22} />;
    if (isAdmin) return <Shield color={Colors.accent} size={22} />;
    return <MessageCircle color={Colors.primary} size={22} />;
  };

  const threadIconBg = (type: string, isAdmin?: boolean) => {
    if (type === "broadcast") return Colors.secondary + "20";
    if (type === "tontine") return Colors.primary + "20";
    if (isAdmin) return Colors.accent + "20";
    return Colors.primaryLight;
  };

  // ── Thread view ──────────────────────────────────────────────
  if (activeThread) {
    const canSend = activeThread.type !== "broadcast";
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <LinearGradient colors={["#0D0F1A", "#1A1B2E"]} style={styles.threadHeader}>
          <TouchableOpacity onPress={() => { setActiveThread(null); loadConversations(); }} style={styles.iconBtn}>
            <ArrowLeft color="#fff" size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {threadIcon(activeThread.type, activeThread.name.includes("Admin"))}
              <Text style={styles.threadName} numberOfLines={1}>{activeThread.name}</Text>
            </View>
            <Text style={styles.threadSub}>
              {activeThread.type === "broadcast"
                ? "Annonces & promotions HODIX"
                : activeThread.type === "tontine"
                  ? "Groupe de cotisation"
                  : "Message privé"}
            </Text>
          </View>
        </LinearGradient>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          {loadingMsgs ? (
            <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 8,
                flexGrow: 1,
                justifyContent: messages.length === 0 ? "center" : "flex-start",
              }}
              ListEmptyComponent={
                <View style={styles.emptyThread}>
                  <MessageCircle color={Colors.textSubtle} size={36} />
                  <Text style={styles.emptyThreadText}>
                    {activeThread.type === "broadcast" ? "Aucune annonce pour le moment" : "Démarrez la conversation…"}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const mine = isMe(item);
                const isBroadcast = item.message_type === "broadcast";
                return (
                  <View style={[styles.bubble, mine ? styles.bubbleMe : isBroadcast ? styles.bubbleBroadcast : styles.bubbleThem]}>
                    {isBroadcast && item.title ? (
                      <Text style={styles.broadcastTitle}>{item.title}</Text>
                    ) : null}
                    {!mine && item.sender_name && !isBroadcast ? (
                      <Text style={styles.bubbleSender}>{item.sender_name}</Text>
                    ) : null}
                    <Text style={[styles.bubbleText, (mine || isBroadcast) && styles.bubbleTextMe]}>{item.content}</Text>
                    <Text style={[styles.bubbleTime, (mine || isBroadcast) && styles.bubbleTimeMe]}>{formatTime(item.created_at)}</Text>
                  </View>
                );
              }}
            />
          )}

          {canSend ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.msgInput}
                value={text}
                onChangeText={setText}
                placeholder="Écrire un message…"
                placeholderTextColor={Colors.textSubtle}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={sendMsg}
                disabled={!text.trim() || sending}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={18} />}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.readOnlyBar}>
              <Megaphone color={Colors.textMuted} size={16} />
              <Text style={styles.readOnlyText}>Canal en lecture seule — réservé à l'administration</Text>
            </View>
          )}
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
        <TouchableOpacity onPress={() => setShowCompose(true)} style={styles.iconBtn}>
          <Plus color="#fff" size={20} />
        </TouchableOpacity>
      </LinearGradient>

      {showCompose ? (
        <View style={styles.composePanel}>
          <View style={styles.composeHeader}>
            <Text style={styles.composeTitle}>Nouveau message</Text>
            <TouchableOpacity onPress={() => { setShowCompose(false); setSearchQuery(""); setSuggestions([]); }}>
              <X color={Colors.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <Search color={Colors.textMuted} size={18} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tapez un nom (ex: adm pour les admins)…"
              placeholderTextColor={Colors.textSubtle}
              autoFocus
            />
            {searching ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
          </View>
          <Text style={styles.searchHint}>Astuce : tapez « adm » pour voir les administrateurs</Text>
          <FlatList
            data={suggestions}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              searchQuery.trim().length > 0 && !searching ? (
                <Text style={styles.noResults}>Aucun membre trouvé</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionRow} onPress={() => startDirectChat(item)}>
                <View style={[styles.convIcon, { backgroundColor: item.is_admin ? Colors.accent + "20" : Colors.primaryLight }]}>
                  {item.is_admin ? <Shield color={Colors.accent} size={20} /> : <MessageCircle color={Colors.primary} size={20} />}
                </View>
                <View style={{ flex: 1 }}>
                  <VerifiedName name={item.full_name} kycVerified={item.kyc_verified} style={styles.convName} />
                  <Text style={styles.convSub}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {loadingConv ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MessageCircle color={Colors.textSubtle} size={32} />
              <Text style={styles.emptyTitle}>Aucune conversation</Text>
              <Text style={styles.emptyText}>Appuyez sur + pour envoyer un message à un membre ou un admin.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convRow}
              onPress={() => openThread({
                type: item.type,
                id: item.tontine_id,
                peer_id: item.peer_id,
                name: item.name,
              })}
            >
              <View style={[styles.convIcon, { backgroundColor: threadIconBg(item.type, item.is_admin) }]}>
                {threadIcon(item.type, item.is_admin)}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.convTitleRow}>
                  <Text style={styles.convName} numberOfLines={1}>{item.name}</Text>
                  {item.last_at ? <Text style={styles.convTime}>{formatRelative(item.last_at)}</Text> : null}
                </View>
                {item.subtitle ? <Text style={styles.convSub}>{item.subtitle}</Text> : null}
                {item.last_message ? (
                  <Text style={styles.convPreview} numberOfLines={1}>{item.last_message}</Text>
                ) : null}
              </View>
              {item.unread_count > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unread_count > 9 ? "9+" : item.unread_count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  composePanel: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 360,
  },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: 14,
    paddingBottom: 8,
  },
  composeTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: Spacing.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, outlineStyle: "none" } as any,
  searchHint: {
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.xl,
    paddingTop: 6,
    paddingBottom: 4,
    fontWeight: "600",
  },
  noResults: { textAlign: "center", color: Colors.textMuted, padding: 20, fontSize: 13 },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },

  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  convIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  convTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  convName: { fontSize: 15, fontWeight: "800", color: Colors.text, flex: 1 },
  convSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: "500" },
  convPreview: { fontSize: 13, color: Colors.textSubtle, marginTop: 4 },
  convTime: { fontSize: 11, color: Colors.textSubtle, fontWeight: "600" },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  emptyBox: {
    margin: Spacing.xl,
    padding: 32,
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { color: Colors.text, fontWeight: "800", fontSize: 15 },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  threadName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  threadSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600", marginTop: 1 },

  bubble: { maxWidth: "82%", padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleBroadcast: {
    alignSelf: "center",
    width: "92%",
    backgroundColor: Colors.brandNavy,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  broadcastTitle: { fontSize: 13, fontWeight: "900", color: Colors.accent, marginBottom: 6 },
  bubbleSender: { fontSize: 11, fontWeight: "700", color: Colors.primary, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: Colors.textSubtle, marginTop: 4, textAlign: "right" },
  bubbleTimeMe: { color: "rgba(255,255,255,0.6)" },

  emptyThread: { alignItems: "center", gap: 10 },
  emptyThreadText: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  msgInput: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: Radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
    outlineStyle: "none",
  } as any,
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },

  readOnlyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: Colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  readOnlyText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", flex: 1 },
});
