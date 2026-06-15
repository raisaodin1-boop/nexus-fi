import React, { useEffect, useState } from "react";
import {
  Alert, FlatList, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Plus, Receipt, Trash2, Users } from "lucide-react-native";

import {
  type SplitExpense, type SplitParticipant,
  createSplitExpense, listSplitExpenses, markParticipantPaid,
  deleteSplitExpense, getSplitSummary, splitEqually,
} from "@/src/db/split-expense";
import { useAuth } from "@/src/auth-context";
import { Colors, Radius, Spacing } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { useToast } from "@/src/toast";
import { formatXAFAmount } from "@/src/exchange-rates";

interface TempParticipant { name: string; phone: string; amount_owed: string }

export default function SplitExpenseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();

  const [splits, setSplits] = useState<SplitExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Form
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [note, setNote] = useState("");
  const [participants, setParticipants] = useState<TempParticipant[]>([
    { name: "", phone: "", amount_owed: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await listSplitExpenses(user.id);
      setSplits(data);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const distributeEqually = () => {
    const total = Number(totalAmount);
    if (!total || participants.length === 0) return;
    const amounts = splitEqually(total, participants.length);
    setParticipants(prev => prev.map((p, i) => ({ ...p, amount_owed: String(amounts[i]) })));
  };

  const addParticipant = () => setParticipants(prev => [...prev, { name: "", phone: "", amount_owed: "" }]);
  const removeParticipant = (i: number) => setParticipants(prev => prev.filter((_, idx) => idx !== i));
  const updateParticipant = (i: number, field: keyof TempParticipant, val: string) =>
    setParticipants(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const handleCreate = async () => {
    if (!user) return;
    const total = Number(totalAmount);
    if (!title.trim()) { show("Titre requis", "error"); return; }
    if (!total || total <= 0) { show("Montant invalide", "error"); return; }
    const invalid = participants.find(p => !p.name.trim() || !Number(p.amount_owed));
    if (invalid) { show("Remplissez tous les participants", "error"); return; }

    setSaving(true);
    try {
      await createSplitExpense({
        title: title.trim(),
        total_amount: total,
        created_by_id: user.id,
        created_by_name: user.full_name,
        note: note.trim() || undefined,
        participants: participants.map(p => ({
          user_id: `temp_${Math.random().toString(36).slice(2)}`,
          name: p.name.trim(),
          phone: p.phone.trim() || undefined,
          amount_owed: Number(p.amount_owed),
        })),
      });
      show("Partage créé ✓", "success");
      setShowForm(false);
      setTitle(""); setTotalAmount(""); setNote("");
      setParticipants([{ name: "", phone: "", amount_owed: "" }]);
      await load();
    } catch (e: any) {
      show(e?.message ?? "Erreur", "error");
    }
    setSaving(false);
  };

  const handleMarkPaid = async (splitId: string, participant: SplitParticipant) => {
    if (participant.paid) return;
    Alert.alert("Confirmer", `Marquer ${participant.name} comme ayant payé ${formatXAFAmount(participant.amount_owed)} ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Confirmer", onPress: async () => {
        try {
          await markParticipantPaid(splitId, participant.user_id);
          await load();
          show("Remboursement enregistré ✓", "success");
        } catch { show("Erreur", "error"); }
      }},
    ]);
  };

  const handleDelete = (split: SplitExpense) => {
    Alert.alert("Supprimer", `Supprimer « ${split.title} » ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        await deleteSplitExpense(split.id);
        await load();
      }},
    ]);
  };

  const activeSplit = splits.find(s => s.id === activeId);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Partage de dépenses</Text>
            <Text style={s.subtitle}>Divisez vos factures en groupe</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(!showForm)} style={s.addBtn}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Form */}
        {showForm && (
          <View style={s.form}>
            <Text style={s.formTitle}>Nouvelle dépense partagée</Text>
            <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Repas de groupe, Voyage, ..." />
            <Field label="Montant total (FCFA)" value={totalAmount} onChangeText={setTotalAmount} keyboardType="numeric" placeholder="25 000" />
            <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Description..." />

            <View style={s.participantsHeader}>
              <Text style={s.label}>Participants ({participants.length})</Text>
              <TouchableOpacity onPress={distributeEqually} style={s.splitEqBtn}>
                <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: "600" }}>Répartir équitablement</Text>
              </TouchableOpacity>
            </View>

            {participants.map((p, i) => (
              <View key={i} style={s.participantRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Field label={`Nom ${i + 1}`} value={p.name} onChangeText={v => updateParticipant(i, "name", v)} placeholder="Nom du participant" />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Téléphone" value={p.phone} onChangeText={v => updateParticipant(i, "phone", v)} keyboardType="phone-pad" placeholder="+237..." />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Montant (FCFA)" value={p.amount_owed} onChangeText={v => updateParticipant(i, "amount_owed", v)} keyboardType="numeric" placeholder="5 000" />
                    </View>
                  </View>
                </View>
                {participants.length > 1 && (
                  <TouchableOpacity onPress={() => removeParticipant(i)} style={{ padding: 8, marginTop: 20 }}>
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity onPress={addParticipant} style={s.addParticipantBtn}>
              <Plus size={14} color={Colors.primary} />
              <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "600" }}>Ajouter un participant</Text>
            </TouchableOpacity>

            <View style={s.formActions}>
              <Button label="Annuler" variant="ghost" onPress={() => setShowForm(false)} style={{ flex: 1 }} />
              <Button label={saving ? "..." : "Créer"} onPress={handleCreate} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {/* Split detail */}
        {activeSplit && (
          <View style={s.detail}>
            <View style={s.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.detailTitle}>{activeSplit.title}</Text>
                {activeSplit.note ? <Text style={s.detailNote}>{activeSplit.note}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setActiveId(null)}>
                <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Fermer</Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const sum = getSplitSummary(activeSplit);
              return (
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${sum.percent}%` as any }]} />
                </View>
              );
            })()}
            {activeSplit.participants.map(p => (
              <TouchableOpacity
                key={p.user_id}
                style={[s.pRow, p.paid && s.pRowPaid]}
                onPress={() => handleMarkPaid(activeSplit.id, p)}
              >
                <View style={[s.pAvatar, { backgroundColor: p.paid ? "#10B981" : Colors.primary + "22" }]}>
                  {p.paid ? <Check size={14} color="#fff" /> : <Text style={{ fontSize: 12, color: Colors.primary }}>{p.name[0]?.toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pName}>{p.name}</Text>
                  {p.phone ? <Text style={s.pPhone}>{p.phone}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.pAmount, { color: p.paid ? "#10B981" : Colors.text }]}>
                    {formatXAFAmount(p.amount_owed)}
                  </Text>
                  <Text style={{ fontSize: 11, color: p.paid ? "#10B981" : "#EF4444", fontWeight: "600" }}>
                    {p.paid ? "Payé ✓" : "En attente"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* List */}
        {splits.length === 0 && !showForm ? (
          <View style={s.empty}>
            <Receipt size={40} color={Colors.primary} />
            <Text style={s.emptyTitle}>Aucun partage</Text>
            <Text style={s.emptyText}>Divisez une facture ou un repas entre amis et suivez les remboursements.</Text>
            <Button label="Créer un partage" onPress={() => setShowForm(true)} style={{ marginTop: 16 }} />
          </View>
        ) : (
          splits.map(split => {
            const sum = getSplitSummary(split);
            return (
              <TouchableOpacity key={split.id} style={s.card} onPress={() => setActiveId(split.id === activeId ? null : split.id)}>
                <View style={s.cardTop}>
                  <View style={s.splitIcon}>
                    <Users size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{split.title}</Text>
                    <Text style={s.cardSub}>{split.participants.length} participants · {new Date(split.created_at).toLocaleDateString("fr-FR")}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.cardTotal}>{formatXAFAmount(split.total_amount)}</Text>
                    <View style={[s.badge, { backgroundColor: split.is_settled ? "#10B98122" : "#F59E0B22" }]}>
                      <Text style={{ fontSize: 10, color: split.is_settled ? "#10B981" : "#F59E0B", fontWeight: "700" }}>
                        {split.is_settled ? "Soldé" : `${sum.paid}/${sum.total} payé`}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${sum.percent}%` as any }]} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.cardSub}>Collecté : {formatXAFAmount(sum.collected)}</Text>
                  {sum.remaining > 0 && <Text style={[s.cardSub, { color: "#EF4444" }]}>Reste : {formatXAFAmount(sum.remaining)}</Text>}
                  <TouchableOpacity onPress={() => handleDelete(split)}>
                    <Trash2 size={14} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 20, padding: 8 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20 },
  card: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  splitIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardTotal: { fontSize: 15, fontWeight: "700", color: Colors.text },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  progressBar: { height: 5, backgroundColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, backgroundColor: Colors.primary, borderRadius: 3 },
  form: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  participantsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  splitEqBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  participantRow: { flexDirection: "row", gap: 4, borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 8 },
  addParticipantBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  formActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  detail: { backgroundColor: "#fff", borderRadius: Radius.lg, padding: Spacing.md, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  detailHeader: { flexDirection: "row", alignItems: "flex-start" },
  detailTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  detailNote: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  pRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  pRowPaid: { opacity: 0.7 },
  pAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  pPhone: { fontSize: 12, color: Colors.textMuted },
  pAmount: { fontSize: 14, fontWeight: "700" },
});
