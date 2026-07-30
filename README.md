# Ally — maquette front

Secrétaire IA pour professionnels solo (avocats en priorité, puis médecins,
artisans, consultants). Cette étape livre le **front complet en données
fictives** : aucun backend, aucune base, aucun appel réel.

## Lancer

Aucune dépendance, aucun build. N'importe quel serveur statique :

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Ouvrir directement les fichiers en `file://` fonctionne aussi.

## Écrans

| Fichier | Contenu |
| --- | --- |
| `index.html` | Landing marketing, formulaire liste d'attente |
| `login.html` | Connexion (démonstration : n'importe quelle adresse valide passe) |
| `onboarding.html` | Questionnaire 4 étapes → génération du profil métier |
| `dashboard.html` | Espace pro, 10 onglets |

Parcours de démo : `index.html` → « Espace pro » → connexion → onboarding →
tableau de bord.

## Structure

```
css/tokens.css      variables du design system (surfaces, accents, typo, rayons)
css/base.css        reset, @font-face, boutons, cartes, toggles, champs
css/site.css        landing + connexion + onboarding
css/dashboard.css   espace pro
js/mock-data.js     données fictives (appels, emails, RDV, FAQ, factures, journal…)
js/dashboard.js     onglets, interactions, commande vocale
js/onboarding.js    profils métier, horaires, règles, récapitulatif
js/landing.js       scroll-reveal, menu mobile, liste d'attente
js/login.js         redirection onboarding / tableau de bord
fonts/              Inter + Space Grotesk auto-hébergées (WOFF2)
```

## Profils métier

Le choix du métier à l'onboarding génère le script d'accueil et les niveaux
d'autonomie. Pour les métiers à secret professionnel renforcé (avocat,
médecin), le mode « brouillon à valider » est **verrouillé** : l'interrupteur
est désactivé et la règle affichée comme imposée par le profil.

## Commande vocale

Bouton flottant « Parler à Ally » + overlay d'écoute, historique des ordres
vocaux et réglage du niveau de confirmation (aucune / actions sensibles /
systématique) dans l'onglet Configuration IA.

**L'interface n'est pas branchée** : ni reconnaissance (STT) ni synthèse (TTS).
Les ordres de démonstration défilent depuis `ALLY_DATA.voiceDemo`. Le niveau de
confirmation choisi pilote réellement le comportement de l'overlay.

## Écarts assumés par rapport aux maquettes

Les prototypes de référence (`Ally.dc.html`, `Ally Dashboard.dc.html`) ont été
suivis fidèlement sur les couleurs, la typographie et les espacements. Cinq
écarts délibérés :

1. **Orbite du hero corrigée.** Le prototype avait deux défauts : l'anneau 2
   n'avait pas de keyframe `from`, donc il ne parcourait que 130°→360° avant de
   resauter ; l'anneau 3 réutilisait la contre-rotation de l'anneau 2, ce qui
   laissait sa pill penchée de 20°. Chaque anneau a désormais son tour complet
   depuis son angle de départ et une contre-rotation exactement opposée.
2. **Responsive ajouté.** Les maquettes n'avaient aucune media query. La
   landing descend à 320px ; le dashboard passe sa sidebar en drawer sous 900px
   et abandonne le `height:100vh + overflow:hidden` qui empêchait tout scroll.
3. **Contrôles accessibles.** Le prototype n'utilisait que des `<div onClick>`.
   Tout est ici `<button>`, `role="switch"`, `<input>` avec label : navigation
   clavier, focus visible, états annoncés.
4. **Polices auto-hébergées.** Les maquettes chargeaient Google Fonts par CDN,
   ce qui transmet l'IP des visiteurs à un tiers — difficilement défendable
   pour un produit dont l'argument central est la conformité RGPD.
5. **`prefers-reduced-motion` respecté**, absent du prototype qui animait en
   permanence.

Corrections mineures : filet supprimé sous la dernière ligne des listes,
`:last-child` traité.

## Données fictives

La date de l'espace pro est figée au **mardi 28 juillet 2026**, comme dans la
maquette : les libellés « Jeu 30 », « Ven 31 » et le déplacement au 31/07 s'y
rapportent. Une date dynamique rendrait ces données incohérentes.

Tout est dans `js/mock-data.js`, à remplacer par les réponses d'une API.

## Suite

Le front est en HTML/CSS/JS sans framework, à la demande. Le code est découpé
(tokens isolés, données séparées du rendu) pour qu'un passage ultérieur vers
Next.js — nécessaire dès qu'il faudra une vraie auth et une persistance — reste
peu coûteux.
