# Ti Maël

Site de Ti Maël, la crêperie aux volets bleus, dans une maison vendéenne de plain-pied.
Site statique (HTML/CSS, aucune étape de build) construit d'après la charte de marque Ti Maël (2026 · v2).

- `index.html` : la page (accueil, la maison, la carte, infos pratiques)
- `assets/styles.css` : jetons et composants de la charte, en version écran
- `assets/fonts.css` : Instrument Serif et Jost, auto-hébergées (SIL OFL 1.1)
- `assets/badge.svg` : badge couleur autonome (favicon, partage)

Pour l'aperçu, ouvrir `index.html` dans un navigateur. En ligne, `vercel.json` active les adresses courtes (`/cuisine`, `/admin`…). Pour le déploiement, publier le dossier tel quel (Vercel, Netlify, GitHub Pages).

À compléter : adresse, téléphone, horaires définitifs, prix réels, photos (emplacements en pointillés).

## Pages

| Page | Pour qui | Rôle |
|---|---|---|
| `index.html` | Clients | Vitrine, carte en direct, panier et commande en ligne, avis |
| `suivi.html` | Clients | Suivi de la commande en direct, addition, avis une fois servie |
| `fidelite.html` | Clients | Points, roue des lots, lots à utiliser |
| `cuisine.html` (`/cuisine`) | Équipe (code PIN) | Tickets du service, ruptures, ouverture des commandes, historique |
| `gestion.html` (`/admin`) | Équipe (code PIN) | Carte, horaires, remises et fidélité, roue, modération des avis |
| `ecran.html` | Salle | Numéros en préparation et prêts, à afficher sur un écran |

## Base de données

Supabase, projet « Ti Maël » (`qhavgcbckxswmhxauavy`). Le navigateur n'utilise que la clé publique `anon` (`assets/api.js`) :

- lecture de la carte (`rayons`, `articles`) protégée par RLS ;
- commandes passées via la fonction Edge `commander`, qui recalcule prix, remises et points côté serveur ;
- tout le reste via des fonctions SQL (`service_etat`, `suivi_commande`, `cuisine_*`, `admin_*`…), celles de l'équipe vérifiant un code PIN.
