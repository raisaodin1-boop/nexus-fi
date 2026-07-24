# Data Safety — réponses suggérées (Play Console)

Aligné sur https://www.hodix.app/privacy et l’écran `/data-rights`.

## Collecte

| Donnée | Collectée | Partagée | Obligatoire | Finalité |
|--------|-----------|----------|-------------|----------|
| Email / téléphone | Oui | Non (sauf prestataires paiement) | Compte | Auth, support |
| Nom | Oui | Non | Compte / KYC | Identité |
| Documents KYC (photos) | Oui | Prestataire KYC / conformité | KYC | Vérification identité |
| Transactions financières | Oui | Prestataires MoMo / paiement | Service | Wallet, cotisations |
| Identifiants appareil / push | Oui | FCM | Optionnel push | Notifications |
| Approx. localisation | Non | — | — | — |
| Contacts | Non | — | — | — |
| Caméra live | Non | — | — | Galerie uniquement |

## Sécurité

- Données chiffrées en transit : **Oui** (HTTPS)
- Utilisateurs peuvent demander suppression : **Oui** (Profil → Mes données, ou privacy@hodix.app)
- Engagement suppression compte : **Oui**
- Politique de confidentialité : https://www.hodix.app/privacy

## Partage

- Processeurs : Supabase (backend), FCM (push), Paynote/CinetPay (paiements), éventuellement SMS OTP
- Pas de vente de données
- Pas de pub tierce

## Âge

- Public cible : 18+
- Pas conçu pour enfants
