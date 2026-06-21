# Backend FastAPI / MongoDB — ARCHIVÉ

Ce dossier contient l'ancien backend **FastAPI + MongoDB** (Railway). Il n'est **plus utilisé** par l'application mobile/web HODIX depuis la migration vers **Supabase** (Postgres + Auth + RLS + Edge Functions).

## Statut

- **Archivé le :** juin 2026
- **Remplacement :** `src/api.ts` → `src/db/*` (Supabase)
- **Ne pas déployer** en production sans révision de sécurité complète

## Contenu

- `server.py` — point d'entrée FastAPI
- `routes_*.py` — routes REST legacy (auth, tontines, paiements Stripe, KYC Mongo)
- `db.py` — client MongoDB Motor

## Déploiement legacy (référence uniquement)

```bash
# Ancien flux Railway — conservé pour historique
docker build -t hodix-legacy-api .
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Variables d'environnement : voir `.env.example` racine (section MongoDB / JWT — legacy).

## Migration

Toute nouvelle fonctionnalité doit être implémentée dans :
- `supabase/migrations/` — schéma Postgres + RPC
- `supabase/functions/` — Edge Functions
- `src/db/` — couche données Expo
