# Play Console — checklist HODIX

Package: `app.hodix.mobile` · Privacy: https://www.hodix.app/privacy · CGU: https://www.hodix.app/cgu

## Avant le premier upload

1. Compte Google Play Console (frais unique) + app créée avec package `app.hodix.mobile`
2. Générer les visuels : `npm run store:play-assets` → dossier `store/play/`
   - Ou polir vos captures réelles : déposer dans `store/play/raw/screenshots/` puis `npm run store:polish-screenshots`
3. Build AAB production : `npx eas build -p android --profile production`
4. Vérifier dans le build : **targetSdk 35**, pas de CAMERA / storage legacy
5. Upload via `npx eas submit -p android --profile production` (piste **internal** + draft)

## Fiche store (FR)

- **Titre** : HODIX — Tontines & Épargne
- **Description courte** (≤80) : Tontines digitales, wallet MoMo et trust score pour l’épargne africaine.
- **Description longue** : coller `store/listing.fr.txt`
- **Catégorie** : Finance
- **Tags** : tontine, épargne, mobile money, afrique, wallet
- **Contact** : support@hodix.app · DPO privacy@hodix.app
- **URL confidentialité** : https://www.hodix.app/privacy
- **Suppression de compte** : in-app Profil → Mes données · URL https://www.hodix.app/data-rights

## Déclarations obligatoires

- [ ] **Data safety** — remplir avec `store/DATA_SAFETY.fr.md`
- [ ] **Financial features** — Oui (wallet / transferts / cotisations)
- [ ] **Ads** — Non
- [ ] **Public cible** — 18+ (pas d’enfants)
- [ ] **Contenu** — Finance / services d’argent
- [ ] **App Access** — fournir un compte test reviewer (email + PIN de démo)
- [ ] **Governments apps** — Non
- [ ] **COVID** — Non

## Astuces review (réduire les rejets)

- Permissions = usage réel uniquement (caméra retirée : KYC via galerie)
- Pas de cleartext HTTP (`usesCleartextTraffic: false`)
- Lien privacy **accessible sans login** (déjà le cas)
- Suppression de compte accessible sans support payant
- Captures réelles de l’app (remplacer les placeholders générés par de vrais screenshots téléphone)
- Commencer en **piste interne** → closed testing → production
- Prévoir 1 compte test KYC + wallet pour les reviewers Google

## Bonus premium

- Feature graphic 1024×500 (`store/play/feature-graphic.png`)
- Deep links App Links déjà déclarés (`hodix.app`)
- Biométrie + PIN wallet (sécurité finance)
- `autoIncrement` versionCode EAS activé
- ProGuard + shrink resources en release

## Si le build SDK 35 échoue sur Expo 51

Tester d’abord : `npx eas build -p android --profile preview`.  
Si erreur Kotlin / compile, planifier upgrade Expo 52/53 (cible native SDK 35/36) sans changer le package name.
