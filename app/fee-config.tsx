// Admin — Payment Fee Configuration
// Allows super_admin to adjust Stripe fee rates and commission without code changes
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Settings, Save, RefreshCw } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { Button, Card, Field } from "@/src/ui";
import { Colors, Radius, Shadow, Spacing } from "@/src/theme";

interface FeeConfig {
  stripe_fee_rate: number;
  stripe_fixed_fee_usd: number;
  stripe_reserve_rate: number;
  hodix_commission_pct: number;
  xaf_to_usd_rate: number;
  xaf_to_eur_rate: number;
}

const EXAMPLE_COTISATION_EUR = 100;

export default function FeeConfigScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<FeeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields as strings
  const [stripeFeeRate, setStripeFeeRate] = useState("");
  const [stripeFixed, setStripeFixed] = useState("");
  const [stripeReserve, setStripeReserve] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [xafUsd, setXafUsd] = useState("");
  const [xafEur, setXafEur] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.get<FeeConfig>("/admin/payment-config");
      setConfig(cfg);
      setStripeFeeRate(String(cfg.stripe_fee_rate * 100));
      setStripeFixed(String(cfg.stripe_fixed_fee_usd));
      setStripeReserve(String(cfg.stripe_reserve_rate * 100));
      setCommissionPct(String(cfg.hodix_commission_pct));
      setXafUsd(String(cfg.xaf_to_usd_rate));
      setXafEur(String(cfg.xaf_to_eur_rate));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Calculate example: for 100 € cotisation, how much will Stripe charge?
  const calcExample = () => {
    const feeRate = parseFloat(stripeFeeRate) / 100 || 0.029;
    const reserveRate = parseFloat(stripeReserve) / 100 || 0.005;
    const fixed = parseFloat(stripeFixed) || 0.30;
    const totalRate = feeRate + reserveRate;
    const net = EXAMPLE_COTISATION_EUR;
    const gross = (net + fixed) / (1 - totalRate);
    return gross.toFixed(2);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.patch("/admin/payment-config", {
        stripe_fee_rate: parseFloat(stripeFeeRate) / 100,
        stripe_fixed_fee_usd: parseFloat(stripeFixed),
        stripe_reserve_rate: parseFloat(stripeReserve) / 100,
        hodix_commission_pct: parseFloat(commissionPct),
        xaf_to_usd_rate: parseFloat(xafUsd),
        xaf_to_eur_rate: parseFloat(xafEur),
      });
      setSuccess(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>

        <LinearGradient colors={[Colors.primary, Colors.gradMid]} style={[styles.hero, Shadow.cardDark]}>
          <Settings color="#fff" size={28} />
          <Text style={styles.heroTitle}>Configurer les frais</Text>
          <Text style={styles.heroSub}>Paramètres de facturation Hodix</Text>
        </LinearGradient>

        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Stripe fees */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Frais Stripe (carte internationale)</Text>
              <Text style={styles.sectionDesc}>
                Ces frais sont absorbés automatiquement : le membre voit toujours le montant exact de la cotisation.
              </Text>

              <Field
                label="Taux Stripe (%)"
                placeholder="2.9"
                value={stripeFeeRate}
                onChangeText={setStripeFeeRate}
                keyboardType="decimal-pad"
                testID="fee-stripe-rate"
              />
              <Text style={styles.fieldHint}>Taux de base Stripe (ex: 2.9 pour 2,9%). Valeur par défaut : 2,9%</Text>

              <Field
                label="Frais fixe Stripe (USD)"
                placeholder="0.30"
                value={stripeFixed}
                onChangeText={setStripeFixed}
                keyboardType="decimal-pad"
                testID="fee-stripe-fixed"
              />
              <Text style={styles.fieldHint}>Frais fixe par transaction. Valeur par défaut : $0.30</Text>

              <Field
                label="Marge de sécurité (%)"
                placeholder="0.5"
                value={stripeReserve}
                onChangeText={setStripeReserve}
                keyboardType="decimal-pad"
                testID="fee-stripe-reserve"
              />
              <Text style={styles.fieldHint}>Marge additionnelle pour couvrir les variations de taux. Défaut : 0,5%</Text>
            </Card>

            {/* Commission */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Commission Hodix sur retrait</Text>
              <Text style={styles.sectionDesc}>
                Appliquée UNIQUEMENT sur les retraits. Les dépôts et cotisations ne sont jamais prélevés.
              </Text>

              <Field
                label="Commission retrait (%)"
                placeholder="1.5"
                value={commissionPct}
                onChangeText={setCommissionPct}
                keyboardType="decimal-pad"
                testID="fee-commission"
              />
              <Text style={styles.fieldHint}>Taux prélevé sur chaque retrait. Valeur par défaut : 1,5%</Text>
            </Card>

            {/* Exchange rates */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Taux de change</Text>

              <Field
                label="XAF → USD"
                placeholder="0.0018"
                value={xafUsd}
                onChangeText={setXafUsd}
                keyboardType="decimal-pad"
                testID="fee-xaf-usd"
              />
              <Text style={styles.fieldHint}>1 XAF = ? USD. Taux actuel indicatif : 0.0018</Text>

              <Field
                label="XAF → EUR"
                placeholder="0.0015"
                value={xafEur}
                onChangeText={setXafEur}
                keyboardType="decimal-pad"
                testID="fee-xaf-eur"
              />
              <Text style={styles.fieldHint}>1 XAF = ? EUR. Taux actuel indicatif : 0.0015</Text>
            </Card>

            {/* Live example */}
            <Card style={[styles.section, { backgroundColor: Colors.surfaceAlt }]}>
              <Text style={styles.sectionTitle}>Exemple de calcul</Text>
              <Text style={styles.exampleText}>
                Pour une cotisation de <Text style={styles.exampleHighlight}>{EXAMPLE_COTISATION_EUR} €</Text>,
                Stripe facturera au membre :{" "}
                <Text style={styles.exampleHighlight}>{EXAMPLE_COTISATION_EUR} €</Text>
              </Text>
              <Text style={styles.exampleSub}>
                Montant brut débité par Stripe : <Text style={styles.exampleHighlight}>{calcExample()} €</Text>
                {"\n"}(Le membre voit toujours {EXAMPLE_COTISATION_EUR} €, la différence est gérée côté serveur)
              </Text>
            </Card>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>✓ Configuration sauvegardée avec succès</Text>
              </View>
            ) : null}

            <Button
              testID="fee-save"
              label="Sauvegarder la configuration"
              loading={saving}
              onPress={save}
              icon={<Save color="#fff" size={16} />}
            />

            <Button
              testID="fee-reload"
              label="Recharger"
              variant="ghost"
              onPress={load}
              icon={<RefreshCw color={Colors.secondary} size={16} />}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { color: Colors.textMuted, fontWeight: "600", marginBottom: 16 },
  hero: { borderRadius: Radius.xxl, padding: 24, gap: 8, marginBottom: 24, alignItems: "center" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "600" },
  section: { marginBottom: 16, gap: 8 },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  sectionDesc: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  fieldHint: { color: Colors.textSubtle, fontSize: 11, fontWeight: "500", marginTop: -4, marginBottom: 4 },
  exampleText: { color: Colors.text, fontSize: 14, lineHeight: 22 },
  exampleHighlight: { color: Colors.secondary, fontWeight: "900" },
  exampleSub: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  errorBox: { backgroundColor: "#FEE2E2", borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  errorText: { color: Colors.danger, fontWeight: "600", fontSize: 13 },
  successBox: { backgroundColor: "#D1FAE5", borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  successText: { color: "#065F46", fontWeight: "700", fontSize: 13 },
});
