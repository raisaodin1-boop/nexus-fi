/**
 * TontineConsentModal — must be accepted before any tontine can be created.
 * Shows the full Charte du Créateur with a scrollable reader,
 * a checkbox, and a typed confirmation phrase.
 */
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ShieldCheck, FileText, AlertTriangle } from "lucide-react-native";
import { api } from "@/src/api";
import { Colors, Spacing } from "@/src/theme";
import {
  CONSENT_SECTIONS,
  CONSENT_TITLE,
  CONSENT_FOOTER,
  CONSENT_VERSION,
  CONFIRM_PHRASE,
} from "@/src/tontine-consent";

interface Props {
  visible: boolean;
  onAccepted: () => void;   // called when user signs — proceed with creation
  onDeclined: () => void;   // called when user closes without signing
}

export function TontineConsentModal({ visible, onAccepted, onDeclined }: Props) {
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isValid = checked && typed.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleSign = async () => {
    if (!isValid) return;
    setBusy(true);
    try {
      await api.post("/consent/tontine", { version: CONSENT_VERSION });
      setChecked(false);
      setTyped("");
      setHasScrolledToEnd(false);
      onAccepted();
    } catch {
      // consent storage failed — allow anyway (best-effort)
      onAccepted();
    } finally {
      setBusy(false);
    }
  };

  const handleScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (atEnd && !hasScrolledToEnd) setHasScrolledToEnd(true);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDeclined}
    >
      <View style={styles.root}>
        {/* ── Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <FileText size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{CONSENT_TITLE}</Text>
            <Text style={styles.headerSub}>Version {CONSENT_VERSION} · À lire entièrement</Text>
          </View>
          <TouchableOpacity onPress={onDeclined} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Scrollable charter */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          showsVerticalScrollIndicator
        >
          {/* Read-me nudge */}
          {!hasScrolledToEnd && (
            <View style={styles.readNudge}>
              <AlertTriangle size={14} color="#D97706" />
              <Text style={styles.readNudgeTxt}>
                Faites défiler jusqu'à la fin pour activer la signature
              </Text>
            </View>
          )}

          {CONSENT_SECTIONS.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footerBox}>
            <ShieldCheck size={18} color={Colors.secondary} />
            <Text style={styles.footerTxt}>{CONSENT_FOOTER}</Text>
          </View>
        </ScrollView>

        {/* ── Signature zone */}
        <View style={[styles.signZone, !hasScrolledToEnd && styles.signZoneLocked]}>
          {!hasScrolledToEnd ? (
            <Text style={styles.lockedHint}>↑ Lisez l'intégralité de la charte pour signer</Text>
          ) : (
            <>
              {/* Checkbox */}
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setChecked(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>
                  J'ai lu et j'accepte l'intégralité de la Charte du Créateur de Tontine HODIX,
                  et je m'engage à en respecter toutes les dispositions.
                </Text>
              </TouchableOpacity>

              {/* Typed confirmation */}
              <Text style={styles.typePrompt}>
                Pour confirmer, saisissez{" "}
                <Text style={styles.typePhrase}>{CONFIRM_PHRASE}</Text>{" "}
                ci-dessous :
              </Text>
              <TextInput
                style={[styles.typeInput, typed.trim().toUpperCase() === CONFIRM_PHRASE && styles.typeInputValid]}
                value={typed}
                onChangeText={setTyped}
                placeholder={CONFIRM_PHRASE}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              {/* Sign button */}
              <TouchableOpacity
                style={[styles.signBtn, !isValid && styles.signBtnDisabled]}
                onPress={handleSign}
                disabled={!isValid || busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <ShieldCheck size={18} color="#fff" />
                    <Text style={styles.signBtnTxt}>Signer et continuer</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.legalNote}>
                Cette signature électronique a la même valeur juridique qu'une signature manuscrite
                conformément aux lois sur la signature électronique en vigueur.
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.xl, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border ?? "#E5E7EB",
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primaryLight ?? "#EFF6FF",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: Colors.primary, fontSize: 15, fontWeight: "900" },
  headerSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "600" },
  closeBtn: { padding: 8 },
  closeTxt: { color: Colors.textMuted, fontSize: 18, fontWeight: "600" },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.xl, paddingBottom: 8 },

  readNudge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginBottom: 16,
  },
  readNudgeTxt: { color: "#92400E", fontSize: 12, fontWeight: "600", flex: 1 },

  section: { marginBottom: 20 },
  sectionHeading: {
    color: Colors.primary, fontSize: 13, fontWeight: "900",
    marginBottom: 8, letterSpacing: 0.2,
  },
  sectionBody: {
    color: Colors.text, fontSize: 13, lineHeight: 21,
    fontWeight: "400",
  },

  footerBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.surface ?? "#F8FAFC",
    borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 4,
    borderWidth: 1, borderColor: Colors.border ?? "#E5E7EB",
  },
  footerTxt: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: "500" },

  signZone: {
    padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.border ?? "#E5E7EB",
    backgroundColor: Colors.bg,
  },
  signZoneLocked: { alignItems: "center", paddingVertical: 20 },
  lockedHint: { color: Colors.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center" },

  checkRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border ?? "#D1D5DB",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "900" },
  checkLabel: { flex: 1, color: Colors.text, fontSize: 13, lineHeight: 20 },

  typePrompt: { color: Colors.textMuted, fontSize: 13, marginBottom: 8, fontWeight: "600" },
  typePhrase: { color: Colors.primary, fontWeight: "900" },
  typeInput: {
    borderWidth: 2, borderColor: Colors.border ?? "#D1D5DB",
    borderRadius: 12, padding: 12,
    fontSize: 18, fontWeight: "900", color: Colors.text,
    letterSpacing: 2, textAlign: "center",
    marginBottom: 16,
  },
  typeInputValid: { borderColor: "#10B981" },

  signBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 14, padding: 16,
    marginBottom: 12,
  },
  signBtnDisabled: { backgroundColor: Colors.textMuted ?? "#94A3B8", opacity: 0.6 },
  signBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },

  legalNote: {
    color: Colors.textMuted, fontSize: 11, textAlign: "center", lineHeight: 16,
  },
});
