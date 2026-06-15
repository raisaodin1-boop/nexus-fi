import { isNoindexPath } from "@/src/seo-config";
import type { SeoMeta } from "@/src/seo";

const HOME: SeoMeta = {
  title: "HODIX – Tontines Digitales & Épargne Africaine | Wallet Mobile",
  description:
    "HODIX digitalise les tontines africaines. Gérez vos groupes d'épargne, payez via Mobile Money MTN/Orange et construisez votre Trust Score financier.",
  breadcrumbs: [{ name: "Accueil", path: "/" }],
};

const ROUTES: Record<string, SeoMeta> = {
  "/": HOME,
  "/welcome": {
    title: "Bienvenue sur HODIX – Épargne & Tontines",
    description:
      "Découvrez la super-app fintech africaine pour épargner en groupe et gérer vos tontines digitalement.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Bienvenue", path: "/welcome" },
    ],
  },
  "/login": {
    title: "Connexion HODIX",
    description: "Connectez-vous à votre espace HODIX pour gérer vos tontines, épargne et wallet.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Connexion", path: "/login" },
    ],
  },
  "/register": {
    title: "Créer un compte HODIX",
    description: "Inscrivez-vous gratuitement sur HODIX et rejoignez la finance participative africaine.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Inscription", path: "/register" },
    ],
  },
  "/tontines/create": {
    title: "Créer une Tontine Digitale – HODIX",
    description:
      "Créez votre tontine en ligne : cotisations automatiques, rotations transparentes et notifications pour vos membres.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Tontines", path: "/tontines/directory" },
      { name: "Créer", path: "/tontines/create" },
    ],
  },
  "/tontines/join": {
    title: "Rejoindre une Tontine – HODIX",
    description: "Entrez votre code d'invitation pour rejoindre une tontine digitale HODIX.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Tontines", path: "/tontines/directory" },
      { name: "Rejoindre", path: "/tontines/join" },
    ],
  },
  "/tontines/directory": {
    title: "Annuaire des Tontines Publiques – HODIX",
    description: "Découvrez et rejoignez des tontines digitales publiques sur HODIX au Cameroun et en Afrique.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Tontines", path: "/tontines/directory" },
      { name: "Annuaire", path: "/tontines/directory" },
    ],
  },
  "/tontines/leaderboard": {
    title: "Classement des Contributeurs – HODIX",
    description: "Découvrez le leaderboard HODIX des meilleurs contributeurs de tontines et d'épargne collective.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Tontines", path: "/tontines/directory" },
      { name: "Classement", path: "/tontines/leaderboard" },
    ],
  },
  "/cooperatives/create": {
    title: "Créer une Coopérative – HODIX",
    description: "Digitalisez la gestion de votre coopérative d'épargne et crédit avec HODIX.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Coopératives", path: "/cooperatives/create" },
    ],
  },
  "/associations/create": {
    title: "Créer une Association – HODIX",
    description: "Gérez les cotisations et la trésorerie de votre association avec HODIX.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Associations", path: "/associations/create" },
    ],
  },
  "/privacy": {
    title: "Politique de Confidentialité – HODIX",
    description: "Protection des données personnelles et droits RGPD sur la plateforme HODIX.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Confidentialité", path: "/privacy" },
    ],
  },
  "/cgu": {
    title: "Conditions Générales d'Utilisation – HODIX",
    description: "Consultez les CGU de la plateforme HODIX pour l'épargne participative et les tontines digitales.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "CGU", path: "/cgu" },
    ],
  },
  "/data-rights": {
    title: "Mes Droits sur les Données – HODIX",
    description: "Exercez vos droits d'accès, rectification et suppression de données sur HODIX.",
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Mes données", path: "/data-rights" },
    ],
  },
  "/wallet": {
    title: "Mon Wallet – HODIX",
    description: "Gérez votre portefeuille digital HODIX multi-devises XAF, EUR et USD.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Wallet", path: "/wallet" },
    ],
  },
  "/groups": {
    title: "Mes Groupes & Tontines – HODIX",
    description: "Consultez et gérez vos tontines et groupes d'épargne HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Groupes", path: "/groups" },
    ],
  },
  "/savings": {
    title: "Mon Épargne – HODIX",
    description: "Suivez vos objectifs d'épargne personnels et familiaux sur HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Épargne", path: "/savings" },
    ],
  },
  "/identity": {
    title: "Mon Identité Financière – HODIX",
    description: "Consultez votre Trust Score, certificats et identité financière HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Identité", path: "/identity" },
    ],
  },
  "/profile": {
    title: "Mon Profil – HODIX",
    description: "Gérez vos paramètres de compte et préférences HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Profil", path: "/profile" },
    ],
  },
  "/credit-score": {
    title: "Score de Crédit HODIX – Identité Financière",
    description: "Consultez votre score de crédit Hodix sur 1000 points et votre éligibilité au financement participatif.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Score de crédit", path: "/credit-score" },
    ],
  },
  "/kyc": {
    title: "Vérification KYC – HODIX",
    description: "Complétez votre vérification d'identité KYC niveau 1 ou 2 sur HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "KYC", path: "/kyc" },
    ],
  },
  "/pay": {
    title: "Paiement Sécurisé – HODIX",
    description: "Finalisez votre paiement Mobile Money ou carte via CinetPay sur HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Paiement", path: "/pay" },
    ],
  },
  "/referral": {
    title: "Parrainage HODIX",
    description: "Invitez vos proches sur HODIX et gagnez des récompenses de parrainage.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Parrainage", path: "/referral" },
    ],
  },
  "/documents": {
    title: "Mes Documents – HODIX",
    description: "Accédez à vos certificats et documents financiers HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Documents", path: "/documents" },
    ],
  },
  "/streaks": {
    title: "Streaks de Cotisation – HODIX",
    description: "Suivez vos séries de cotisations et badges de régularité HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Streaks", path: "/streaks" },
    ],
  },
  "/ranking": {
    title: "Classement – HODIX",
    description: "Votre position dans le classement communautaire HODIX.",
    noindex: true,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: "Classement", path: "/ranking" },
    ],
  },
};

function labelFromPath(path: string): string {
  return path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/-/g, " "))
    .join(" › ") || "Page";
}

export function seoForPath(pathname: string): SeoMeta & { path: string } {
  const path = pathname || "/";
  const exact = ROUTES[path];

  if (exact) {
    return { ...exact, path };
  }

  const noindex = isNoindexPath(path);
  const segment = labelFromPath(path);

  return {
    title: `HODIX – ${segment}`,
    description: HOME.description,
    noindex,
    breadcrumbs: [
      { name: "Accueil", path: "/" },
      { name: segment, path },
    ],
    path,
  };
}
