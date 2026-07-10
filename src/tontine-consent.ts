/**
 * HODIX — Charte de responsabilité du créateur de tontine
 * Version 1.0 — En vigueur dès le 1er janvier 2025
 *
 * Ce texte est affiché et signé électroniquement avant toute création de tontine.
 * La signature est horodatée et conservée dans la base de données.
 */

export const CONSENT_VERSION = "1.0";

export const CONSENT_TITLE = "Charte du Créateur de Tontine HODIX";

export const CONSENT_SECTIONS = [
  {
    heading: "1. Votre rôle en tant que créateur",
    body:
      "En créant une tontine sur HODIX, vous assumez le rôle de gestionnaire et de garant de cette tontine. " +
      "Vous êtes seul(e) responsable de son bon fonctionnement, de la sélection rigoureuse de ses membres, " +
      "du respect des règles de participation, et de la résolution de tout différend entre membres.",
  },
  {
    heading: "2. Vérification et admission des membres",
    body:
      "Vous vous engagez à vérifier l'identité et la fiabilité de chaque personne que vous admettez dans votre tontine. " +
      "Toute admission imprudente, négligente ou complaisante engage votre seule responsabilité. " +
      "HODIX vous fournit des outils d'aide à la décision (Trust Score, historique de cotisations, KYC) " +
      "mais la décision finale d'admission vous appartient entièrement.",
  },
  {
    heading: "3. Limitation de responsabilité de HODIX",
    body:
      "HODIX est une plateforme technologique de mise en relation et de gestion de tontines. " +
      "HODIX n'est ni une banque, ni un établissement de crédit, ni un assureur, ni un garant des engagements des membres. " +
      "En aucun cas HODIX ne pourra être tenu responsable, poursuivi ou interpelé pour :\n\n" +
      "  • Le comportement frauduleux, malhonnête ou défaillant d'un membre ;\n" +
      "  • Le non-paiement d'un ou plusieurs membres ;\n" +
      "  • La perte de fonds résultant d'une fraude, d'une escroquerie ou d'une disparition de membre ;\n" +
      "  • Tout préjudice financier, moral ou matériel subi par les membres de la tontine ;\n" +
      "  • La défaillance d'un réseau Mobile Money ou d'un prestataire de paiement tiers.",
  },
  {
    heading: "4. Mécanismes de protection disponibles",
    body:
      "HODIX met à votre disposition des outils de protection : fonds de réserve automatique (2% de chaque cotisation), " +
      "système d'escrow sur le premier cycle, vote d'exclusion des membres défaillants, et signalement de fraude. " +
      "L'utilisation de ces outils est recommandée mais reste à votre discrétion. " +
      "Ces mécanismes réduisent le risque sans l'éliminer totalement.",
  },
  {
    heading: "5. Recours entre membres",
    body:
      "En cas de litige, de fraude avérée ou de non-paiement, les recours sont exclusivement exercés " +
      "entre les membres concernés, sous la responsabilité du créateur de la tontine. " +
      "HODIX peut, sur demande, fournir un historique certifié des transactions pour appuyer une démarche amiable ou légale, " +
      "mais ne peut en aucun cas se substituer à une autorité judiciaire ou à un médiateur financier.",
  },
  {
    heading: "6. Engagements du créateur",
    body:
      "En signant cette charte, vous déclarez et garantissez que :\n\n" +
      "  • Vous avez lu, compris et accepté l'intégralité des présentes dispositions ;\n" +
      "  • Vous agissez en votre nom propre ou avec mandat explicite de votre organisation ;\n" +
      "  • Vous n'utiliserez pas la plateforme HODIX à des fins frauduleuses, d'escroquerie ou de blanchiment ;\n" +
      "  • Vous informerez les membres des règles et risques inhérents à toute tontine ;\n" +
      "  • Vous acceptez que toute fraude avérée entraîne la suspension permanente de votre compte " +
      "et le signalement de votre identité aux autorités compétentes.",
  },
  {
    heading: "7. Droit applicable",
    body:
      "La présente charte est régie par le droit en vigueur dans le pays de résidence du créateur " +
      "et, à défaut, par le droit camerounais. " +
      "Tout litige relatif à l'interprétation ou à l'exécution de cette charte sera soumis " +
      "aux tribunaux compétents du lieu de résidence du créateur.",
  },
];

export const CONSENT_FOOTER =
  "En confirmant votre consentement, vous signez électroniquement cette charte. " +
  "Votre signature est horodatée, associée à votre identifiant HODIX et conservée de manière sécurisée. " +
  "Elle constitue une preuve de votre engagement et pourra être produite en cas de litige.";

export const CONFIRM_PHRASE = "J'ACCEPTE";

/** Accept common variants: jaccepte, J'ACCEPTE, J’ACCEPTE (curly apostrophe), etc. */
export function matchesConfirmPhrase(input: string): boolean {
  const normalized = input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\u2018\u2019\u201A\u2032\u00B4`]/g, "'") // curly / accent → '
    .replace(/[^A-Z0-9']/g, ""); // drop spaces and punctuation noise
  const expected = CONFIRM_PHRASE.replace(/[^A-Z0-9']/g, "");
  const withoutApos = expected.replace(/'/g, "");
  return normalized === expected || normalized === withoutApos;
}
