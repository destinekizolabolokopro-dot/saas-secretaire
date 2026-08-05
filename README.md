# Ally — maquette front

Secrétaire IA pour professionnels solo (avocats en priorité, puis médecins,
artisans, consultants). Cette étape livre le **front complet en données
fictives** : aucun serveur, aucune base, aucun appel téléphonique réel.

Ce qui est réel malgré tout : la persistance (localStorage), la synthèse et la
reconnaissance vocale du navigateur, le moteur d'intentions qui répond aux
demandes, et le cloisonnement des comptes entre eux.

## Lancer

Aucune dépendance, aucun build.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Le fichier `ally-demo.html` s'ouvre par simple double-clic : il contient tout
(CSS, JS, polices). **Le micro n'y fonctionne pas** — la reconnaissance vocale
exige un contexte sécurisé, donc `https` ou `localhost`. Servi par un serveur,
le reste du produit est identique.

## Écrans

| Fichier | Contenu |
| --- | --- |
| `index.html` | Landing marketing, tarifs, liste d'attente |
| `abonnement.html` | Choix de formule → création de compte → vérification par code |
| `login.html` | Connexion, vérification d'adresse, mot de passe oublié |
| `onboarding.html` | Questionnaire en 7 étapes → génération du profil métier |
| `dashboard.html` | Espace pro : 5 onglets + espace Compte |
| `admin.html` | Console d'administration, réservée au rôle admin |

Parcours complet : `index.html` → « Essayer 14 jours » → formule → compte →
code → questionnaire → espace pro.

## Comptes de démonstration

| Rôle | Adresse | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@ally.fr` | `ally-admin-2026` |
| Professionnel | `camille.roux@cabinetroux.fr` | `demo1234` |

Ces identifiants sont affichés sur la page de connexion. **À supprimer avant
toute mise en ligne.** L'annuaire livré contient seize comptes fictifs, avec des
formules, des statuts et des dates d'inscription variés — sans quoi la console
d'administration ne montrerait rien.

## Rôles

**Professionnel.** Voit son cabinet et rien d'autre. Sa configuration est
stockée sous une clé propre à son compte : deux professionnels qui se
connectent depuis le même navigateur ne se voient pas.

**Administrateur.** Voit la plateforme : comptes, formules, revenus, journal
d'activité. Il ne voit **aucun contenu d'appel ni d'email** — seulement des
volumes et des statuts. C'est un choix de conception, pas une limite technique :
un administrateur qui peut lire les transcriptions d'un cabinet d'avocats est un
risque, pas une fonctionnalité.

## Authentification

Vérification d'adresse par code à 6 chiffres, valable 10 minutes, 5 tentatives.
Récupération de mot de passe par le même mécanisme. La page de récupération
affiche le même message que l'adresse existe ou non, pour ne pas devenir un
outil permettant de découvrir qui est client.

Faute de serveur d'envoi, **les codes s'affichent à l'écran**, dans un cartouche
qui le dit explicitement.

> Les mots de passe sont « hachés » par une fonction non cryptographique, pour
> éviter de les écrire en clair dans le navigateur. **Ce n'est pas de la
> sécurité.** En production le hachage se fait côté serveur, avec argon2id.

## Questionnaire

Sept étapes : métier, identité, activité, disponibilités, sujets traités,
règles, récapitulatif.

Les réponses ne servent pas qu'à remplir un formulaire :

- le **volume d'appels** choisit la formule recommandée, et l'écran de
  récapitulatif propose d'en changer si celle souscrite ne colle pas ;
- les **sujets décochés** sont retirés de la base de connaissances — Ally
  prendra un message au lieu de répondre ;
- la **consigne « ce qu'Ally ne doit jamais dire »** est reprise telle quelle
  dans le script d'appel ;
- la **durée de rendez-vous** est celle que l'agenda utilise par défaut.

## Structure

```
css/tokens.css      variables du design system (surfaces, accents, typo, rayons)
css/base.css        reset, @font-face, boutons, cartes, champs, pastilles, codes
css/site.css        landing, connexion, inscription, questionnaire
css/dashboard.css   espace pro
css/admin.css       console d'administration
js/profiles.js      profils métier et jeux de données par profession
js/plans.js         formules Permanence / Cabinet / Expert et capacités
js/accounts.js      annuaire des comptes, rôles, session, codes, statistiques
js/store.js         configuration du compte connecté, persistance, quotas
js/ui.js            composants partagés (saisie de code, jauge, message éphémère)
js/brain.js         moteur d'intentions — déterministe, pas de LLM
js/converse.js      couche conversationnelle (contexte court, suivi, relances)
js/voice.js         synthèse et reconnaissance vocale du navigateur
js/agenda.js        calendrier mensuel, résolution de dates en langage naturel
js/telephony.js     ligne, script d'appel, simulation d'appel entrant
js/palette.js       palette de commandes (⌘K)
js/dashboard.js     espace pro
js/admin.js         console d'administration
js/onboarding.js    questionnaire
js/landing.js       scroll-reveal, menu mobile, liste d'attente
js/login.js         connexion, vérification, récupération
js/subscribe.js     choix de formule et création de compte
build-demo.js       assemble le tout en un fichier autonome
fonts/              Inter + Space Grotesk auto-hébergées (WOFF2)
```

## Pourquoi un moteur déterministe et pas un LLM

`js/brain.js` reconnaît les intentions par règles explicites. C'est moins
impressionnant qu'un modèle, et c'est délibéré : sur un poste où un écrit engage
la responsabilité d'un avocat, on doit pouvoir expliquer pourquoi Ally a
répondu ce qu'elle a répondu. Le LLM arrive côté serveur, pour la rédaction et
la qualification, là où sa sortie est relue par la logique métier.

## Formules

| Formule | Prix | Ce qu'elle change |
| --- | --- | --- |
| Permanence | 79 € | Menu vocal à touches, **sans IA** |
| Cabinet | 149 € | Agent vocal, rédaction, commande vocale |
| Expert | 249 € | Multi-lignes, routage, base de connaissances avancée |

Les capacités déclarées dans `js/plans.js` pilotent réellement l'interface : une
fonctionnalité absente de la formule est masquée et remplacée par une invitation
à monter en gamme, jamais désactivée en silence.

## Données fictives

La date de l'espace pro est figée au **mardi 28 juillet 2026** : les libellés de
l'agenda et les rendez-vous de démonstration s'y rapportent, une date dynamique
les rendrait incohérents. Les dates de l'annuaire, elles, sont relatives à
aujourd'hui — sinon le graphique des inscriptions serait toujours vide.

## Écarts assumés par rapport aux maquettes

1. **Orbite du hero corrigée.** Le prototype avait deux défauts : l'anneau 2
   n'avait pas de keyframe `from`, donc il ne parcourait que 130°→360° avant de
   resauter ; l'anneau 3 réutilisait la contre-rotation de l'anneau 2, ce qui
   laissait sa pill penchée de 20°.
2. **Responsive ajouté.** Les maquettes n'avaient aucune media query. La
   landing descend à 320px ; le dashboard passe sa sidebar en drawer sous 900px
   et abandonne le `height:100vh + overflow:hidden` qui empêchait tout scroll.
3. **Contrôles accessibles.** Le prototype n'utilisait que des `<div onClick>`.
   Tout est ici `<button>`, `role="switch"`, `<input>` avec label.
4. **Polices auto-hébergées.** Les maquettes chargeaient Google Fonts par CDN,
   ce qui transmet l'IP des visiteurs à un tiers — difficilement défendable
   pour un produit dont l'argument central est la conformité RGPD.
5. **`prefers-reduced-motion` respecté**, absent du prototype.

## Suite

Le serveur reste à écrire : webhooks Retell, Google Calendar, Brevo, base de
données, authentification réelle, Stripe. Le découpage, la sécurité prévue et
les décisions produit arrêtées sont dans [`ARCHITECTURE.md`](ARCHITECTURE.md).
