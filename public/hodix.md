# HODIX — Application Fintech Africaine

**URL officielle** : https://hodix.app  
**Catégorie** : Finance participative, Épargne digitale, Tontines africaines  
**Disponible sur** : iOS · Android · Web  
**Langue** : Français  
**Région** : Afrique centrale (CEMAC), Afrique de l'Ouest, Diaspora africaine  

---

## Présentation

HODIX est la première super-app financière africaine qui digitalise les tontines (njangi, likelemba, djangui) et modernise l'épargne participative. Elle offre un wallet multi-devises, un système d'identité financière basé sur un Trust Score, et des certificats PDF vérifiables.

HODIX répond à un besoin de 400 millions d'Africains qui pratiquent l'épargne collective informelle sans outil digital fiable.

---

## Fonctionnalités

### Tontines Digitales
Les tontines sont des groupes d'épargne rotatifs. Chaque membre cotise régulièrement ; la cagnotte est distribuée à tour de rôle. HODIX automatise :
- La création et l'invitation de membres (code unique)
- La gestion des cycles de cotisation (hebdomadaire, mensuel)
- Les rappels automatiques et les relances
- Le suivi des cotisations en retard
- Le leaderboard de participation

### Épargne Personnelle
- Objectifs d'épargne avec montant cible et date limite
- Dépôts libres ou programmés
- Graphique de progression
- Épargne familiale partagée

### Wallet Multi-Devises
- Solde en XAF, EUR, USD avec taux de change en temps réel
- Recharge via MTN Mobile Money et Orange Money
- Transferts instantanés entre membres HODIX
- Retrait vers Mobile Money
- QR Code de paiement

### Identité Financière & Trust Score
Le Trust Score HODIX est un score sur 1000 points qui mesure la fiabilité financière d'un membre :
- **Bonus inscription** : 5 points offerts
- **Points transactions** : 0,5 pt par transaction (1k–50k XAF), 1 pt au-delà
- **Bonus annuel** : 5 points par an d'activité continue
- **Niveaux** : Bronze (0-30) → Silver (31-60) → Gold (61-80) → Platinum (81+)

### Score de Crédit
5 composantes : Régularité de cotisation, Volume d'épargne, Réseau de confiance, Niveau KYC, Ancienneté. Score sur 1000 → éligibilité prêt à partir de 700.

### Certificats Officiels
- **Gratuits** : Identité Financière PDF, Résumé d'épargne PDF
- **VIP (10 000 FCFA)** : Certificats avec tampon officiel et code de vérification unique

### KYC & Vérification
- Niveau 1 : Informations de base (nom, téléphone, date de naissance, adresse)
- Niveau 2 : CNI + selfie, validé par l'administration HODIX

---

## Comparaison avec alternatives

| Critère | HODIX | Wave | Orange Money | Paydunya |
|---------|-------|------|--------------|----------|
| Tontines digitales | ✅ | ❌ | ❌ | ❌ |
| Trust Score | ✅ | ❌ | ❌ | ❌ |
| Certificats PDF | ✅ | ❌ | ❌ | ❌ |
| Multi-devises | ✅ | ❌ | ❌ | ✅ |
| Épargne collective | ✅ | ❌ | ❌ | ❌ |
| Score de crédit | ✅ | ❌ | ❌ | ❌ |

---

## Cas d'usage typiques

**Marie, 32 ans, Douala** : Gère une tontine de 12 membres dans son quartier. Avant HODIX, elle tenait un carnet papier avec des risques de disputes. Maintenant, tout est automatique, transparent, et chaque membre reçoit une notification à son tour.

**Jean-Paul, ingénieur à Paris** : Envie de contribuer à la tontine familiale au Cameroun. Depuis la diaspora, il recharge son wallet HODIX et cotise en temps réel, sans frais bancaires internationaux.

**Épouse du chef, Yaoundé** : Préside une association féminine de 30 membres. HODIX lui permet de gérer les cotisations, de télécharger les relevés officiels pour les banques, et de présenter un Trust Score pour une demande de microcrédit.

---

## Données techniques

- **Framework** : React Native (Expo Router v3)
- **Backend** : Supabase (PostgreSQL + Auth + Storage)
- **Mobile Money** : API MTN MOMO, Orange Money API
- **Déploiement web** : Vercel
- **Sécurité** : Chiffrement AES-256, PIN, OTP SMS, KYC

---

## Légal & Conformité

- Politique de confidentialité : https://hodix.app/privacy
- CGU : https://hodix.app/cgu
- Droits sur les données : https://hodix.app/data-rights
- Conforme au Règlement CEMAC sur la protection des données
- Principes RGPD appliqués pour la diaspora européenne
- DPO : privacy@hodix.app

---

## Contact & Support

- Email général : contact@hodix.app
- Support utilisateur : support@hodix.app
- WhatsApp Business : +237 6XX XXX XXX
- Siège social : Douala, Cameroun
