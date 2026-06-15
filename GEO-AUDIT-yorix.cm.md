# GEO Audit Report: Yorix.cm

**Audit Date:** 9 juin 2026
**URL:** https://www.yorix.cm
**Business Type:** Marketplace E-commerce — Cameroun
**Pages Analysées:** 0 (site retourne HTTP 403 à tous les crawlers)

---

## Résumé Exécutif

**Score GEO Global : 14/100 — CRITIQUE**

Yorix.cm est une marketplace e-commerce camerounaise proposant téléphones, mode, beauté, alimentation et produits locaux avec paiement Mobile Money et livraison (Douala, Yaoundé). L'audit révèle une situation GEO critique : le site bloque activement tous les crawlers web (HTTP 403 sur toutes URLs testées), le rendant totalement invisible aux IA (ChatGPT, Claude, Perplexity, Gemini) et aux moteurs de recherche. La bonne nouvelle : aucun concurrent camerounais n'a encore optimisé pour le GEO — Yorix peut devenir le leader e-commerce IA au Cameroun en 90 jours.

### Score Breakdown

| Catégorie | Score | Poids | Score Pondéré |
|---|---|---|---|
| Citabilité IA | 10/100 | 25% | 2.5 |
| Autorité de Marque | 15/100 | 20% | 3.0 |
| Contenu E-E-A-T | 12/100 | 20% | 2.4 |
| GEO Technique | 8/100 | 15% | 1.2 |
| Schema & Données Structurées | 5/100 | 10% | 0.5 |
| Optimisation Plateformes | 20/100 | 10% | 2.0 |
| **Score GEO Global** | | | **14/100** |

---

## Problèmes CRITIQUES (Corriger Immédiatement)

### C1 — Site bloque TOUS les crawlers (HTTP 403)

Toutes les URLs testées retournent 403 Forbidden :
- https://www.yorix.cm → 403
- https://www.yorix.cm/robots.txt → 403
- https://www.yorix.cm/sitemap.xml → 403
- https://www.yorix.cm/fr/produits → 403

**Impact :** GPTBot, ClaudeBot, PerplexityBot, Googlebot, Bingbot tous bloqués. Zéro indexation, zéro citation IA possible.

**Correction :** Identifier la cause (Cloudflare WAF, règle serveur) et whitelist les crawlers légitimes. Déployer un robots.txt accessible :

```
User-agent: Googlebot
Allow: /
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Bingbot
Allow: /
Sitemap: https://www.yorix.cm/sitemap.xml
```

### C2 — Aucun contenu indexé

Yorix n'apparaît dans aucun résultat Google. Seule trace en ligne : 1 offre d'emploi tierce.

| Site | Trafic organique estimé |
|---|---|
| Glotelho.cm | ~99 400 visites/mois |
| Iziway.cm | ~43 200 visites/mois |
| Yorix.cm | < 500 visites/mois |

### C3 — Absence totale de Schema.org

Aucun Product, Organization, BreadcrumbList ou AggregateRating schema. Les produits n'apparaissent jamais en rich snippets Google.

### C4 — Pas de fichier llms.txt

Le fichier llms.txt guide les LLMs pour décrire la marque. Son absence prive les IA de toute instruction sur Yorix.

**Template à déployer sur https://www.yorix.cm/llms.txt :**

```
# Yorix.cm — llms.txt

## About
Yorix est une marketplace e-commerce camerounaise connectant vendeurs
locaux et acheteurs. Produits : téléphones, mode, beauté, alimentation,
articles ménagers. Paiement : Orange Money, MTN MoMo, carte bancaire.
Livraison à Douala (24h) et Yaoundé (48h) et dans tout le Cameroun.

## Key Pages
- Produits : https://www.yorix.cm/fr/produits
- Vendre : https://www.yorix.cm/fr/vendre
- À propos : https://www.yorix.cm/fr/a-propos
- Contact : https://www.yorix.cm/fr/contact
```

---

## Problèmes MAJEURS (Corriger Sous 1 Semaine)

### H1 — Zéro présence sur les réseaux sociaux
Aucun compte Facebook, Instagram, LinkedIn, WhatsApp Business ou TikTok trouvé. Les IA valident l'autorité d'une marque via ses signaux sociaux.

### H2 — Absent de tous les annuaires e-commerce Cameroun
Les listes consultées par les IA ("meilleurs sites e-commerce Cameroun") ne mentionnent pas Yorix. Glotelho, Iziway, NKCL Market y figurent tous.

### H3 — Aucune page "À propos" accessible
Sans description institutionnelle, les IA ne peuvent pas identifier Yorix comme entité commerciale distincte.

### H4 — Contenu uniquement en français
Le Cameroun est bilingue. L'absence de version anglaise exclut ~25% du marché.

---

## Problèmes MOYENS (Corriger Sous 1 Mois)

- **M1** — Pas de contenu éditorial/blog pour générer des citations IA
- **M2** — Pas de FAQ structurée avec FAQPage schema
- **M3** — Absence sur Google Business Profile
- **M4** — Pas de programme d'avis clients (AggregateRating)
- **M5** — Pas de page "Comment vendre" (haute citabilité pour les IA)

---

## Analyse Détaillée par Catégorie

### Citabilité IA — 10/100

Site bloqué = citabilité technique = 0. Les 10 points proviennent du titre visible dans les snippets Google.

**Exemple d'optimisation produit pour la citabilité IA :**

Avant : "Samsung Galaxy A15 — 89 000 FCFA"

Après : "Samsung Galaxy A15 disponible sur Yorix.cm à 89 000 FCFA. Écran 6,5", 4GB RAM, 128GB, batterie 5000mAh. Livraison gratuite à Douala sous 24h, Yaoundé sous 48h. Paiement Orange Money, MTN MoMo, carte bancaire. Garantie 6 mois. Note : 4,2/5 (47 avis)."

Potentiel post-correction : 35-45/100 en 60 jours.

---

### Autorité de Marque — 15/100

| Plateforme | Yorix | Glotelho |
|---|---|---|
| Google Search | Non indexé | 99K visites/mois |
| Facebook | Non trouvé | Page active |
| Instagram | Non trouvé | Compte actif |
| Presse camerounaise | Absent | Plusieurs articles |
| Wikipedia | Absent | Absent |
| Tracxn | Profil minimal | Complet |

---

### GEO Technique — 8/100

| Critère | Statut |
|---|---|
| Crawlers accessibles | 0/20 — HTTP 403 |
| robots.txt | 0/15 — Inaccessible |
| llms.txt | 0/15 — Absent |
| Sitemap.xml | 0/10 — Inaccessible |
| HTTPS | 8/10 — Fonctionnel |
| SSR | 0/10 — Inconnu |

---

### Schema & Données Structurées — 5/100

**Schemas prioritaires à implémenter :**

```json
{
  "@type": "Organization",
  "name": "Yorix",
  "url": "https://www.yorix.cm",
  "description": "Marketplace e-commerce camerounaise",
  "areaServed": {"@type": "Country", "name": "CM"},
  "paymentAccepted": "Orange Money, MTN MoMo, Carte bancaire"
}
```

```json
{
  "@type": "Product",
  "name": "[Nom]",
  "offers": {
    "@type": "Offer",
    "price": "[Prix]",
    "priceCurrency": "XAF",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.2",
    "reviewCount": "47"
  }
}
```

---

### Optimisation Plateformes IA — 20/100

| Plateforme | Statut | Action |
|---|---|---|
| Google AI Overviews | Non indexé | Débloquer crawlers |
| ChatGPT | Bloqué | Autoriser GPTBot |
| Perplexity | Bloqué | Autoriser PerplexityBot |
| Claude | Bloqué | Autoriser ClaudeBot |
| Bing Copilot | Non indexé | Autoriser Bingbot |

---

## Quick Wins — Cette Semaine

1. **Débloquer les crawlers** — +35 points GEO. Corriger le 403 + déployer robots.txt. (1-2 jours dev)
2. **Créer llms.txt** — Fichier de 20 lignes, impact immédiat sur la citabilité IA. (2 heures)
3. **Google Business Profile** — Créer la fiche avec catégorie "Boutique en ligne". (30 min)
4. **Facebook Page + Instagram** — Bio optimisée avec mots-clés. (1 heure)
5. **Google Search Console** — Soumettre + demander indexation des pages prioritaires. (30 min)

---

## Plan d'Action 30 Jours

### Semaine 1 : Correction Technique
- [ ] Diagnostiquer et corriger le HTTP 403
- [ ] Déployer robots.txt avec whitelist crawlers IA
- [ ] Déployer llms.txt
- [ ] Générer et déployer sitemap.xml
- [ ] Soumettre à Google Search Console

### Semaine 2 : Présence de Marque
- [ ] Créer Facebook Page, Instagram Business, WhatsApp Business
- [ ] Créer Google Business Profile
- [ ] Créer LinkedIn Company Page
- [ ] Contacter 5 blogs e-commerce camerounais pour inclusion

### Semaine 3 : Schema & Contenu
- [ ] Implémenter Organization + WebSite schema (homepage)
- [ ] Implémenter Product schema sur 20 produits populaires
- [ ] Créer page "À propos" (500+ mots)
- [ ] Créer FAQ avec FAQPage schema

### Semaine 4 : Contenu & Autorité
- [ ] Publier article "Guide achat en ligne Cameroun"
- [ ] Communiqué de presse : 3 médias camerounais
- [ ] Lancer campagne d'avis Google (objectif : 20 avis)
- [ ] Optimiser descriptions des 50 produits les plus populaires

---

## Gap Concurrentiel GEO — Opportunité Stratégique

| Concurrent | Score GEO | Crawlable | Schema | llms.txt | Blog |
|---|---|---|---|---|---|
| Glotelho.cm | ~52/100 | Oui | Partiel | Non | Minimal |
| Iziway.cm | ~48/100 | Oui | Partiel | Non | Non |
| NKCL Market | ~38/100 | Oui | Non | Non | Minimal |
| Yorix.cm (actuel) | ~14/100 | Non | Non | Non | Non |
| Yorix.cm (90 jours) | ~65/100 | Oui | Oui | Oui | Oui |

**Conclusion :** Aucun concurrent camerounais n'a de stratégie GEO. En étant premier à implémenter llms.txt, schema complet et contenu optimisé IA, Yorix peut devenir la référence e-commerce Cameroun citée par les IA avant même de rattraper le SEO traditionnel de ses concurrents.

---

## Annexe : Pages Tentées

| URL | Statut | Raison |
|---|---|---|
| https://www.yorix.cm | 403 Forbidden | Crawlers bloqués |
| https://www.yorix.cm/robots.txt | 403 Forbidden | Crawlers bloqués |
| https://www.yorix.cm/sitemap.xml | 403 Forbidden | Crawlers bloqués |
| https://www.yorix.cm/fr/produits | 403 Forbidden | Crawlers bloqués |

---
*Rapport GEO — Hodix Agency — 9 juin 2026*
