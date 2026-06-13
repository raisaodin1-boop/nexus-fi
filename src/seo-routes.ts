import type { SeoMeta } from "@/src/seo";

const HOME: SeoMeta = {
  title: "HODIX – Tontines Digitales & Épargne Africaine | Wallet Mobile",
  description:
    "HODIX digitalise les tontines africaines. Gérez vos groupes d'épargne, payez via Mobile Money MTN/Orange et construisez votre Trust Score financier.",
  breadcrumbs: [{ name: "Accueil", path: "/" }],
};

export function seoForPath(pathname: string): SeoMeta & { path: string } {
  const path = pathname || "/";
  const routes: Record<string, SeoMeta> = {
    "/": HOME,
    "/welcome": {
      title: "Bienvenue sur HODIX – Épargne & Tontines",
      description: "Découvrez la super-app fintech africaine pour épargner en groupe et gérer vos tontines digitalement.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Bienvenue", path: "/welcome" }],
    },
    "/login": {
      title: "Connexion HODIX",
      description: "Connectez-vous à votre espace HODIX pour gérer vos tontines, épargne et wallet.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Connexion", path: "/login" }],
    },
    "/register": {
      title: "Créer un compte HODIX",
      description: "Inscrivez-vous gratuitement sur HODIX et rejoignez la finance participative africaine.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Inscription", path: "/register" }],
    },
    "/credit-score": {
      title: "Score de Crédit HODIX – Identité Financière",
      description: "Consultez votre score de crédit Hodix sur 1000 points et votre éligibilité au financement participatif.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Score de crédit", path: "/credit-score" }],
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
    "/tontines/join": {
      title: "Rejoindre une Tontine – HODIX",
      description: "Entrez votre code d'invitation pour rejoindre une tontine digitale HODIX.",
      breadcrumbs: [
        { name: "Accueil", path: "/" },
        { name: "Tontines", path: "/tontines/directory" },
        { name: "Rejoindre", path: "/tontines/join" },
      ],
    },
    "/cgu": {
      title: "Conditions Générales d'Utilisation – HODIX",
      description: "Consultez les CGU de la plateforme HODIX pour l'épargne participative et les tontines digitales.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "CGU", path: "/cgu" }],
    },
    "/privacy": {
      title: "Politique de Confidentialité – HODIX",
      description: "Protection des données personnelles et droits RGPD sur la plateforme HODIX.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Confidentialité", path: "/privacy" }],
    },
    "/pay": {
      title: "Paiement Sécurisé – HODIX",
      description: "Finalisez votre paiement Mobile Money ou carte via CinetPay sur HODIX.",
      breadcrumbs: [{ name: "Accueil", path: "/" }, { name: "Paiement", path: "/pay" }],
    },
  };

  const meta = routes[path] ?? {
    title: `HODIX${path !== "/" ? ` – ${path.replace(/^\//, "").replace(/\//g, " › ")}` : ""}`,
    description: HOME.description,
    breadcrumbs: [{ name: "Accueil", path: "/" }, { name: path.replace(/^\//, "") || "Page", path }],
  };

  return { ...meta, path };
}
