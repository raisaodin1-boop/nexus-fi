// Lightweight i18n system — FR (default) + EN
// Usage: wrap app in <I18nProvider>, then const { t, language, setLanguage } = useT()
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "app_language";

type Language = "fr" | "en";

const translations = {
  fr: {
    // Auth
    "auth.login.title": "Connexion",
    "auth.login.email": "Adresse email",
    "auth.login.password": "Mot de passe",
    "auth.login.submit": "Se connecter",
    "auth.login.noAccount": "Pas encore de compte ?",
    "auth.register.title": "Créer un compte",
    "auth.register.name": "Nom complet",
    "auth.register.submit": "Créer mon compte",
    // Tabs
    "tab.home": "Accueil",
    "tab.savings": "Épargne",
    "tab.groups": "Groupes",
    "tab.identity": "Identité",
    "tab.profile": "Profil",
    // Profile
    "profile.title": "Mon Profil",
    "profile.edit": "Modifier",
    "profile.save": "Enregistrer",
    "profile.logout": "Se déconnecter",
    "profile.settings": "Préférences",
    "profile.language": "Langue",
    "profile.darkMode": "Mode sombre",
    "profile.biometrics": "Connexion biométrique",
    "profile.notifications": "Notifications",
    "profile.kyc": "Vérification KYC",
    "profile.payments": "Mes Paiements",
    "profile.referral": "Programme de parrainage",
    // Common
    "common.cancel": "Annuler",
    "common.confirm": "Confirmer",
    "common.error": "Erreur",
    "common.loading": "Chargement...",
    "common.retry": "Réessayer",
    "common.fcfa": "FCFA",
  },
  en: {
    "auth.login.title": "Sign In",
    "auth.login.email": "Email address",
    "auth.login.password": "Password",
    "auth.login.submit": "Sign In",
    "auth.login.noAccount": "Don't have an account?",
    "auth.register.title": "Create Account",
    "auth.register.name": "Full name",
    "auth.register.submit": "Create my account",
    "tab.home": "Home",
    "tab.savings": "Savings",
    "tab.groups": "Groups",
    "tab.identity": "Identity",
    "tab.profile": "Profile",
    "profile.title": "My Profile",
    "profile.edit": "Edit",
    "profile.save": "Save",
    "profile.logout": "Sign Out",
    "profile.settings": "Preferences",
    "profile.language": "Language",
    "profile.darkMode": "Dark Mode",
    "profile.biometrics": "Biometric Login",
    "profile.notifications": "Notifications",
    "profile.kyc": "KYC Verification",
    "profile.payments": "My Payments",
    "profile.referral": "Referral Program",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.error": "Error",
    "common.loading": "Loading...",
    "common.retry": "Retry",
    "common.fcfa": "XAF",
  },
} as const;

type TranslationKey = keyof typeof translations.fr;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: "fr",
  setLanguage: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("fr");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "fr" || stored === "en") {
          setLanguageState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] ?? translations.fr[key] ?? key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}

export function useI18n() {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used inside I18nProvider");
  return v;
}
