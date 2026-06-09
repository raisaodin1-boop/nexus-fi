// HODIX — Politique de Confidentialité (écran dédié)
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Lock, ArrowLeft, Eye, Database, Shield, Trash2, Bell, Globe, FileText, Mail } from "lucide-react-native";

import { Colors, Radius, Spacing } from "@/src/theme";

function Section({ icon: Icon, color, title, children }: { icon: any; color: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: color + "20" }]}>
          <Icon color={color} size={18} />
        </View>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.liRow}>
      <Text style={styles.liDot}>•</Text>
      <Text style={styles.liText}>{children}</Text>
    </View>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function InfoBox({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <View style={[styles.infoBox, { backgroundColor: bg, borderLeftColor: color }]}>
      <Text style={[styles.infoText, { color }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

        {/* Header */}
        <LinearGradient colors={["#6366F1", "#4338CA"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color="#fff" size={20} />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Lock color="#fff" size={30} />
          </View>
          <Text style={styles.headerTitle}>Politique de Confidentialité</Text>
          <Text style={styles.headerSub}>Comment Hodix protège et utilise vos données personnelles</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Version 1.0 — En vigueur depuis le 1er juin 2026</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>

          {/* Résumé rapide */}
          <View style={styles.tldrCard}>
            <Text style={styles.tldrTitle}>En résumé</Text>
            <View style={styles.tldrGrid}>
              <View style={styles.tldrItem}>
                <Text style={styles.tldrEmoji}>🔒</Text>
                <Text style={styles.tldrLabel}>Données chiffrées</Text>
              </View>
              <View style={styles.tldrItem}>
                <Text style={styles.tldrEmoji}>🚫</Text>
                <Text style={styles.tldrLabel}>Jamais revendues</Text>
              </View>
              <View style={styles.tldrItem}>
                <Text style={styles.tldrEmoji}>✅</Text>
                <Text style={styles.tldrLabel}>Droits garantis</Text>
              </View>
              <View style={styles.tldrItem}>
                <Text style={styles.tldrEmoji}>🗑️</Text>
                <Text style={styles.tldrLabel}>Suppression possible</Text>
              </View>
            </View>
          </View>

          {/* 1. Responsable du traitement */}
          <Section icon={FileText} color={Colors.secondary} title="1. Responsable du traitement des données">
            <P>Le responsable du traitement de vos données personnelles est :</P>
            <View style={styles.contactCard}>
              <Text style={styles.contactLine}><B>Société :</B> Hodix SAS</Text>
              <Text style={styles.contactLine}><B>Adresse :</B> Cameroun — Zone CEMAC</Text>
              <Text style={styles.contactLine}><B>Email DPO :</B> privacy@hodix.app</Text>
              <Text style={styles.contactLine}><B>Support :</B> support@hodix.app</Text>
            </View>
            <P>Hodix traite vos données en conformité avec la Loi n°2010/012 du 21 décembre 2010 relative à la cybersécurité et à la cybercriminalité au Cameroun, ainsi qu'avec les lignes directrices de protection des données de la CEMAC et les principes du RGPD européen pour les utilisateurs résidant dans l'UE.</P>
          </Section>

          {/* 2. Données collectées */}
          <Section icon={Database} color="#3B82F6" title="2. Données personnelles collectées">
            <P>Hodix collecte uniquement les données nécessaires à la fourniture de ses services :</P>

            <Text style={styles.subHeading}>Données d'identification</Text>
            <Li>Nom complet, prénom, date et lieu de naissance</Li>
            <Li>Numéro de pièce d'identité (CNI, passeport, permis de conduire)</Li>
            <Li>Photo de la pièce d'identité (KYC niveau 2)</Li>
            <Li>Justificatif de domicile</Li>

            <Text style={styles.subHeading}>Données de contact</Text>
            <Li>Adresse électronique (email)</Li>
            <Li>Numéro de téléphone mobile</Li>
            <Li>Adresse postale, ville, pays de résidence</Li>

            <Text style={styles.subHeading}>Données financières</Text>
            <Li>Historique des transactions (dépôts, retraits, cotisations)</Li>
            <Li>Soldes et mouvements de compte</Li>
            <Li>Identifiants de paiement Mobile Money (Orange Money, MTN MoMo)</Li>
            <Li>Score d'identité financière Hodix</Li>

            <Text style={styles.subHeading}>Données techniques</Text>
            <Li>Adresse IP, type d'appareil, système d'exploitation</Li>
            <Li>Empreinte d'appareil (device fingerprint) pour la sécurité</Li>
            <Li>Journaux de connexion et d'activité</Li>
            <Li>Jeton de notification push (si activé)</Li>

            <InfoBox color="#1D4ED8" bg="#EFF6FF">
              Hodix ne collecte pas de données biométriques (empreintes digitales, reconnaissance faciale). Le code PIN de votre portefeuille est haché localement et n'est jamais transmis en clair.
            </InfoBox>
          </Section>

          {/* 3. Base légale */}
          <Section icon={Shield} color={Colors.primary} title="3. Base légale du traitement">
            <P>Chaque traitement de données repose sur une base légale spécifique :</P>

            <View style={styles.baseTable}>
              <View style={styles.baseRow}>
                <View style={styles.baseLeft}><Text style={styles.baseType}>Exécution du contrat</Text></View>
                <View style={styles.baseRight}><Text style={styles.baseDesc}>Création et gestion du compte, exécution des transactions, tontines</Text></View>
              </View>
              <View style={styles.baseRow}>
                <View style={styles.baseLeft}><Text style={styles.baseType}>Obligation légale</Text></View>
                <View style={styles.baseRight}><Text style={styles.baseDesc}>KYC, lutte contre le blanchiment (LCB-FT), réglementations COBAC</Text></View>
              </View>
              <View style={styles.baseRow}>
                <View style={styles.baseLeft}><Text style={styles.baseType}>Intérêt légitime</Text></View>
                <View style={styles.baseRight}><Text style={styles.baseDesc}>Prévention de la fraude, sécurité, amélioration des services</Text></View>
              </View>
              <View style={[styles.baseRow, { borderBottomWidth: 0 }]}>
                <View style={styles.baseLeft}><Text style={styles.baseType}>Consentement</Text></View>
                <View style={styles.baseRight}><Text style={styles.baseDesc}>Notifications push, communications marketing (révocable à tout moment)</Text></View>
              </View>
            </View>
          </Section>

          {/* 4. Finalités */}
          <Section icon={Eye} color="#8B5CF6" title="4. Finalités du traitement">
            <P>Vos données sont utilisées exclusivement pour :</P>
            <Li><B>Gestion de votre compte :</B> création, authentification, sécurité</Li>
            <Li><B>Services financiers :</B> traitement des cotisations, retraits, transferts</Li>
            <Li><B>Vérification d'identité (KYC) :</B> conformité réglementaire anti-fraude</Li>
            <Li><B>Score Hodix :</B> calcul de votre identité financière communautaire</Li>
            <Li><B>Tontines & groupes :</B> gestion des membres, contributions, cagnottes</Li>
            <Li><B>Notifications :</B> alertes de paiement, rappels de cotisations (si consentement donné)</Li>
            <Li><B>Support client :</B> traitement des réclamations et assistance</Li>
            <Li><B>Prévention de la fraude :</B> détection des activités suspectes, protection des fonds</Li>
            <Li><B>Obligations légales :</B> déclarations réglementaires, réponse aux autorités compétentes</Li>

            <InfoBox color="#D97706" bg="#FFFBEB">
              <B>Hodix ne vend, ne loue, ni ne cède vos données personnelles à des tiers à des fins commerciales ou publicitaires.</B> Aucun profil marketing n'est revendu à des annonceurs.
            </InfoBox>
          </Section>

          {/* 5. Partage des données */}
          <Section icon={Globe} color="#0891B2" title="5. Partage des données avec des tiers">
            <P>Hodix partage vos données uniquement avec les partenaires strictement nécessaires à la fourniture des services :</P>

            <View style={styles.partnerCard}>
              <Text style={styles.partnerName}>🟠 Orange Money Cameroun</Text>
              <Text style={styles.partnerDesc}>Traitement des paiements Mobile Money — données partagées : numéro de téléphone, montant de la transaction</Text>
            </View>
            <View style={styles.partnerCard}>
              <Text style={styles.partnerName}>🟡 MTN Mobile Money</Text>
              <Text style={styles.partnerDesc}>Traitement des paiements Mobile Money — données partagées : numéro de téléphone, montant de la transaction</Text>
            </View>
            <View style={styles.partnerCard}>
              <Text style={styles.partnerName}>🔵 Stripe, Inc.</Text>
              <Text style={styles.partnerDesc}>Traitement des paiements par carte bancaire internationale — données partagées : informations de paiement tokenisées (jamais vos coordonnées bancaires complètes)</Text>
            </View>
            <View style={styles.partnerCard}>
              <Text style={styles.partnerName}>☁️ Supabase / Infrastructure Cloud</Text>
              <Text style={styles.partnerDesc}>Hébergement sécurisé des données avec chiffrement au repos et en transit (TLS 1.3)</Text>
            </View>
            <View style={styles.partnerCard}>
              <Text style={styles.partnerName}>🔔 Expo Push Notifications</Text>
              <Text style={styles.partnerDesc}>Envoi des notifications push — uniquement si vous avez accordé votre consentement</Text>
            </View>

            <P>Tous nos sous-traitants sont contractuellement tenus de traiter vos données uniquement selon nos instructions et dans le respect des obligations de confidentialité.</P>

            <P><B>Autorités légales :</B> Hodix peut être amené à communiquer vos données aux autorités compétentes (CONAC, COBAC, forces de l'ordre) sur réquisition légale ou décision judiciaire.</P>
          </Section>

          {/* 6. Transferts internationaux */}
          <Section icon={Globe} color="#059669" title="6. Transferts internationaux de données">
            <P>Certains de nos prestataires (Stripe, services d'infrastructure) sont basés hors de la zone CEMAC. Ces transferts sont encadrés par :</P>
            <Li>Des clauses contractuelles types garantissant un niveau de protection adéquat</Li>
            <Li>Des certifications de sécurité reconnues internationalement (ISO 27001, SOC 2)</Li>
            <Li>Un chiffrement de bout en bout lors de tout transfert de données</Li>
          </Section>

          {/* 7. Sécurité */}
          <Section icon={Shield} color={Colors.primary} title="7. Sécurité des données">
            <P>Hodix met en place les mesures de sécurité suivantes :</P>
            <Li><B>Chiffrement en transit :</B> TLS 1.3 pour toutes les communications</Li>
            <Li><B>Chiffrement au repos :</B> données sensibles chiffrées en base de données (AES-256)</Li>
            <Li><B>Code PIN :</B> haché avec bcrypt, jamais stocké en clair</Li>
            <Li><B>Authentification :</B> tokens JWT sécurisés avec expiration courte</Li>
            <Li><B>Détection d'anomalies :</B> surveillance automatique des comportements suspects</Li>
            <Li><B>Empreinte d'appareil :</B> détection des connexions depuis des appareils inconnus</Li>
            <Li><B>Journaux d'audit :</B> traçabilité de toutes les opérations financières</Li>
            <Li><B>Accès limité :</B> seuls les employés autorisés accèdent aux données personnelles, sur la base du principe du moindre privilège</Li>

            <InfoBox color="#DC2626" bg="#FEF2F2">
              En cas de violation de données susceptible d'affecter vos droits et libertés, Hodix s'engage à vous notifier dans un délai de 72 heures après en avoir pris connaissance.
            </InfoBox>
          </Section>

          {/* 8. Durée de conservation */}
          <Section icon={Database} color="#7C3AED" title="8. Durée de conservation des données">
            <View style={styles.retentionTable}>
              <View style={styles.retentionHeader}>
                <Text style={[styles.retentionCell, styles.retentionHeaderText, { flex: 2 }]}>Type de données</Text>
                <Text style={[styles.retentionCell, styles.retentionHeaderText, { flex: 1 }]}>Durée</Text>
              </View>
              {[
                ["Données d'identité & KYC", "5 ans post-clôture"],
                ["Transactions financières", "10 ans (LCB-FT)"],
                ["Journaux de connexion", "12 mois"],
                ["Messages & support", "3 ans"],
                ["Jeton push (inactif)", "90 jours"],
                ["Données de score Hodix", "Durée du compte + 3 ans"],
              ].map(([label, duration], i) => (
                <View key={i} style={[styles.retentionRow, i % 2 === 0 && styles.retentionRowAlt]}>
                  <Text style={[styles.retentionCell, { flex: 2, color: Colors.text }]}>{label}</Text>
                  <Text style={[styles.retentionCell, { flex: 1, color: Colors.primary, fontWeight: "700" }]}>{duration}</Text>
                </View>
              ))}
            </View>
            <P>À l'expiration de ces délais, les données sont <B>définitivement supprimées ou anonymisées</B> de manière irréversible.</P>
          </Section>

          {/* 9. Droits des utilisateurs */}
          <Section icon={FileText} color={Colors.secondary} title="9. Vos droits sur vos données">
            <P>Conformément à la loi camerounaise sur la protection des données et aux principes du RGPD, vous disposez des droits suivants :</P>

            {[
              { emoji: "👁️", right: "Droit d'accès", desc: "Obtenir une copie de toutes les données personnelles que Hodix détient sur vous." },
              { emoji: "✏️", right: "Droit de rectification", desc: "Corriger toute donnée inexacte ou incomplète vous concernant." },
              { emoji: "🗑️", right: "Droit à l'effacement", desc: "Demander la suppression de vos données (sous réserve des obligations légales de conservation)." },
              { emoji: "⏸️", right: "Droit à la limitation", desc: "Demander la suspension du traitement dans les cas prévus par la loi." },
              { emoji: "📦", right: "Droit à la portabilité", desc: "Recevoir vos données dans un format structuré et lisible par machine (JSON/CSV)." },
              { emoji: "🚫", right: "Droit d'opposition", desc: "Vous opposer au traitement basé sur l'intérêt légitime, notamment à des fins de prospection." },
              { emoji: "🔔", right: "Retrait du consentement", desc: "Retirer à tout moment votre consentement aux notifications push ou aux communications marketing." },
            ].map(({ emoji, right, desc }, i) => (
              <View key={i} style={styles.rightCard}>
                <Text style={styles.rightEmoji}>{emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rightTitle}>{right}</Text>
                  <Text style={styles.rightDesc}>{desc}</Text>
                </View>
              </View>
            ))}

            <InfoBox color={Colors.secondary} bg={Colors.secondaryLight}>
              Pour exercer vos droits, rendez-vous dans <B>Profil → Paramètres → Mes données</B> ou envoyez votre demande à <B>privacy@hodix.app</B>. Délai de réponse : 30 jours maximum.
            </InfoBox>
          </Section>

          {/* 10. Cookies et traceurs */}
          <Section icon={Eye} color="#F59E0B" title="10. Traceurs et données de session">
            <P>L'application mobile Hodix n'utilise pas de cookies au sens traditionnel du terme. Cependant, les éléments suivants sont utilisés :</P>
            <Li><B>Tokens de session :</B> stockés de manière sécurisée sur votre appareil (SecureStore chiffré), nécessaires au maintien de votre connexion</Li>
            <Li><B>Empreinte d'appareil :</B> identifiant technique anonymisé utilisé pour détecter les connexions suspectes depuis des appareils non reconnus</Li>
            <Li><B>Données de performance :</B> données anonymisées d'utilisation pour améliorer les performances de l'application (aucune donnée personnelle)</Li>
            <P>Ces traceurs sont <B>strictement nécessaires</B> à la sécurité et au fonctionnement de l'application. Ils ne sont pas utilisés à des fins publicitaires.</P>
          </Section>

          {/* 11. Mineurs */}
          <Section icon={Shield} color="#DC2626" title="11. Données des mineurs">
            <InfoBox color="#DC2626" bg="#FEF2F2">
              Hodix est réservé aux personnes âgées de 18 ans et plus. Hodix ne collecte pas sciemment de données relatives à des mineurs. Si vous pensez qu'un mineur a créé un compte, contactez-nous immédiatement à privacy@hodix.app.
            </InfoBox>
          </Section>

          {/* 12. Modifications */}
          <Section icon={Bell} color={Colors.primary} title="12. Modifications de la politique">
            <P>Hodix se réserve le droit de modifier la présente Politique de Confidentialité. En cas de modification substantielle :</P>
            <Li>Vous serez notifié(e) par notification in-app et/ou par email au moins <B>15 jours avant</B> l'entrée en vigueur</Li>
            <Li>La date de la dernière mise à jour sera indiquée en haut du présent document</Li>
            <Li>En cas de modifications majeures affectant vos droits, votre consentement explicite vous sera redemandé</Li>
          </Section>

          {/* 13. Contact DPO */}
          <Section icon={Mail} color={Colors.secondary} title="13. Contact & Délégué à la Protection des Données">
            <View style={styles.contactCard}>
              <Text style={styles.contactLine}><B>Email DPO :</B> privacy@hodix.app</Text>
              <Text style={styles.contactLine}><B>Support général :</B> support@hodix.app</Text>
              <Text style={styles.contactLine}><B>Délai de réponse :</B> 48h pour accusé de réception, 30 jours pour réponse de fond</Text>
            </View>
            <P>Si vous estimez que le traitement de vos données personnelles constitue une violation de la réglementation applicable, vous avez le droit d'introduire une réclamation auprès de l'autorité de contrôle compétente dans votre pays de résidence.</P>
          </Section>

          <View style={styles.footer}>
            <Text style={styles.footerText}>© Hodix 2026 — Tous droits réservés</Text>
            <Text style={styles.footerSub}>Politique de Confidentialité v1.0 — 1er juin 2026</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: 28, paddingTop: 20, paddingBottom: 36, alignItems: "center", gap: 6 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 16 },
  backText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 },
  headerIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", marginTop: 4, paddingHorizontal: 20 },
  versionBadge: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5 },
  versionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  body: { padding: Spacing.xl },

  tldrCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  tldrTitle: { color: Colors.text, fontWeight: "900", fontSize: 14, marginBottom: 12, textAlign: "center" },
  tldrGrid: { flexDirection: "row", justifyContent: "space-around" },
  tldrItem: { alignItems: "center", gap: 6 },
  tldrEmoji: { fontSize: 24 },
  tldrLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", textAlign: "center" },

  section: { marginBottom: 4, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 20 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "900", flex: 1 },

  subHeading: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 12, marginBottom: 6 },

  p: { color: Colors.text, fontSize: 13, lineHeight: 21, marginBottom: 10 },
  bold: { fontWeight: "800", color: Colors.text },
  liRow: { flexDirection: "row", gap: 8, marginBottom: 7, paddingLeft: 4 },
  liDot: { color: Colors.secondary, fontWeight: "900", fontSize: 14, marginTop: 2 },
  liText: { color: Colors.text, fontSize: 13, lineHeight: 20, flex: 1 },

  infoBox: { borderRadius: 12, padding: 14, borderLeftWidth: 4, marginVertical: 10 },
  infoText: { fontSize: 13, lineHeight: 20, fontWeight: "600" },

  contactCard: { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 12, gap: 6 },
  contactLine: { color: Colors.text, fontSize: 13, lineHeight: 20 },

  baseTable: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  baseRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border },
  baseLeft: { flex: 1, padding: 10, backgroundColor: Colors.surfaceAlt, justifyContent: "center" },
  baseRight: { flex: 2, padding: 10 },
  baseType: { color: Colors.secondary, fontWeight: "800", fontSize: 12 },
  baseDesc: { color: Colors.text, fontSize: 12, lineHeight: 18 },

  partnerCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  partnerName: { color: Colors.text, fontWeight: "800", fontSize: 13, marginBottom: 4 },
  partnerDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },

  retentionTable: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  retentionHeader: { flexDirection: "row", backgroundColor: Colors.secondary, padding: 10 },
  retentionHeaderText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  retentionRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 10 },
  retentionRowAlt: { backgroundColor: Colors.surfaceAlt },
  retentionCell: { fontSize: 12, lineHeight: 18, paddingRight: 8 },

  rightCard: { flexDirection: "row", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, alignItems: "flex-start" },
  rightEmoji: { fontSize: 22, marginTop: 2 },
  rightTitle: { color: Colors.text, fontWeight: "800", fontSize: 13, marginBottom: 3 },
  rightDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },

  footer: { marginTop: 32, alignItems: "center", gap: 4 },
  footerText: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  footerSub: { color: Colors.textSubtle, fontSize: 11, textAlign: "center" },
});
