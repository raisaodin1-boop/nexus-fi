// HODIX — Consent Modal: notifications push & marketing (in-app)
import { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Bell, BellOff, Shield } from "lucide-react-native";

import { api } from "@/src/api";
import { Colors, Radius, Spacing } from "@/src/theme";

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PushConsentModal({ visible, onAccept, onDecline }: Props) {
  const [loading, setLoading] = useState(false);

  const handle = async (accepted: boolean) => {
    setLoading(true);
    try {
      await api.post("/notifications/consent", { push_consent: accepted, marketing_consent: accepted });
    } catch {}
    setLoading(false);
    accepted ? onAccept() : onDecline();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <View style={styles.iconBg}>
              <Bell color={Colors.secondary} size={28} />
            </View>
          </View>
          <Text style={styles.title}>Rester informé(e)</Text>
          <Text style={styles.desc}>
            Hodix souhaite vous envoyer des notifications pour :
          </Text>

          <View style={styles.list}>
            {[
              "Rappels de cotisations à venir",
              "Confirmation de vos paiements",
              "Alertes de sécurité (connexion suspecte, nouvelle transaction)",
              "Notifications de cagnottes et tours de tontine",
            ].map((item, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listDot}>✅</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.privacyNote}>
            <Shield color={Colors.primary} size={14} />
            <Text style={styles.privacyText}>
              Vous pouvez retirer ce consentement à tout moment dans <Text style={{ fontWeight: "800" }}>Profil → Mes données</Text>.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => handle(true)}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Bell color="#fff" size={16} />
              <Text style={styles.btnPrimaryText}>Activer les notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => handle(false)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <BellOff color={Colors.textMuted} size={16} />
              <Text style={styles.btnSecondaryText}>Pas maintenant</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface KycConsentProps {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function KycConsentModal({ visible, onAccept, onCancel }: KycConsentProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconBg}>
            <Shield color={Colors.primary} size={28} />
          </View>
          <Text style={styles.title}>Vérification d'identité</Text>
          <Text style={styles.desc}>
            Pour accéder aux retraits et aux fonctionnalités premium, Hodix doit vérifier votre identité (KYC). Cela implique la collecte et le traitement de :
          </Text>
          <View style={styles.list}>
            {[
              "Votre pièce d'identité officielle (CNI, passeport, permis)",
              "Un justificatif de domicile de moins de 3 mois",
              "Vos informations personnelles (nom, date de naissance, adresse)",
            ].map((item, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listDot}>📋</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={styles.privacyNote}>
            <Shield color={Colors.primary} size={14} />
            <Text style={styles.privacyText}>
              Ces données sont traitées conformément à notre <Text style={{ fontWeight: "800", color: Colors.secondary }}>Politique de Confidentialité</Text> et conservées 5 ans après clôture du compte, conformément aux obligations LCB-FT.
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onAccept} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>J'accepte et je continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.btnSecondaryText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface TransactionConsentProps {
  visible: boolean;
  amount: number;
  currency?: string;
  type: "topup" | "withdraw" | "transfer" | "contribution";
  onConfirm: () => void;
  onCancel: () => void;
}

export function TransactionConsentModal({ visible, amount, currency = "XAF", type, onConfirm, onCancel }: TransactionConsentProps) {
  const typeLabels: Record<string, string> = {
    topup: "Dépôt",
    withdraw: "Retrait",
    transfer: "Transfert",
    contribution: "Cotisation",
  };
  const typeDesc: Record<string, string> = {
    topup: "en ajoutant des fonds à votre portefeuille Hodix",
    withdraw: "en retirant des fonds vers votre compte Mobile Money ou bancaire",
    transfer: "en transférant des fonds à un autre membre",
    contribution: "en effectuant votre cotisation à la tontine",
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirmer l'opération</Text>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>{typeLabels[type]}</Text>
            <Text style={styles.amountValue}>{amount.toLocaleString("fr-FR")} {currency}</Text>
          </View>
          <Text style={styles.desc}>
            En confirmant, vous autorisez Hodix et ses partenaires de paiement agréés à traiter cette opération financière {typeDesc[type]}.
          </Text>
          <Text style={styles.legalNote}>
            Cette autorisation est enregistrée conformément à l'article 12 des CGU Hodix.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Autoriser et confirmer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.btnSecondaryText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "flex-end", padding: Spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: 24, padding: 24, width: "100%", gap: 12, maxWidth: 480 },
  iconRow: { alignItems: "center" },
  iconBg: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.secondaryLight, alignItems: "center", justifyContent: "center" },
  title: { color: Colors.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  desc: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  list: { gap: 8, marginVertical: 4 },
  listRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  listDot: { fontSize: 14, marginTop: 1 },
  listText: { color: Colors.text, fontSize: 13, lineHeight: 19, flex: 1, fontWeight: "500" },
  privacyNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 10 },
  privacyText: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, flex: 1 },
  actions: { gap: 10, marginTop: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  btnPrimary: { backgroundColor: Colors.secondary },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnSecondary: { backgroundColor: Colors.surfaceAlt },
  btnSecondaryText: { color: Colors.textMuted, fontWeight: "700", fontSize: 14 },
  amountBox: { backgroundColor: Colors.primaryLight, borderRadius: 14, padding: 16, alignItems: "center", gap: 4 },
  amountLabel: { color: Colors.primary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  amountValue: { color: Colors.primary, fontSize: 28, fontWeight: "900" },
  legalNote: { color: Colors.textSubtle, fontSize: 11, textAlign: "center", lineHeight: 16 },
});
