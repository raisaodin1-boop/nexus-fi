# Rapport d'audit complet — HODIX / Nexus-Fi

**Analyse globale · Niveau licorne fintech africaine**  
**Date :** Juin 2026  
**Stack :** Expo 51 + React Native + Supabase + CinetPay + Resend  
**Projet Supabase :** `lrbhojxlofweotajnrhh`  
**Dépôt :** https://github.com/raisaodin1-boop/nexus-fi

---

## Résumé exécutif

**HODIX** est une fintech africaine de tontines et d'épargne participative, construite en **Expo/React Native** (web + mobile) avec **Supabase** comme backend principal.

| Indicateur | Valeur |
|------------|--------|
| Écrans | ~72 routes Expo |
| Modules métier | Tontines, Wallet, Épargne, Associations, Coopératives, Fonds, Identité, Admin |
| Backend actif | Supabase (Postgres + Auth + RLS + RPC + Edge Functions) |
| Backend legacy | FastAPI/MongoDB — **non utilisé** par l'app mobile |
| Paiements | CinetPay (Orange/MTN/Moov/Carte) |
| Emails | Resend (reçus transaction + bienvenue inscription) |
| Tests automatisés | **0** dans le repo frontend |

**Score de maturité global estimé : 44/100**

Le produit dispose d'une base UX solide et d'un positionnement différenciant (tontine + trust score + épargne participative), mais les **paiements production**, la **conformité réglementaire** et les **tests** bloquent encore le passage au niveau licorne.

### Maturité par dimension

| Dimension | Score /100 | Niveau |
|-----------|------------|--------|
| Produit UX | 72 | Bon |
| Paiements | 38 | Critique |
| Sécurité / RLS | 55 | Moyen |
| Conformité KYC | 22 | Critique |
| Fiabilité / Tests | 8 | Critique |
| Scalabilité backend | 45 | Moyen |
| Data & Analytics | 50 | Moyen |
| Go-to-market Afrique | 60 | Bon |

---

## 1. Vue d'ensemble de l'application

### Positionnement

HODIX combine :
- **Tontines digitales** (cotisations, cycles, escrow, votes d'exclusion)
- **Wallet** (recharge, retrait, transfert, sécurité PIN/OTP)
- **Épargne participative** (objectifs, analytics)
- **Groupes** (associations, coopératives, fonds)
- **Identité financière** (trust score, piliers, certificats)

### Différenciateur clé

Combiner tontine digitale + identité financière (trust score) pour débloquer le **crédit alternatif** — un marché énorme en Afrique francophone.

---

## 2. Architecture actuelle

```
┌─────────────────────────────────────────────────────────────┐
│                    App Expo (72 écrans)                      │
│   UI → src/api.ts (router) → src/db/* (couche Supabase)     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Supabase                                │
│  • Auth JWT                                                  │
│  • Postgres + RLS                                            │
│  • RPC wallet (topup / withdraw atomiques)                   │
│  • Edge Functions : send-otp, send-receipt, send-welcome     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           FastAPI + MongoDB (LEGACY — non utilisé)           │
└─────────────────────────────────────────────────────────────┘
```

### Points forts

- Architecture directe client → Supabase : latence faible, coûts maîtrisés
- 72 écrans — couverture fonctionnelle large
- Flux CinetPay unifié (`/pay`) pour cotisations et recharges
- Sécurité wallet : PIN, OTP, freeze, cooling period, limites transactionnelles
- Trust score / identité financière — différenciateur crédit alternatif
- RLS Supabase + RPC atomiques wallet (pas de UPDATE client sur balances)

### Points faibles

- **0 tests automatisés** dans le repo frontend
- Backend FastAPI/MongoDB obsolète mais toujours présent (confusion, dette)
- README obsolète (Stripe, Railway, Twilio vs réalité Supabase/CinetPay)
- Retrait wallet débite sans payout Mobile Money réel
- KYC cosmétique — pas d'upload document ni vérification tierce
- Pas de webhook CinetPay — confirmation manuelle côté client (partiellement compensée)

---

## 3. Bugs identifiés et corrections

| # | Bug | Sévérité | Statut |
|---|-----|----------|--------|
| 1 | `topup.tsx` — variable `loading` non définie (crash) | Critique | ✅ Corrigé |
| 2 | Recharge wallet sans CinetPay (crédit direct) | Critique | ✅ Corrigé |
| 3 | Sandbox paiement trop permissif (ref ≥ 4 chars) | Haute | ✅ Corrigé |
| 4 | `reportEscrowDispute` — notif au mauvais `user_id` | Haute | ✅ Corrigé |
| 5 | `score_delta` vs `points_delta` (identity_events) | Haute | ✅ Corrigé |
| 6 | Routes analytics dashboards 404 | Moyenne | ✅ Corrigé |
| 7 | Consent GET utilisait `body` au lieu de query | Moyenne | ✅ Corrigé |
| 8 | KYC `pending` vs `pending_review` | Moyenne | ✅ Corrigé |
| 9 | Table `tontine_consent` vs `tontine_consents` | Moyenne | ✅ Corrigé |
| 10 | Route `/notifications/consent` manquante | Moyenne | ✅ Corrigé |
| 11 | Tables `tontine_escrow` + `identity_scores` absentes | Haute | ✅ Migration appliquée |
| 12 | DatePicker — sélection mois/année manquante | Moyenne | ✅ Corrigé (commit `b641fd6`) |
| 13 | Reçus transaction par email absents | Moyenne | ✅ Corrigé (commit `f399c3b`) |
| 14 | Email de bienvenue à l'inscription absent | Moyenne | ✅ Corrigé (commit `f399c3b`) |

### Commits de correction

| Commit | Description |
|--------|-------------|
| `295161e` | Audit bugs — CinetPay wallet topup, analytics, schema alignment |
| `b641fd6` | DatePicker mois/année sur tous les champs date |
| `f399c3b` | Emails Resend — reçus transaction + bienvenue inscription |

### Migrations Supabase appliquées

- `schema_alignment_v2` — `tontine_escrow`, `identity_scores`, colonnes alignées
- `profile_notification_consent` — `push_consent`, `marketing_consent`
- `payment_receipt_email` — colonne `receipt_email_sent_at`
- `welcome_email` — colonne `welcome_email_sent_at`

### Edge Functions déployées

| Function | Rôle |
|----------|------|
| `send-otp` | OTP 2FA (Twilio SMS ou fallback in-app) |
| `send-receipt` | Reçu de transaction par email (Resend) |
| `send-welcome` | Email de bienvenue à l'inscription (Resend) |

---

## 4. Analyse par module

| Module | Écrans | Maturité | Forces | Gaps vers licorne |
|--------|--------|----------|--------|-------------------|
| **Tontines** | 12 | 70% | Escrow, votes, leaderboard, RLS | Cycles auto, SMS rappels, médiation |
| **Wallet** | 6 | 45% | PIN, OTP, freeze, limites | Payout réel, ledger double-entry |
| **Épargne** | 5 | 65% | Objectifs, analytics, prédictions | Intérêts, produits structurés |
| **Groupes** | 10 | 55% | Assoc/coop/fonds unifiés | Gouvernance, assemblées |
| **Identité** | 4 | 40% | Trust score, piliers, NFT certs | KYC documentaire, bureau crédit |
| **Paiements** | 2 | 35% | Flux CinetPay unifié `/pay` | Webhook, réconciliation, refunds |
| **Admin** | 3 | 50% | Stats, KYC review, broadcast | Dashboard conformité |
| **Messages / Notifs** | 3 | 55% | In-app + email Resend | Push production, templates |

---

## 5. Positionnement concurrentiel Afrique

| Acteur | Force | Opportunité HODIX |
|--------|-------|-------------------|
| Chipper Cash | Paiements P2P pan-africain | Pas de tontine native |
| M-Pesa | Réseau agents + confiance | Produit tontine limité |
| Kuda / OPay | UX néobanque | Focus Nigeria |
| Djamo | UX premium Côte d'Ivoire | Pas tontines communautaires |
| **HODIX** | Tontine + trust score + épargne | Paiements prod + conformité |

---

## 6. Roadmap vers le statut Licorne

### P0 — Immédiat (0-30 jours)

- [ ] Configurer CinetPay production + webhook `notify_url`
- [ ] Edge Function webhook pour confirmer paiements sans action utilisateur
- [ ] Retrait wallet via API payout réelle (Orange/MTN disbursement)
- [ ] Tests E2E critiques : auth, cotisation, recharge, retrait
- [ ] Mettre à jour le README (Supabase + CinetPay, pas Stripe/FastAPI)
- [ ] Vérifier domaine `hodix.app` sur Resend (production emails)

**Config CinetPay production :**
```env
EXPO_PUBLIC_CINETPAY_API_KEY=
EXPO_PUBLIC_CINETPAY_SITE_ID=
EXPO_PUBLIC_CINETPAY_NOTIFY_URL=   # Edge Function webhook
EXPO_PUBLIC_CINETPAY_RETURN_URL=
EXPO_PUBLIC_PAYMENT_SANDBOX=false  # prod uniquement
```

**Secrets Supabase (Edge Functions) :**
```env
RESEND_API_KEY=re_xxxxxxxx
RECEIPT_FROM_EMAIL=receipts@hodix.app
RECEIPT_FROM_NAME=HODIX
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

### P1 — 1-3 mois

- KYC complet : upload CNI + selfie + vérification tierce (Smile ID / Onfido)
- Conformité COBAC/CEMAC : registre immutable, audit trail, reporting régulateur
- Unifier ou retirer backend FastAPI/MongoDB legacy
- Observabilité : Sentry + logs structurés + alertes fraude
- USSD / SMS fallback pour zones faible connectivité

### P2 — 3-6 mois

- Scoring crédit alternatif (historique tontine → bureau de crédit partenaire)
- Escrow automatisé avec release programmé + médiation
- Multi-pays : XOF, GHS, NGN avec agrégateurs locaux
- API B2B pour MFIs, coopératives, employeurs (payroll tontine)
- Programme partenaires agents (cash-in/cash-out physique)

### P3 — Licorne (6-18 mois)

- Licence émetteur monnaie électronique ou partenariat banque agréée
- Volume > 1M tx/mois, NPS > 50, churn < 5%
- IA fraude temps réel + graph analysis réseaux tontine
- Produits crédit garantis par épargne/tontine (collateralized lending)
- Expansion 10+ pays Afrique francophone + anglophone

---

## 7. Répartition effort recommandée (12 prochains mois)

| Domaine | % effort ingénierie |
|---------|---------------------|
| Paiements & conformité | 30% |
| KYC & identité | 20% |
| Tests & fiabilité | 15% |
| Produit & UX | 15% |
| Croissance & B2B | 12% |
| Infra & observabilité | 8% |

---

## 8. Projection maturité (M0 → M18)

| Mois | Maturité produit | Conformité / licence | Volume tx (index) |
|------|------------------|----------------------|-------------------|
| M0 | 44 | 15 | 5 |
| M3 | 55 | 30 | 15 |
| M6 | 65 | 50 | 35 |
| M9 | 72 | 65 | 60 |
| M12 | 80 | 78 | 85 |
| M18 | 90 | 92 | 100 |

*Volume tx normalisé — index 100 = cible licorne*

---

## 9. Fichiers clés du projet

```
nexus-fi/
├── app/                    # 72 écrans Expo Router
│   ├── (auth)/             # login, register
│   ├── (tabs)/             # home, savings, groups, identity, profile
│   ├── wallet/             # topup, withdraw, transfer, pin-setup
│   ├── pay.tsx             # Flux paiement CinetPay unifié
│   └── receipt.tsx         # Reçu + renvoi email
├── src/
│   ├── api.ts              # Router frontend → db/
│   ├── db/                 # Couche Supabase (payments, tontines, wallet…)
│   ├── auth-context.tsx    # Auth + email bienvenue
│   └── payment-receipt.ts  # Formatage reçus
├── supabase/
│   ├── functions/
│   │   ├── send-otp/
│   │   ├── send-receipt/
│   │   └── send-welcome/
│   └── migrations/
└── backend/                # FastAPI legacy (non utilisé)
```

---

## 10. Recommandations prioritaires

1. **Webhook CinetPay** — supprimer la dépendance à la confirmation manuelle
2. **Payout réel** — le retrait ne doit pas être uniquement comptable
3. **KYC documentaire** — obligation réglementaire avant scale
4. **Suite de tests** — minimum smoke E2E sur les flux financiers
5. **Nettoyage legacy** — retirer FastAPI ou documenter clairement son statut
6. **Domaine email prod** — `receipts@hodix.app` sur Resend

---

## Annexe — Canvas interactif

Une version interactive du rapport (graphiques, tableaux, roadmap) est disponible dans Cursor :

`nexus-fi-audit-licorne.canvas.tsx`

---

*Rapport généré par audit automatisé du codebase HODIX/Nexus-Fi — Juin 2026*  
*Dernière mise à jour : post-corrections commits `295161e`, `b641fd6`, `f399c3b`*
