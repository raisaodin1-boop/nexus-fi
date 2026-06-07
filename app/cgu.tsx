// HODIX — Conditions Générales d'Utilisation complètes
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Shield } from "lucide-react-native";

import { Colors, Radius, Spacing } from "@/src/theme";

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.numBadge}><Text style={styles.numText}>{num}</Text></View>
        <Text style={styles.sectionTitle}>{title}</Text>
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

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

export default function CGUScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Header */}
        <LinearGradient colors={[Colors.primary, "#1E3A8A"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Shield color="#fff" size={32} />
          </View>
          <Text style={styles.headerTitle}>Conditions Générales</Text>
          <Text style={styles.headerTitle}>d'Utilisation</Text>
          <Text style={styles.headerSub}>Politique de Confidentialité & Consentement Utilisateur</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Version 1.0 — En vigueur depuis le 1er juin 2026</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>

          {/* Préambule */}
          <View style={styles.preambule}>
            <Text style={styles.preambuleText}>
              Le présent document constitue un contrat légalement contraignant entre vous (l'Utilisateur) et Hodix. Il définit les règles d'utilisation de la plateforme, les conditions de traitement de vos données personnelles, ainsi que vos droits et obligations.{"\n\n"}
              En vous inscrivant sur Hodix, vous déclarez avoir pris connaissance de l'intégralité des présentes Conditions et les accepter sans réserve.
            </Text>
          </View>

          {/* Article 1 */}
          <Section num="1" title="Présentation de Hodix">
            <P>Hodix est une plateforme numérique de gestion de tontines, d'épargne collective et de transferts communautaires. Elle est conçue pour accompagner les particuliers, groupes d'entraide et associations dans la gestion transparente et sécurisée de leurs cotisations, épargnes et décaissements.</P>
            <P>Hodix s'adresse aux résidents du Cameroun, de la zone CEMAC, ainsi qu'aux membres de la diaspora africaine souhaitant participer à des mécanismes d'épargne communautaire depuis l'étranger.</P>
            <P><Bold>Important :</Bold> Hodix n'est pas un établissement bancaire ni une institution de microfinance. Hodix est une plateforme technologique de facilitation financière communautaire. Les opérations financières sont exécutées par l'intermédiaire de partenaires de paiement agréés et réglementés.</P>
          </Section>

          {/* Article 2 */}
          <Section num="2" title="Objet de la plateforme">
            <P>Hodix propose les fonctionnalités suivantes :</P>
            <Li>Création et gestion de tontines numériques (publiques ou privées)</Li>
            <Li>Adhésion à des tontines existantes via invitation ou demande d'accès</Li>
            <Li>Gestion de groupes d'épargne, d'associations et de coopératives communautaires</Li>
            <Li>Collecte des cotisations et distribution des cagnottes selon le mode de rotation défini</Li>
            <Li>Suivi en temps réel des contributions, des soldes et de l'historique des transactions</Li>
            <Li>Génération d'attestations financières et de certificats de score de confiance</Li>
            <Li>Accès à un score d'identité financière (Score Hodix) basé sur l'historique d'activité</Li>
          </Section>

          {/* Article 3 */}
          <Section num="3" title="Conditions d'inscription">
            <P>Pour créer un compte Hodix, l'Utilisateur doit :</P>
            <Li>Être une personne physique âgée d'au moins <Bold>18 ans</Bold></Li>
            <Li>Disposer d'une adresse électronique valide et active</Li>
            <Li>Fournir un nom et prénom conformes à son état civil officiel</Li>
            <Li>Fournir un numéro de téléphone mobile valide</Li>
            <Li>Accepter l'intégralité des présentes Conditions</Li>
            <P><Bold>Un seul compte par personne est autorisé.</Bold> La création de comptes multiples est strictement interdite et peut entraîner la suspension immédiate de tous les comptes concernés.</P>
          </Section>

          {/* Article 4 */}
          <Section num="4" title="Acceptation obligatoire des conditions">
            <View style={styles.importantBox}>
              <Text style={styles.importantText}>
                Tout utilisateur doit accepter l'intégralité des présentes Conditions Générales d'Utilisation et de la Politique de Confidentialité avant de créer un compte ou d'utiliser les services Hodix. L'inscription est impossible sans cette acceptation.
              </Text>
            </View>
            <P>En acceptant les présentes Conditions, l'Utilisateur reconnaît avoir lu et compris l'intégralité du présent document et être en mesure de contracter légalement.</P>
          </Section>

          {/* Article 5 */}
          <Section num="5" title="Vérification d'identité (KYC)">
            <P>Conformément aux obligations réglementaires LCB-FT, Hodix est tenu de vérifier l'identité de ses utilisateurs avant de leur permettre d'accéder à certaines fonctionnalités financières.</P>
            <P><Bold>Niveau 1 (profil de base) :</Bold> nom, prénom, date et lieu de naissance, numéro de téléphone, adresse, profession.</P>
            <P><Bold>Niveau 2 (vérification complète — obligatoire pour les retraits) :</Bold> pièce d'identité officielle (CNI, passeport, permis de conduire) et justificatif de domicile.</P>
            <P><Bold>Garantie de l'Utilisateur :</Bold> tous les documents fournis dans le cadre du KYC sont authentiques, valides et appartiennent à l'Utilisateur. La fourniture de documents falsifiés constitue une infraction pénale et entraînera la suspension immédiate du compte et un signalement aux autorités.</P>
          </Section>

          {/* Article 6 */}
          <Section num="6" title="Collecte des données personnelles">
            <P>Dans le cadre de la fourniture de ses services, Hodix collecte et traite les données personnelles suivantes :</P>
            <Li><Bold>Données d'identification :</Bold> nom, prénom, date de naissance, lieu de naissance, numéro de pièce d'identité</Li>
            <Li><Bold>Données de contact :</Bold> adresse électronique, numéro de téléphone, adresse postale, ville, pays</Li>
            <Li><Bold>Données financières :</Bold> historique des transactions, cotisations, soldes, retraits, moyens de paiement utilisés</Li>
            <Li><Bold>Données de connexion :</Bold> adresse IP, type d'appareil, journaux d'activité</Li>
            <Li><Bold>Documents d'identité :</Bold> copies numériques des pièces fournies dans le cadre du KYC</Li>
            <P>Hodix ne collecte que les données strictement nécessaires à la fourniture de ses services.</P>
          </Section>

          {/* Article 7 */}
          <Section num="7" title="Utilisation des données">
            <P>Les données personnelles collectées sont utilisées pour :</P>
            <Li>Création, gestion et sécurisation du compte utilisateur</Li>
            <Li>Exécution des transactions financières demandées</Li>
            <Li>Vérification d'identité et respect des obligations KYC/AML</Li>
            <Li>Prévention de la fraude et de l'usurpation d'identité</Li>
            <Li>Amélioration des services et de l'expérience utilisateur</Li>
            <Li>Génération du Score d'Identité Financière Hodix</Li>
            <Li>Respect des obligations légales et réglementaires</Li>
            <P><Bold>Hodix ne vend, ne loue et ne cède pas les données personnelles de ses utilisateurs à des tiers à des fins commerciales.</Bold></P>
          </Section>

          {/* Article 8 */}
          <Section num="8" title="Sécurité des comptes">
            <P>Hodix met en œuvre des mesures techniques appropriées : chiffrement des données, authentification sécurisée et systèmes de détection d'intrusions.</P>
            <P>L'Utilisateur est seul responsable de la confidentialité de ses identifiants de connexion. Il s'engage à ne pas les communiquer à des tiers.</P>
            <P><Bold>Important :</Bold> Hodix ne demande jamais ses identifiants de connexion, codes PIN ou mots de passe à un utilisateur, par quelque moyen que ce soit. Toute sollicitation en ce sens est une tentative de fraude.</P>
          </Section>

          {/* Article 9 */}
          <Section num="9" title="Fonctionnement des tontines">
            <P>Une tontine Hodix est un mécanisme d'épargne collective dans lequel un groupe de membres contribue régulièrement un montant défini et où chaque membre reçoit à son tour la cagnotte constituée.</P>
            <P>Les tontines <Bold>publiques</Bold> sont visibles par l'ensemble des membres. L'adhésion est soumise à validation par le gestionnaire et l'administration Hodix.</P>
            <P>Les tontines <Bold>privées</Bold> sont accessibles uniquement via un code d'invitation communiqué par le gestionnaire.</P>
            <P>Hodix est un facilitateur technologique. Il ne garantit pas le paiement des cotisations par les membres, ni la remise effective de la cagnotte en cas de défaillance d'un ou plusieurs membres.</P>
          </Section>

          {/* Article 10 */}
          <Section num="10" title="Responsabilité des membres">
            <P>En rejoignant une tontine, chaque membre s'engage à :</P>
            <Li>Effectuer ses cotisations dans les délais convenus et pour le montant exact prévu</Li>
            <Li>Maintenir des informations de compte à jour et exactes</Li>
            <Li>Utiliser exclusivement des fonds provenant de sources licites</Li>
            <Li>Respecter les règles internes de la tontine</Li>
            <P>Tout membre qui a bénéficié de la cagnotte et qui cesse de cotiser engage sa responsabilité civile à l'égard des autres membres.</P>
          </Section>

          {/* Article 11 */}
          <Section num="11" title="Responsabilité des gestionnaires">
            <P>Le gestionnaire d'une tontine s'engage à :</P>
            <Li>Définir des règles claires et équitables pour la tontine</Li>
            <Li>Valider les demandes d'adhésion avec discernement</Li>
            <Li>Enregistrer fidèlement les cotisations perçues</Li>
            <Li>Désigner les bénéficiaires de manière transparente</Li>
            <Li>Signaler à Hodix tout comportement frauduleux d'un membre</Li>
          </Section>

          {/* Article 12 */}
          <Section num="12" title="Règles relatives aux paiements">
            <P><Bold>Moyens de paiement acceptés :</Bold> Orange Money Cameroun, MTN Mobile Money Cameroun, cartes bancaires Visa et Mastercard via Stripe, et tout autre moyen de paiement qui pourrait être ajouté ultérieurement.</P>
            <P>Les montants affichés à l'Utilisateur lors du processus de paiement correspondent aux montants effectifs de la cotisation. Hodix garantit la transparence des montants présentés pour les opérations de dépôt.</P>
            <P>Les montants et conditions de paiement sont déterminés et validés exclusivement par les systèmes Hodix côté serveur. Aucune modification côté client ne sera prise en compte.</P>
            <View style={styles.importantBox}>
              <Text style={styles.importantText}>
                En initiant une opération de paiement, l'Utilisateur autorise expressément Hodix et ses partenaires de paiement agréés à traiter les opérations financières nécessaires à l'exécution des services demandés.
              </Text>
            </View>
          </Section>

          {/* Article 13 */}
          <Section num="13" title="Frais de service et frais de traitement">
            <P>Hodix applique une commission de service sur certaines opérations financières, notamment les <Bold>retraits et les transferts</Bold>. Les dépôts et cotisations ne font pas l'objet d'une commission. Les frais en vigueur sont consultables à tout moment dans l'application.</P>
            <P>Certains moyens de paiement peuvent inclure des frais de traitement appliqués par les partenaires financiers de Hodix. Ces frais, lorsqu'ils sont applicables, peuvent être intégrés au montant total de l'opération ou déduits lors du traitement, selon les modalités propres à chaque partenaire.</P>
            <P><Bold>Mobile Money :</Bold> des frais liés aux retraits, transferts ou opérations Mobile Money peuvent être appliqués conformément aux conditions des opérateurs ou de la plateforme.</P>
            <P><Bold>Paiements Stripe :</Bold> pour certains paiements internationaux effectués par carte bancaire, le montant débité peut inclure les coûts liés au traitement du paiement, à la conversion de devise, aux réseaux bancaires ou aux partenaires de paiement. Le membre voit toujours le montant exact de sa cotisation.</P>
            <P>Hodix se réserve le droit d'ajuster ses frais de service, sous réserve d'en informer les utilisateurs dans un délai raisonnable.</P>
          </Section>

          {/* Article 14 */}
          <Section num="14" title="Retraits et transferts">
            <P>Les retraits sont soumis à la validation préalable de la vérification d'identité (KYC) de niveau 2.</P>
            <P>Tout retrait est soumis à une commission de service Hodix (1,5%) appliquée sur le montant brut du retrait. Le montant net est clairement indiqué avant la confirmation de l'opération.</P>
            <P>Les demandes de retrait sont traitées dans un délai de 24 à 48 heures ouvrées.</P>
            <P>L'Utilisateur est seul responsable de l'exactitude des coordonnées de réception qu'il fournit (numéro Mobile Money, RIB bancaire).</P>
          </Section>

          {/* Article 15 */}
          <Section num="15" title="Paiements internationaux">
            <P>Hodix permet aux membres de la diaspora de participer à des tontines depuis l'étranger, en effectuant des paiements en devises étrangères (euros, dollars, livres sterling) via des partenaires de paiement internationaux.</P>
            <P>Pour les paiements par carte internationale, Hodix applique un calcul permettant que le montant net de la cotisation soit intégralement crédité. L'Utilisateur voit toujours le montant de sa cotisation tel que défini dans la tontine.</P>
            <P>L'Utilisateur reconnaît que les paiements internationaux peuvent être soumis à des réglementations locales dans son pays de résidence.</P>
          </Section>

          {/* Article 16 */}
          <Section num="16" title="Utilisation de prestataires tiers">
            <P>Hodix fait appel aux prestataires tiers suivants :</P>
            <Li><Bold>Orange Money</Bold> — paiements Mobile Money en Afrique</Li>
            <Li><Bold>MTN Mobile Money</Bold> — paiements Mobile Money en Afrique</Li>
            <Li><Bold>Stripe, Inc.</Bold> — traitement des paiements par carte bancaire internationale</Li>
            <Li>Prestataires d'hébergement, d'infrastructure cloud et de messagerie</Li>
            <P>L'utilisation de ces prestataires est soumise à leurs propres conditions générales. Hodix ne saurait être tenu responsable des défaillances techniques de ses partenaires.</P>
          </Section>

          {/* Article 17 */}
          <Section num="17" title="Lutte contre la fraude et le blanchiment">
            <P>Il est strictement interdit sur Hodix de :</P>
            <Li>Fournir de fausses informations d'identité ou des documents falsifiés</Li>
            <Li>Créer ou utiliser plusieurs comptes sous des identités différentes</Li>
            <Li>Utiliser la plateforme pour déplacer ou dissimuler des fonds d'origine illicite</Li>
            <Li>Initier ou participer à des schémas de fraude ou d'escroquerie</Li>
            <Li>Procéder à des rétrofacturations (chargebacks) frauduleuses ou abusives</Li>
            <Li>Tenter d'introduire des fonds provenant d'activités illégales</Li>
            <View style={[styles.importantBox, { marginTop: 12 }]}>
              <Text style={styles.importantText}>
                Toute violation de ces règles entraîne la suspension immédiate du compte, le signalement aux autorités compétentes et des poursuites judiciaires appropriées.
              </Text>
            </View>
            <P>L'Utilisateur déclare et garantit que les fonds utilisés proviennent de sources légales et légitimes, et qu'il n'agit pas pour le compte d'un tiers dont il dissimulerait l'identité.</P>
          </Section>

          {/* Article 18 */}
          <Section num="18" title="Suspension ou fermeture de compte">
            <P>Hodix se réserve le droit de suspendre ou de fermer le compte d'un Utilisateur en cas de : violation des présentes Conditions, fourniture de fausses informations, comportement frauduleux, création de comptes multiples, ou demande des autorités compétentes.</P>
            <P>En cas de fermeture définitive, les fonds disponibles seront restitués après vérification d'identité et déduction des sommes éventuellement dues.</P>
          </Section>

          {/* Article 19 */}
          <Section num="19" title="Conservation des données">
            <Li><Bold>Données d'identité et KYC :</Bold> 5 ans après clôture du compte</Li>
            <Li><Bold>Données de transactions financières :</Bold> 10 ans (obligations comptables et anti-blanchiment)</Li>
            <Li><Bold>Journaux de connexion :</Bold> 1 an</Li>
            <P>À l'issue des durées applicables, les données sont supprimées ou anonymisées de manière définitive.</P>
          </Section>

          {/* Article 20 */}
          <Section num="20" title="Modifications des conditions">
            <P>Hodix se réserve le droit de modifier les présentes Conditions à tout moment. Toute modification substantielle sera notifiée aux utilisateurs au minimum 15 jours avant son entrée en vigueur.</P>
            <P>L'utilisation continue des services Hodix après la date d'entrée en vigueur des nouvelles Conditions vaut acceptation de celles-ci.</P>
          </Section>

          {/* Article 21 */}
          <Section num="21" title="Droit applicable">
            <P>Les présentes Conditions sont régies par le droit camerounais et les réglementations applicables dans la zone CEMAC, sans préjudice des dispositions impératives du droit applicable dans le pays de résidence de l'Utilisateur.</P>
            <P>En cas de litige, un règlement amiable sera privilégié. À défaut de résolution dans un délai de 30 jours, tout litige sera soumis à la compétence des juridictions camerounaises.</P>
          </Section>

          {/* Article 22 */}
          <Section num="22" title="Contact et réclamations">
            <P>Pour toute question, réclamation ou exercice de vos droits sur vos données personnelles :</P>
            <Li><Bold>Email :</Bold> support@hodix.app</Li>
            <Li><Bold>Via l'application :</Bold> Section "Aide" → "Nous contacter"</Li>
            <P>Hodix s'engage à accuser réception dans un délai de 48 heures ouvrées et à apporter une réponse de fond dans un délai maximum de 15 jours ouvrés.</P>
          </Section>

          <View style={styles.footer}>
            <Text style={styles.footerText}>© Hodix 2026 — Tous droits réservés</Text>
            <Text style={styles.footerSub}>Document juridique confidentiel. Toute reproduction non autorisée est interdite.</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: 28, paddingTop: 20, paddingBottom: 32, alignItems: "center", gap: 6 },
  backBtn: { alignSelf: "flex-start", marginBottom: 16 },
  backText: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  headerIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", marginTop: 4 },
  versionBadge: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5 },
  versionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  body: { padding: Spacing.xl },
  preambule: { backgroundColor: "#EFF6FF", borderRadius: Radius.lg, padding: 16, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: Colors.secondary },
  preambuleText: { color: Colors.text, fontSize: 13, lineHeight: 21, fontWeight: "500" },
  section: { marginBottom: 4, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 20 },
  numBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  numText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  sectionTitle: { color: Colors.primary, fontSize: 15, fontWeight: "900", flex: 1 },
  p: { color: Colors.text, fontSize: 13, lineHeight: 21, marginBottom: 10, fontWeight: "400" },
  bold: { fontWeight: "800", color: Colors.text },
  liRow: { flexDirection: "row", gap: 8, marginBottom: 7, paddingLeft: 4 },
  liDot: { color: Colors.secondary, fontWeight: "900", fontSize: 14, marginTop: 2 },
  liText: { color: Colors.text, fontSize: 13, lineHeight: 20, flex: 1, fontWeight: "400" },
  importantBox: { backgroundColor: "#FFF7ED", borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: "#FED7AA", marginBottom: 10 },
  importantText: { color: "#92400E", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  footer: { marginTop: 32, alignItems: "center", gap: 4 },
  footerText: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  footerSub: { color: Colors.textSubtle, fontSize: 11, textAlign: "center" },
});
