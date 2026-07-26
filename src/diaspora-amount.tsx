/**
 * Diaspora money display: primary in member currency, subtle ≈ FCFA underneath.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import {
  convert, formatAmount, formatXAFAmount, getRates,
  type Currency, type Rates,
} from "@/src/exchange-rates";
import { Colors } from "@/src/theme";

type Props = {
  /** Canonical tontine amount in XAF */
  amountXaf: number;
  currency: Currency;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  primaryStyle?: StyleProp<TextStyle>;
  fcfaStyle?: StyleProp<TextStyle>;
  /** Hide FCFA line when already showing XAF as primary */
  hideFcfaWhenXaf?: boolean;
};

export function useDiasporaRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return rates;
}

export function formatDiasporaPrimary(amountXaf: number, currency: Currency, rates: Rates | null): string {
  if (!rates || currency === "XAF") return formatXAFAmount(amountXaf);
  const converted = convert(amountXaf, "XAF", currency, rates);
  return formatAmount(converted, currency);
}

export function DiasporaAmount({
  amountXaf,
  currency,
  size = "md",
  style,
  primaryStyle,
  fcfaStyle,
  hideFcfaWhenXaf = true,
}: Props) {
  const rates = useDiasporaRates();
  const primary = formatDiasporaPrimary(amountXaf, currency, rates);
  const showFcfa = !(hideFcfaWhenXaf && currency === "XAF");

  return (
    <View style={style}>
      <Text style={[
        size === "lg" ? styles.primaryLg : size === "sm" ? styles.primarySm : styles.primaryMd,
        primaryStyle,
      ]}>
        {rates || currency === "XAF" ? primary : "…"}
      </Text>
      {showFcfa ? (
        <Text style={[styles.fcfa, size === "lg" && styles.fcfaLg, fcfaStyle]}>
          ≈ {formatXAFAmount(amountXaf)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primaryLg: { fontSize: 28, fontWeight: "900", color: Colors.primary },
  primaryMd: { fontSize: 18, fontWeight: "900", color: Colors.primary },
  primarySm: { fontSize: 14, fontWeight: "800", color: Colors.text },
  fcfa: { fontSize: 11, fontWeight: "600", color: Colors.textMuted, marginTop: 2 },
  fcfaLg: { fontSize: 12, marginTop: 4 },
});
