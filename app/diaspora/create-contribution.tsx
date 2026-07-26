import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { PlusCircle } from "lucide-react-native";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/toast";
import { Colors, Radius, Spacing } from "@/src/theme";
import { DiasporaAmount, formatDiasporaPrimary, useDiasporaRates } from "@/src/diaspora-amount";
import { formatXAFAmount, type Currency } from "@/src/exchange-rates";
import { useDiasporaGuard, DiasporaGuardSpinner } from "@/src/use-diaspora-guard";
import {
  DiasporaFadeIn,
  DiasporaPanel,
  DiasporaScreenShell,
  DiasporaSection,
} from "@/src/diaspora-shell";

type TontineRow = {
  id: string;
  name: string;
  amount_per_cycle?: number;
  contribution_amount?: number;
  currency?: string;
  current_cycle?: number;
};

export default function DiasporaCreateContributionScreen() {
  const router = useRouter();
  const { checking } = useDiasporaGuard();
  const { user } = useAuth();
  const { show } = useToast();
  const rates = useDiasporaRates();
  const displayCur = (user?.diaspora_currency ?? "EUR") as Currency;
  const [tontines, setTontines] = useState<TontineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<TontineRow[]>("/tontines");
      setTontines(Array.isArray(list) ? list : []);
    } catch {
      setTontines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!checking) load();
  }, [checking, load]));

  const createFor = async (tontineId: string) => {
    if (busyId) return;
    setBusyId(tontineId);
    try {
      const req = await api.post<{ id: string }>("/diaspora/requests", { tontine_id: tontineId });
      show("Cotisation créée en devise locale", "success");
      router.replace(`/diaspora/pay/${req.id}` as any);
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Impossible de créer la cotisation", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (checking) {
    return (
      <DiasporaScreenShell variant="app" title="Nouvelle cotisation" scroll={false} contentStyle={styles.center}>
        <DiasporaGuardSpinner checking />
      </DiasporaScreenShell>
    );
  }

  return (
    <DiasporaScreenShell
      variant="app"
      title="Nouvelle cotisation"
      subtitle={`Montants en ${displayCur} · équivalent FCFA`}
    >
      <DiasporaFadeIn>
        <DiasporaPanel>
          <DiasporaSection
            title="Choisir une tontine"
            body="La cotisation est créée dans votre devise locale. Le groupe conserve l'équivalent en FCFA."
          />
        </DiasporaPanel>
      </DiasporaFadeIn>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
      ) : !tontines.length ? (
        <DiasporaPanel>
          <Text style={styles.empty}>Vous n'avez pas encore de tontine.</Text>
          <TouchableOpacity style={styles.joinBtn} onPress={() => router.push("/diaspora/join" as any)}>
            <Text style={styles.joinBtnText}>Rejoindre une tontine</Text>
          </TouchableOpacity>
        </DiasporaPanel>
      ) : (
        tontines.map((t, i) => {
          const amountXaf = Number(t.amount_per_cycle ?? t.contribution_amount ?? 0);
          const localLabel = formatDiasporaPrimary(amountXaf, displayCur, rates);
          return (
            <DiasporaFadeIn key={t.id} delay={40 + i * 40}>
              <DiasporaPanel style={styles.card}>
                <Text style={styles.name}>{t.name}</Text>
                <DiasporaAmount amountXaf={amountXaf} currency={displayCur} size="md" />
                <Text style={styles.meta}>
                  Cycle {t.current_cycle ?? 1}
                  {rates ? ` · ${localLabel}` : ""}
                  {" · "}≈ {formatXAFAmount(amountXaf)}
                </Text>
                <TouchableOpacity
                  style={[styles.cta, busyId === t.id && styles.ctaBusy]}
                  onPress={() => createFor(t.id)}
                  disabled={!!busyId}
                  activeOpacity={0.9}
                >
                  {busyId === t.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <PlusCircle color="#fff" size={18} />
                  )}
                  <Text style={styles.ctaText}>Créer en {displayCur}</Text>
                </TouchableOpacity>
              </DiasporaPanel>
            </DiasporaFadeIn>
          );
        })
      )}
    </DiasporaScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { gap: 8 },
  name: { fontSize: 17, fontWeight: "900", color: Colors.text, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  cta: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  empty: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.md },
  joinBtn: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    alignItems: "center",
  },
  joinBtnText: { color: Colors.primary, fontWeight: "800", fontSize: 14 },
});
