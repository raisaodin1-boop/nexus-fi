# HODIX — Plateforme africaine de tontines & épargne participative

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Expo 51 (React Native Web) + TypeScript |
| Backend actif | **Supabase** (Postgres, Auth, RLS, RPC, Edge Functions) |
| Paiements | CinetPay (Mobile Money + checkout) |
| KYC | Smile Identity + revue admin |
| Auth | Supabase Auth + OTP Twilio |
| Frontend Deploy | Vercel / EAS Build |
| Observabilité | Sentry (`EXPO_PUBLIC_SENTRY_DSN`) |
| Legacy (archivé) | FastAPI + MongoDB → `archive/backend-legacy/` |

---

## Structure du projet

```
nexus-fi/
│
├── app/                          # Écrans Expo Router (routage automatique)
│   ├── _layout.tsx               # Layout racine + providers globaux
│   ├── +html.tsx                 # HTML wrapper (SEO, meta, fonts web)
│   ├── onboarding.tsx            # Accueil / splash
│   ├── index.tsx                 # KYC (vérification identité)
│   ├── member-dashboard.tsx      # Dashboard membre
│   ├── admin-dashboard.tsx       # Dashboard super-admin
│   ├── manager-dashboard.tsx     # Dashboard tontine manager
│   ├── complete-profile.tsx      # Complétion du profil
│   ├── pay.tsx                   # Paiement
│   ├── withdraw.tsx              # Retrait
│   ├── receipt.tsx               # Reçu de transaction
│   ├── create.tsx                # Création tontine/groupe
│   ├── group-detail.tsx          # Détail groupe
│   ├── group-forms.tsx           # Formulaires groupe
│   ├── join.tsx                  # Rejoindre un groupe
│   ├── notifications.tsx         # Centre de notifications
│   ├── referral.tsx              # Parrainage
│   ├── qr-receive.tsx            # QR code réception
│   ├── promotion-request.tsx     # Demande de promotion
│   ├── cgu.tsx                   # Conditions générales
│   └── [id].tsx                  # Route dynamique
│
├── src/                          # Code frontend partagé
│   ├── api.ts                    # Client HTTP (fetch wrapper + auth)
│   ├── auth-context.tsx          # Contexte d'authentification global
│   ├── theme.ts                  # Tokens de couleurs et styles HODIX
│   ├── theme-context.tsx         # Contexte thème (dark/light)
│   ├── i18n.tsx                  # Internationalisation (FR/EN)
│   ├── toast.tsx                 # Système de notifications in-app
│   ├── tooltip.tsx               # Composant tooltip
│   ├── offline.tsx               # Bannière hors-ligne + hook réseau
│   ├── logo.tsx                  # Logo officiel HODIX
│   ├── charts.tsx                # Graphiques SVG (line + bar)
│   ├── ui.tsx                    # Composants UI primitifs (Button, Card…)
│   ├── trust-gauge.tsx           # Jauge Trust Score (SVG semi-cercle)
│   ├── share.ts                  # Partage natif
│   ├── hooks/
│   │   └── use-icon-fonts.ts     # Chargement des fonts d'icônes Expo
│   ├── utils/
│   │   └── storage/
│   │       ├── storage-base.ts   # Classe abstraite de stockage
│   │       ├── index.ts          # Implémentation native (AsyncStorage + SecureStore)
│   │       └── index.web.ts      # Implémentation web (IndexedDB via AsyncStorage)
│   └── constants/
│       └── testIds/
│           ├── index.js          # Export centralisé des testIDs
│           └── auth.js           # TestIDs pour le module auth
│
├── backend/                      # Serveur FastAPI Python
│   ├── server.py                 # Point d'entrée + CORS + startup
│   ├── models.py                 # Modèles MongoDB (Pydantic)
│   ├── db.py                     # Connexion MongoDB + indexes
│   ├── deps.py                   # Dépendances FastAPI (auth, db)
│   ├── security.py               # JWT, hashing, tokens
│   ├── scheduler.py              # APScheduler (rappels SMS journaliers)
│   ├── audit.py                  # Journalisation des actions
│   ├── migrations.py             # Migrations de données
│   ├── seed.py                   # Données initiales (admin de test)
│   ├── sms.py                    # Envoi SMS via Twilio
│   ├── trust_score.py            # Calcul du score de confiance
│   ├── identity_engine.py        # Moteur de vérification d'identité (KYC)
│   ├── rate_limiter.py           # Rate limiting (slowapi)
│   ├── payment_config.py         # Config Stripe & limites financières
│   ├── notifications_svc.py      # Service de notifications push
│   ├── routes_auth.py            # Auth : login, register, OTP, refresh
│   ├── routes_users.py           # Gestion utilisateurs et profils
│   ├── routes_tontines.py        # Tontines : CRUD + cycles
│   ├── routes_groups.py          # Groupes d'épargne
│   ├── routes_payments.py        # Paiements Stripe + retraits
│   ├── routes_savings.py         # Épargne individuelle
│   ├── routes_identity.py        # KYC + vérification identité
│   ├── routes_premium.py         # Fonctionnalités premium
│   ├── routes_fraud.py           # Détection de fraude
│   ├── routes_referral.py        # Système de parrainage
│   ├── routes_extras.py          # Analytics, PDF, manager routes
│   ├── routes_ws.py              # WebSockets temps réel
│   └── requirements.txt          # Dépendances Python
│
├── assets/                       # Fichiers statiques
│   ├── images/                   # Icônes app (Expo)
│   │   ├── icon.png
│   │   ├── adaptive-icon.png
│   │   ├── splash-icon.png
│   │   ├── splash-image.png
│   │   ├── favicon.png
│   │   └── app-image.png
│   ├── brand/                    # Identité visuelle HODIX
│   │   ├── hodix-logo.png
│   │   ├── hodix-icon-set.png
│   │   └── hodix-icon-square.png
│   └── fonts/
│       └── SpaceMono-Regular.ttf
│
├── app.json                      # Config Expo (web, iOS, Android)
├── package.json                  # Dépendances Node + scripts
├── tsconfig.json                 # TypeScript (alias @/src/*)
├── babel.config.js               # Babel (résolution des alias)
├── metro.config.js               # Metro bundler (SVG, web)
├── vercel.json                   # Déploiement Vercel (frontend)
├── railway.json                  # Déploiement Railway (backend)
├── Procfile                      # Heroku / Railway start command
├── .env.example                  # Template des variables d'environnement
├── design_guidelines.json        # Charte graphique HODIX
└── README.md                     # Ce fichier
```

---

## Démarrage rapide

### Frontend (web local)

```bash
npm install
npm run web          # dev → http://localhost:8081
npm run build:web    # build statique → dist/
```

### Backend (local)

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # remplir les valeurs
uvicorn server:app --reload
```

---

## Variables d'environnement

### Vercel (frontend)

Dans le dashboard Vercel → Settings → Environment Variables :

| Variable | Exemple |
|----------|---------|
| `EXPO_PUBLIC_BACKEND_URL` | `https://hodix-api.railway.app` |
| `EXPO_PUBLIC_SENTRY_DSN` | `https://xxx@sentry.io/xxx` |

### Railway (backend)

Voir `.env.example` pour la liste complète (Mongo, JWT, Twilio, Stripe, Sentry…).

---

## Déploiement

### Frontend → Vercel

1. Connecter le repo GitHub à Vercel
2. Ajouter les 2 variables d'env ci-dessus
3. Vercel détecte `vercel.json` → lance `npm run build:web` → sert `dist/`

### Backend → Railway

Railway détecte `railway.json` → lance `cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT`

> Le backend et le frontend sont **déployés séparément** : Railway pour l'API, Vercel pour le web.
