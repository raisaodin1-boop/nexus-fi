# HODIX — Product Requirements (MVP v1)

**HODIX – Transform Community Savings Into Financial Identity. Building Trust Together.**

A mobile-first fintech platform helping Africans transform informal savings (tontines, associations, cooperatives, community funds) into a verifiable financial identity and trust score.

## Stack
- Frontend: Expo React Native (file-based routing), TypeScript, lucide-react-native, react-native-svg, expo-linear-gradient
- Backend: FastAPI + MongoDB (motor), JWT auth (python-jose + passlib bcrypt)
- PDF: reportlab (server-side certificate generation)

## Modules livrés
1. **Splash animé** + branding HODIX
2. **Onboarding 6 slides** animé
3. **Auth** : register, login, logout, forgot password (token in dev), reset password
4. **Profil utilisateur** (name, phone, gender, country, city, occupation, photo)
5. **Épargne personnelle** : goals (flexible/locked/recurring), deposits/withdrawals, history
6. **Tontines digitales** : create, join via code, rotation, contributions, beneficiaries
7. **Associations** : create, join, member contributions
8. **Coopératives** : create, join, capital tracking
9. **Fonds communautaires** : create, contribute, withdraw, balance tracking
10. **Trust Score Hodix (0-100)** : consistency / longevity / volume / participation / reliability + tips
11. **Identité Financière** : profil officiel + composantes + recommendations
12. **Reports PDF** : Identity, Trust Score, Savings certificates (downloadable via /api/reports/*)
13. **Notifications in-app** : feed + mark read / mark all read
14. **Console Super Admin** : analytics, users, audit logs
15. **Audit logs** sur tous les events sensibles

## Brand
Deep Blue `#0B1F3A`, Royal Blue `#1D4ED8`, Emerald `#10B981`. Mobile-first.

## Seed
9 demo users (Cameroun, Sénégal, Ghana, Mali, Côte d'Ivoire, Nigeria), 1 tontine, 1 association, 1 community fund, 32 savings transactions, 15 tontine contributions, notifications.
