# HODIX — Plateforme africaine de tontines & épargne participative

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Expo (React Native Web) + TypeScript |
| Backend | FastAPI (Python) + MongoDB |
| Auth | JWT + OTP Twilio |
| Paiements | Stripe |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |
| Monitoring | Sentry |

---

## Démarrage rapide

### Frontend (Vercel / local web)

```bash
npm install
npm run web          # dev local
npm run build:web    # build statique → dist/
```

### Backend (Railway / local)

```bash
pip install -r requirements.txt
cp .env.example .env   # remplir les valeurs
uvicorn server:app --reload
```

---

## Variables d'environnement Vercel

Dans le dashboard Vercel → Settings → Environment Variables :

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_BACKEND_URL` | URL complète du backend (ex: `https://hodix-api.railway.app`) |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN Sentry pour le monitoring web |

---

## Variables d'environnement Backend (Railway)

Voir `.env.example` pour la liste complète.

---

## Structure

```
nexus-fi/
├── Frontend (Expo Router)
│   ├── _layout.tsx          — Layout racine + providers
│   ├── +html.tsx            — HTML wrapper web (SEO)
│   ├── onboarding.tsx       — Écran d'accueil
│   ├── member-dashboard.tsx — Dashboard membre
│   ├── admin-dashboard.tsx  — Dashboard admin
│   ├── auth-context.tsx     — Contexte d'auth
│   ├── api.ts               — Client HTTP
│   └── ...
│
└── Backend (FastAPI)
    ├── server.py            — Point d'entrée
    ├── routes_auth.py       — Auth / OTP
    ├── routes_tontines.py   — Tontines
    ├── routes_payments.py   — Paiements Stripe
    ├── routes_users.py      — Gestion utilisateurs
    └── ...
```

---

## Déploiement Vercel

1. Connecter le repo GitHub à Vercel
2. Ajouter les variables d'env (`EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_SENTRY_DSN`)
3. Vercel détecte automatiquement `vercel.json` et lance `npm run build:web`
4. Output : dossier `dist/` servi comme site statique

> **Note** : Le backend Python tourne séparément sur Railway. Il n'est PAS déployé sur Vercel.
