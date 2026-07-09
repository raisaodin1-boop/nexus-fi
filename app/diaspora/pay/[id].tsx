import { useCallback, useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Building2, Smartphone } from "lucide-react-native";

import { api, ApiError, formatXAF } from "@/src/api";
import type { DiasporaRequest } from "@/src/db/diaspora";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { useAuth } from "@/src/auth-context";
import {
  CopyRow, DiasporaManualBanner, DiasporaStatusBadge,
} from "@/src/diaspora-ui";
import {
  DIASPORA_BANK, DIASPORA_BRAND, DIASPORA_MOMO,
} from "@/src/diaspora-config";
import { convert, getRates, type Currency } from "@/src/exchange-rates";

type Method = "mtn_momo" | "orange_money" | "bank_transfer";

import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";

export default function DiasporaPayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { checking } = useDiasporaGuard();
  const { show } = useToast();
  const { user } = useAuth();
  const [req, setReq] = useState<DiasporaRequest | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [payerType, setPayerType] = useState<"self" | "relative">("self");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerRelation, setPayerRelation] = useState("");
  const [transferCurrency, setTransferCurrency] = useState<Currency>("EUR");
  const [indicativeEur, setIndicativeEur] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<DiasporaRequest>(`/diaspora/requests/${id}`);
      setReq(data);
    } catch {
      show("Cotisation introuvable", "error");
      router.back();
    }
  }, [id, router, show]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!req) return;
    getRates().then((r) => {
      const converted = convert(req.amount_expected, "XAF", transferCurrency, r);
      setIndicativeEur(converted);
    }).catch(() => setIndicativeEur(null));
  }, [req, transferCurrency]);

  const confirmDeposit = async () => {
    if (!req || !method) { show("Choisissez une méthode de paiement", "error"); return; }
    if (payerType === "relative" && !payerName.trim()) {
      show("Indiquez le nom du payeur", "error"); return;
    }
    setLoading(true);
    try {
      await api.post(`/diaspora/requests/${req.id}/payment-started`, {
        payment_method: method,
        payer_type: payerType,
        payer_name: payerType === "relative" ? payerName.trim() : user?.full_name,
        payer_phone: payerPhone.trim() || undefined,
        payer_relation: payerRelation.trim() || undefined,
        declared_amount: req.amount_expected,
        declared_currency: req.currency,
      });
      router.push(`/diaspora/proof/${req.id}` as any);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Erreur", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!req) return checking ? (
    <SafeAreaView style={styles.safe}><DiasporaGuardSpinner checking={checking} /></SafeAreaView>
  ) : null;

  const momo = method === "orange_money" ? DIASPORA_MOMO.orange : DIASPORA_MOMO.mtn;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={Colors.text} size={22} /></TouchableOpacity>
        <Text style={styles.title}>Payer ma cotisation</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <DiasporaManualBanner />

        <Card>
          <Text style={styles.label}>Tontine</Text>
          <Text style={styles.value}>{req.tontine_name}</Text>
          <Text style={styles.amount}>{formatXAF(req.amount_expected)}</Text>
          {req.due_date ? (
            <Text style={styles.meta}>Échéance : {new Date(req.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</Text>
          ) : null}
          <CopyRow label="Référence obligatoire" value={req.reference_code} />
          <Text style={styles.member}>Membre : {user?.full_name}</Text>
          <DiasporaStatusBadge status={req.status} />
        </Card>

        <Text style={styles.section}>Choisissez votre méthode</Text>

        <MethodCard
          icon={Smartphone}
          title="Dépôt Mobile Money via HODIX"
          desc="Dépôt MTN ou Orange Money local — puis preuve pour validation."
          active={method === "mtn_momo" || method === "orange_money"}
          onPress={() => setMethod("mtn_momo")}
        />
        <MethodCard
          icon={Building2}
          title="Virement bancaire vers HODIX"
          desc="Virement vers le compte officiel YORIX DIGITAL GROUP SARL."
          active={method === "bank_transfer"}
          onPress={() => setMethod("bank_transfer")}
        />

        {(method === "mtn_momo" || method === "orange_money") && (
          <Card>
            <View style={styles.opRow}>
              <TouchableOpacity style={[styles.opBtn, method === "mtn_momo" && styles.opActive]} onPress={() => setMethod("mtn_momo")}>
                <Text style={styles.opText}>MTN MoMo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.opBtn, method === "orange_money" && styles.opActive]} onPress={() => setMethod("orange_money")}>
                <Text style={styles.opText}>Orange Money</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.blockTitle}>{momo.operator}</Text>
            <CopyRow label="Titulaire" value={`${DIASPORA_BRAND} — ${momo.holder}`} />
            <CopyRow label="Numéro de collecte" value={momo.number} />
            <CopyRow label="Montant exact" value={`${req.amount_expected.toLocaleString("fr-FR")} ${req.currency}`} />
            <CopyRow label="Référence obligatoire" value={req.reference_code} />
            <Text style={styles.warn}>
              Vérifiez le numéro, le montant et la référence. HODIX ne vous demandera jamais votre PIN, mot de passe ou code OTP.
            </Text>
          </Card>
        )}

        {method === "bank_transfer" && (
          <Card>
            <CopyRow label="Bénéficiaire" value={DIASPORA_BANK.holder} />
            <CopyRow label="Banque" value={DIASPORA_BANK.bank} />
            <CopyRow label="IBAN" value={DIASPORA_BANK.iban} />
            <CopyRow label="BIC/SWIFT" value={DIASPORA_BANK.swift} />
            <CopyRow label="Référence obligatoire" value={req.reference_code} />
            <CopyRow label="Montant attendu (XAF)" value={`${req.amount_expected.toLocaleString("fr-FR")} XAF`} />
            <View style={styles.calc}>
              <Text style={styles.calcTitle}>Calculateur indicatif (non garanti)</Text>
              <View style={styles.opRow}>
                {(["EUR", "USD"] as Currency[]).map((c) => (
                  <TouchableOpacity key={c} style={[styles.opBtn, transferCurrency === c && styles.opActive]} onPress={() => setTransferCurrency(c)}>
                    <Text style={styles.opText}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {indicativeEur != null ? (
                <Text style={styles.calcValue}>Montant indicatif : ~{indicativeEur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} {transferCurrency}</Text>
              ) : null}
              <Text style={styles.calcNote}>Le montant exact sera confirmé lors de la validation par HODIX.</Text>
            </View>
            <Text style={styles.warn}>
              Les délais bancaires varient selon votre banque et votre pays. Le montant est pris en compte après réception et vérification.
            </Text>
          </Card>
        )}

        {method ? (
          <Card>
            <Text style={styles.section}>Qui a effectué le paiement ?</Text>
            <View style={styles.opRow}>
              <TouchableOpacity style={[styles.opBtn, payerType === "self" && styles.opActive]} onPress={() => setPayerType("self")}>
                <Text style={styles.opText}>Par moi</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.opBtn, payerType === "relative" && styles.opActive]} onPress={() => setPayerType("relative")}>
                <Text style={styles.opText}>Par un proche</Text>
              </TouchableOpacity>
            </View>
            {payerType === "relative" ? (
              <>
                <Field label="Prénom et nom du payeur" value={payerName} onChangeText={setPayerName} />
                <Field label="Numéro Mobile Money (partiel OK)" value={payerPhone} onChangeText={setPayerPhone} keyboardType="phone-pad" />
                <Field label="Relation (facultatif)" value={payerRelation} onChangeText={setPayerRelation} placeholder="Parent, conjoint, ami…" />
              </>
            ) : null}
            <Button
              label={method === "bank_transfer" ? "J'ai effectué le virement" : "J'ai effectué le dépôt"}
              onPress={confirmDeposit}
              loading={loading}
            />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MethodCard({ icon: Icon, title, desc, active, onPress }: { icon: any; title: string; desc: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.methodCard, active && styles.methodActive]} onPress={onPress} activeOpacity={0.85}>
      <Icon color={active ? Colors.primary : Colors.textMuted} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.methodDesc}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, padding: Spacing.lg },
  title: { fontSize: 20, fontWeight: "900", color: Colors.text },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 48 },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "700" },
  value: { fontSize: 16, fontWeight: "800", color: Colors.text },
  amount: { fontSize: 26, fontWeight: "900", color: Colors.primary, marginVertical: 6 },
  meta: { fontSize: 13, color: Colors.textMuted },
  member: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },
  section: { fontSize: 14, fontWeight: "900", color: Colors.text, marginTop: 4 },
  methodCard: {
    flexDirection: "row", gap: 12, padding: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  methodActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  methodTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  methodDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  blockTitle: { fontSize: 15, fontWeight: "900", color: Colors.text, marginBottom: 8 },
  opRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  opBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, alignItems: "center" },
  opActive: { backgroundColor: Colors.primaryLight },
  opText: { fontWeight: "800", fontSize: 12, color: Colors.text },
  warn: { fontSize: 11, color: Colors.warning, lineHeight: 16, marginTop: 10, fontWeight: "600" },
  calc: { marginTop: 12, padding: 12, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md },
  calcTitle: { fontSize: 12, fontWeight: "800", color: Colors.textMuted },
  calcValue: { fontSize: 16, fontWeight: "900", color: Colors.secondary, marginTop: 8 },
  calcNote: { fontSize: 10, color: Colors.textSubtle, marginTop: 6 },
});
