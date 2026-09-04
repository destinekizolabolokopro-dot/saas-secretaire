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

## Vérifier

```bash
node tests/run.js          # prononciation, moteur d'intentions, serveur
```

Une seconde, sans navigateur ni réseau : ces tests chargent le front dans Node
et interrogent directement le moteur. Les tests d'interface, eux, ouvrent un
vrai Chromium :

```bash
python3 -m http.server 8123
node tests/navigateur/run.js       # les quatre suites d'un coup
```

| Suite | Ce qu'elle attrape |
| --- | --- |
| `ecran.js` | Une erreur au chargement, un onglet qui ne rend rien, un débordement horizontal sur téléphone |
| `clavier.js` | Le focus : une fenêtre modale dont on sort à la tabulation sans l'avoir fermée, un focus rendu à personne |
| `contraste.js` | Un texte sous le seuil du WCAG, une commande sans nom accessible — mesurés au canvas, pas estimés à l'œil |
| `ligne.js` | La mise en service du renvoi d'appel |

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
| `onboarding.html` | Questionnaire en 8 étapes → génération du profil métier |
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

Ils n'existent que **hors serveur**. Dès que l'API répond, la page de connexion
les retire d'elle-même et le dit : les afficher enverrait droit dans le mur,
puisque le serveur ne les connaît pas.

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

### Deux mondes, un seul écran

Les mêmes pages fonctionnent avec ou sans serveur, et `js/gate.js` choisit :

| | Sans serveur | Avec `node server/index.js` |
| --- | --- | --- |
| Où vit le compte | ce navigateur | le serveur |
| Mot de passe | empreinte de démonstration | scrypt, sel par compte |
| Session | clé de `localStorage` | cookie httpOnly, 12 h |
| Code de vérification | affiché à l'écran | émis par le serveur, affiché tant que `NODE_ENV` n'est pas `production` |
| Tentatives | illimitées | plafonnées par adresse IP **et** par compte visé |
| Comptes de démonstration | proposés sur l'écran de connexion | masqués : ils n'existent pas côté serveur |

> Hors serveur, les mots de passe sont « hachés » par une fonction non
> cryptographique, pour éviter de les écrire en clair dans le navigateur.
> **Ce n'est pas de la sécurité** — c'est une maquette. Dès que le serveur
> répond, c'est lui qui hache, vérifie et tient la session.

## Questionnaire

Huit étapes : métier, identité, activité, disponibilités, sujets traités,
urgences, règles, récapitulatif.

Les réponses ne servent pas qu'à remplir un formulaire :

- le **volume d'appels** choisit la formule recommandée, et l'écran de
  récapitulatif propose d'en changer si celle souscrite ne colle pas ;
- les **sujets décochés** sont retirés de la base de connaissances — Ally
  prendra un message au lieu de répondre ;
- les **motifs d'urgence cochés** sont ce que le moteur écoute pendant l'appel :
  décocher « une audience dans les 48 heures » et Ally cesse de transférer
  l'appelant qui en parle. Chaque motif porte le vocabulaire réel de son métier,
  et le professionnel peut ajouter ses propres mots ;
- la **consigne « ce qu'Ally ne doit jamais dire »** est reprise telle quelle
  dans le script d'appel ;
- la **durée de rendez-vous** est celle que l'agenda utilise par défaut.

« Urgent » et « urgence » déclenchent toujours un transfert, quels que soient
les réglages : un appelant qui le dit explicitement doit être entendu. Et si la
règle « transférer les urgences » est désactivée, Ally reconnaît toujours
l'urgence — elle la signale en priorité au lieu de faire sonner.

## Un compte neuf est vide

Un professionnel qui vient de s'inscrire n'a pas d'historique. Son tableau de
bord ne montre donc **aucun appel, aucun email, aucun rendez-vous** — il décrit
ce qui se passera au premier appel, et propose de brancher la ligne. Afficher
les appels d'un cabinet fictif à quelqu'un qui vient de s'inscrire est le moyen
le plus rapide de lui faire comprendre que rien de tout cela n'est à lui.

Un bouton **« Voir avec des données d'exemple »** charge le jeu de
démonstration du métier, et **« Retirer les données d'exemple »** le reprend,
sans toucher à la configuration. Le compte de démonstration anonyme, lui, reste
rempli : on doit pouvoir regarder l'espace pro sans créer de compte.

Les rendez-vous d'exemple sont datés du 28 juillet 2026 dans les profils ; ils
sont **décalés sur la semaine en cours** au chargement, en conservant leur
position relative. Un calendrier ouvert sur un autre mois se remarque
immédiatement.

## Ce qui rend l'expérience personnelle

**L'heure et l'état de la ligne.** L'accueil dit « Bonsoir » après 18 h et
croise l'heure réelle avec les horaires déclarés : « Vous avez fermé à 18 h 30
— Ally prend le relais jusqu'à demain à 9 h. »

**Le registre de parole.** Trois registres — sobre, chaleureux, direct — qui
réécrivent l'accueil téléphonique, les réponses du script d'appel et l'en-tête
des emails. Le choix se fait au questionnaire, avec l'aperçu écrit et un bouton
**Écouter** : c'est le moment où le professionnel entend sa secrétaire pour la
première fois.

**La mise en service.** Quatre gestes en tête du tableau de bord, cochés quand
l'action est réellement faite — écouter l'accueil, poser le renvoi d'appel
(coché par le premier appel reçu, pas par un code copié), connecter l'agenda,
remplir la fiche du cabinet. La carte
disparaît d'elle-même. Sans renvoi d'appel posé, la ligne ne sonne jamais et le
professionnel conclut que le produit ne marche pas.

**La fiche du cabinet.** Adresse, accès, stationnement, moyens de paiement,
tarif, délai de réponse. Chaque champ rempli devient une fiche que le moteur
peut servir : « où puis-je me garer ? » reçoit une vraie réponse au lieu d'une
prise de message.

**Des chiffres qui viennent des faits.** « 27 appels manqués évités, 6 h 20
gagnées cette semaine » venaient du profil métier et s'affichaient à
l'identique le premier jour, avant le moindre appel. Ils sont calculés : appels
reçus, emails partis, et une estimation assumée du temps gagné — trois minutes
par appel pris à votre place, quatre par email rédigé. Sur un compte neuf ils
valent zéro, ce qui est la vérité.

**L'aperçu du résumé quotidien.** L'email exact qui partirait ce soir, avec les
données et le nom du compte. Un réglage qu'on n'a jamais vu à l'œuvre ne
s'active pas.

## Envoi rattrapable, forfait jamais coupé

**Dix secondes pour se rétracter.** Un email validé — ou dicté à la voix — part
au bout de dix secondes, pas immédiatement. Le décompte s'affiche sur le
brouillon et dans un message flottant, avec un bouton *Annuler*. C'est le
garde-fou du choix produit « aucune confirmation orale avant envoi » : une
erreur de transcription reste rattrapable, sans imposer une validation à chaque
fois.

**Le forfait ne coupe jamais la ligne.** Au-delà du quota, Ally continue de
décrocher et les appels sont facturés à l'unité (0,45 € / 0,35 € / 0,25 € selon
la formule). Avertissement à 80 %, surcoût réel affiché ensuite, formule
supérieure à portée de clic. Un appel refusé coûte plus cher au cabinet qu'un
appel facturé.

## Ce qu'Ally remarque

Une suggestion au plus, jamais deux fois la même, refusable définitivement — et
toujours appuyée sur des gestes réellement comptés dans `S.history` :

- quatre brouillons validés d'affilée sans retouche → elle propose de les
  envoyer directement ;
- trois prises de message faute d'information → elle propose de remplir la
  fiche du cabinet ;
- deux envois rattrapés de justesse → elle propose de repasser en validation
  systématique.

Le journal ne contient que des types d'événements et des horodatages, jamais de
contenu métier. Une IA qui suggère au hasard use la patience plus vite qu'elle
ne rend service : sans geste compté, aucune carte ne s'affiche.

## Poser le renvoi d'appel

C'est l'étape qui décide de tout : sans renvoi, la ligne ne sonne jamais et le
professionnel conclut que le produit ne marche pas. Elle a trois états, et ils
sont distingués honnêtement.

**Aucun numéro attribué.** Ally décroche sur un numéro qui lui est propre, loué
chez un opérateur et branché sur l'agent vocal. Il est **attribué par la
plateforme** — on ne choisit pas son propre numéro entrant, sinon n'importe qui
détournerait les appels d'un autre cabinet vers le sien. Tant qu'il n'est pas
posé, l'écran ne montre aucun code : il affichait jusqu'ici
`**61*09 72 XX XX 00*11*20#`, c'est-à-dire un renvoi vers nulle part, à
composer pour de vrai.

**Numéro attribué.** Les trois codes portent le vrai numéro, et chacun est un
lien `tel:` — sur un téléphone, une touche l'ouvre dans le clavier, il ne reste
qu'à appeler. C'est là qu'on est quand on pose un renvoi. Le dièse est encodé,
sinon le navigateur le prend pour une ancre et le code part tronqué. Un code de
repli sans délai est proposé pour les opérateurs qui refusent `*11*20#`, et
`*#61#` permet de vérifier l'état des renvois.

**Le renvoi fonctionne.** L'étape ne se coche plus quand on **copie** un code :
copier n'est pas composer, et se féliciter d'un geste qui n'a pas eu lieu laisse
quelqu'un croire que sa ligne est branchée alors qu'elle ne sonnera jamais. Elle
se coche sur le **premier appel réellement reçu** — la seule preuve qui existe —
ou sur une déclaration explicite, en attendant l'appel test.

## Parler à Ally, et l'entendre répondre

### Ce qu'elle prononce

La synthèse du navigateur lit le texte tel qu'il est écrit — ce qui est parfait
à l'écran et mauvais à l'oreille. « 14:00 » se dit « quatorze deux points zéro
zéro », « M. Lefebvre » devient « M point Lefebvre », « 06 12 34 56 78 » se
récite chiffre par chiffre et « 180 € » finit en « cent quatre-vingts E-U-R-O ».

`js/speech.js` réécrit donc le texte pour l'oreille avant de le confier au
moteur : heures, dates, montants, pourcentages, titres, sigles, adresses email,
et les numéros de téléphone dits par paires — « zéro six, douze, trente-quatre,
cinquante-six, soixante-dix-huit », comme au téléphone.

C'est le levier le plus efficace sur le naturel d'une voix : **changer de
moteur vocal s'entend moins que d'arrêter d'épeler les heures.**

Les réponses sont aussi découpées phrase par phrase, avec une respiration entre
chacune — plus longue après une question. La même voix paraît nettement moins
mécanique.

### Ce qu'elle comprend quand vous parlez

La reconnaissance rend des mots, jamais des chiffres : on dit « quatorze heures
trente », le navigateur écrit « quatorze heures trente », et le moteur cherchait
« 14h30 ». Dicter une heure ne marchait donc pas — l'usage le plus naturel qui
soit. La traduction inverse est faite avant l'analyse : « dans trois jours »,
« vingt-trois », « midi et demi », « dix heures moins le quart ».

Elle sert aussi au clavier : écrire « dans trois jours » marche désormais aussi
bien que « dans 3 jours ».

Le micro exige une page servie en `https` ou `localhost` — pas un fichier ouvert
en double-clic. L'écran le dit et bascule sur la saisie au clavier au lieu de
faire semblant d'écouter.

## Changer la voix d'Ally

Le sélecteur est le même composant à trois endroits, pour qu'il ne diverge pas :

- **au questionnaire**, étape 2, sous le registre de parole — cliquer une voix
  la fait dire votre phrase d'accueil ;
- **dans l'onglet Ally**, avec les curseurs de débit et de hauteur ;
- **dans l'onglet Téléphonie**, à côté du script d'appel.

Les voix proposées sont celles installées sur l'appareil : le navigateur ne
donne accès à rien d'autre. Sur un poste qui n'en a aucune (Linux sans moteur
vocal, navigateur sans synthèse), l'écran le dit et explique quoi installer,
plutôt que d'afficher une liste vide.

Le choix s'applique partout — accueil téléphonique, simulation d'appel,
réponses du chat — et survit au rechargement. La barre latérale affiche la voix
retenue.

Les voix ne se valent pas, et l'ordre du navigateur ne dit rien de leur
qualité. Ally les classe : les moteurs récents — Neural, Natural, Premium,
Enhanced, Google, Siri — sont d'une autre génération que les voix système
historiques, et portent la mention **« naturelle »**. Sans cette indication, on
choisit au hasard, on tombe sur la plus robotique, et on en conclut que
l'application parle mal.

> Cette voix est celle du **navigateur**, pour écouter et régler. La voix
> entendue au téléphone sera choisie côté serveur, chez le fournisseur de
> l'agent vocal.

## Structure

```
css/tokens.css      variables du design system (surfaces, accents, typo, rayons)
css/base.css        reset, @font-face, boutons, cartes, champs, pastilles, codes
css/site.css        landing, connexion, inscription, questionnaire
css/dashboard.css   espace pro
css/admin.css       console d'administration
js/profiles.js      profils métier et jeux de données par profession
js/plans.js         formules Permanence / Cabinet / Expert et capacités
js/accounts.js      annuaire des comptes du navigateur (rôles, session, codes)
js/api.js           pont vers l'API, quand une API répond
js/gate.js          porte d'entrée : inscription, code, connexion, oubli
js/live.js          carte « la ligne réelle » — les appels livrés par le serveur
js/mailbox.js       carte « le courrier réel » — la file d'envoi du serveur
js/team.js          carte « le cabinet » — collaborateurs, invitations, places
js/diary.js         carte « l'agenda réel » — rendez-vous du serveur, posés par Ally
js/sync.js          recopie les données du serveur dans l'espace de travail
js/configsync.js    la configuration du cabinet suit le cabinet, pas l'appareil
js/platform.js      carte « la plateforme réelle » — ce que le serveur sait vraiment
js/store.js         configuration du compte connecté, persistance, quotas
js/ui.js            composants partagés (saisie de code, jauge, message éphémère)
js/brain.js         moteur d'intentions — déterministe, pas de LLM
js/converse.js      couche conversationnelle (contexte court, suivi, relances)
js/speech.js        prononciation : ce qu'Ally dit, et ce qu'elle comprend dictée
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

## Le serveur

La fondation de l'API est dans [`server/`](server/README.md) — sans aucune
dépendance. Elle sert aussi la maquette, donc **une seule commande fait tourner
l'ensemble** :

```bash
node server/index.js       # http://localhost:8787 — API et maquette
node server/test.js        # 73 contrôles
```

### Le compte devient réel

Servies par l'API, les pages d'inscription et de connexion ne parlent plus à
l'annuaire du navigateur : le compte est créé sur le serveur, le code de
vérification y est émis, la session est un cookie httpOnly, et la déconnexion
la ferme des deux côtés. Le navigateur ne garde qu'une copie de travail du
compte — la configuration du cabinet (métier, ton, horaires, fiche) est encore
locale, il faut bien la ranger quelque part.

Un second test de bout en bout (14 contrôles) déroule tout le parcours à la
souris : inscription, mauvais code refusé, renvoi d'un nouveau code,
vérification, déconnexion qui ferme vraiment la session serveur, mot de passe
oublié puis changé — et vérifie enfin auprès de l'API que c'est bien le nouveau
mot de passe qu'elle exige.

### L'administrateur, côté serveur

Le compte administrateur ne s'obtient pas par un formulaire : aucune route ne
donne ce rôle. Il vient de l'environnement du serveur.

```bash
ALLY_ADMIN_EMAIL=vous@ally.fr ALLY_ADMIN_PASSWORD='un mot de passe long' \
node server/index.js
```

Connecté par l'écran habituel, il voit en tête de la console la carte **« la
plateforme réelle »** : les cabinets vraiment inscrits, les sessions ouvertes,
les volumes, le journal du serveur. Le reste de la console continue d'afficher
l'annuaire de démonstration, et la carte le dit.

### La configuration suit le cabinet, pas l'appareil

Métier, horaires, registre de parole, fiche, script d'appel, règles d'urgence :
tout cela vivait dans le seul navigateur qui l'avait saisi. On configurait Ally
sur son ordinateur, on ouvrait son téléphone, et l'espace était vierge. L'associé
qu'on venait d'inviter n'héritait de rien.

C'est le cabinet, pas un réglage d'appareil : la configuration est enregistrée
sur le serveur, **chiffrée** — le script d'appel et la fiche disent comment
travaille le cabinet, ses tarifs et ses délais.

Règle de conflit : la dernière écriture gagne, à condition d'être postérieure.
Le serveur refuse une version plus ancienne que celle qu'il détient, et
l'appareil concerné reprend alors la sienne. Et rien ne part avant d'avoir lu :
sans ce verrou, une page qui enregistre au chargement — le questionnaire —
poussait sa configuration par défaut et effaçait celle du cabinet.

### Les deux droits qui ne se négocient pas

**Récupérer ses données.** « Exporter mes données » télécharge un JSON qui
contient désormais aussi ce que le serveur détient — appels, emails,
rendez-vous, en clair. Exporter la seule copie du navigateur aurait été un
droit d'accès mal rendu.

**Les faire disparaître.** « Supprimer toutes mes données » efface le cabinet
sur le serveur : comptes, sessions, appels, emails, rendez-vous. Le mot de
passe est redemandé — un effacement irréversible ne doit pas tenir à un onglet
resté ouvert sur un poste partagé. Le journal en garde une trace, l'identifiant
du cabinet et rien d'autre, parce qu'il faut pouvoir prouver que la suppression
a eu lieu.

**Savoir qui a fait quoi.** Le journal d'accès de l'onglet Sécurité était écrit
en dur dans l'interface — trois lignes inventées, présentées comme un relevé.
Il vient du serveur, ne contient que les lignes du cabinet, et le dit
clairement quand il n'y a pas de serveur : « Exemple. Le journal réel apparaît
ici dès que la ligne est connectée. »

**Et ne pas garder au-delà.** La durée de conservation choisie dans l'onglet
Sécurité est appliquée par le serveur : les appels et les emails plus vieux
s'effacent au démarrage puis une fois par jour. Conserver « au cas où » est ce
que le RGPD interdit, et ce qui transforme une fuite en catastrophe.

### Toute l'application parle de la même journée

Les trois cartes « réelles » ne suffisaient pas : le reste de l'application
continuait de lire le navigateur. On posait un rendez-vous sur la ligne réelle,
on demandait à Ally « mes rendez-vous aujourd'hui ? », et elle récitait ceux du
jeu de démonstration. Le calendrier, l'onglet Aujourd'hui et l'aperçu du résumé
du soir racontaient la même histoire à côté de la plaque.

Les gestes repartent au serveur : annuler, reporter, ajouter — au calendrier
comme à la voix. « Prends un rendez-vous demain à 15 h 30 pour M. Bonnet » pose
vraiment le créneau sur la ligne, et le collaborateur d'à côté le voit.
Sans cela, on annulait un rendez-vous et il revenait quinze secondes plus tard,
ramené par la synchronisation — rien n'entame davantage la confiance dans un
outil.

`js/sync.js` recopie donc les appels et les rendez-vous du serveur dans la
structure que tout le front lit déjà. La règle : **dès que le serveur a quelque
chose, c'est lui qui a raison** — les exemples cèdent la place, parce qu'on ne
peut pas afficher deux journées dans le même agenda. Tant que le serveur n'a
rien, on ne touche à rien : qui explore le produit garde ses exemples.

### Le serveur apprend qui vous êtes

Le cabinet naît à l'inscription, où l'on ne sait presque rien : le métier et la
raison sociale ne sont demandés qu'au questionnaire, ensuite. Le serveur gardait
donc « Cabinet », métier « avocat », pour un plombier nommé autrement. La
dernière étape du questionnaire les lui transmet — le responsable seul peut le
faire, et la formule, elle, ne s'y change pas : elle relèvera du paiement.

Quand la ligne est connectée et que le jeu de démonstration est encore chargé,
l'écran le dit au lieu de laisser croire que tout est réel, et propose de
retirer les exemples d'un clic.

### L'agenda réel

La troisième promesse du produit. Les rendez-vous vivent sur le serveur,
partagés par tous les membres du cabinet et invisibles pour les autres. Le nom
du client et la note sont chiffrés en base ; la date et l'heure ne le sont pas,
sinon il faudrait tout déchiffrer pour trier ou repérer une collision.

Deux rendez-vous ne tiennent pas dans le même créneau — contrôle fait au
serveur, parce que c'est **Ally qui pose les rendez-vous pendant l'appel**, et
qu'elle ne passe pas par l'écran. L'agent vocal les transmet dans le même
message que l'appel ; si le créneau vient d'être pris, l'appel est enregistré
quand même et le rendez-vous simplement signalé comme non posé. Perdre l'appel
parce que l'agenda a bougé serait le pire des deux échecs.

Les rendez-vous pris au téléphone sont marqués comme tels dans la liste.

### Le forfait devient vrai

Ligne connectée, la consommation n'est plus une estimation tirée du profil
métier : le serveur compte **les appels reçus par le webhook et les emails
réellement partis** depuis le 1er du mois — jamais les brouillons, jamais les
envois annulés. L'onglet Abonnement affiche l'estimation du mois : forfait, plus
les unités au-delà au tarif de la formule (0,45 / 0,35 / 0,25 €).

La ligne n'est jamais coupée. Un appel refusé coûte au cabinet bien plus que
0,35 € — mais le professionnel doit voir venir le supplément, pas le découvrir
sur sa facture.

### Le courrier réel

Ligne connectée, valider un brouillon n'est plus une simulation : l'email entre
dans la **file du serveur**, où il attend les mêmes dix secondes. La carte en
tête de l'onglet Conversations montre cette file — en attente, parti, annulé —
et le bouton **Annuler** y fonctionne depuis n'importe quel appareil connecté au
même cabinet, pas seulement celui qui a lancé l'envoi.

Le décompte s'écrit dans le bouton sans redessiner la carte : redessiner
remplaçait le bouton sous le doigt de la personne, et rattraper un envoi est
précisément le geste qui ne doit jamais rater.

### Le cabinet à plusieurs

La formule Expert promet cinq collaborateurs ; jusqu'ici c'était une ligne dans
une grille de tarifs. Le responsable — celui qui a créé le compte — invite par
email depuis **Mon compte → Abonnement**. L'invité reçoit un lien
`login.html?invite=…` et un code, choisit son mot de passe, et partage dès lors
la ligne : mêmes appels, mêmes emails, sa propre session.

Les règles tiennent **côté serveur**, pas seulement à l'écran : un
collaborateur ne peut ni inviter ni retirer, personne ne retire le membre d'un
autre cabinet, retirer quelqu'un ferme ses sessions dans la seconde, et une
formule à une place refuse l'invitation même si l'on contourne l'interface.

### La ligne réelle

Ouvrez http://localhost:8787, onglet **Téléphonie** : une carte **« La ligne
réelle »** apparaît. C'est le seul endroit de la maquette alimenté par le
serveur — les appels transmis par le webhook de l'agent vocal, chiffrés en base,
visibles du seul cabinet concerné.

Sans API — fichier ouvert par double-clic, hébergeur statique — **la carte reste
masquée et tout le reste continue de fonctionner en local**. Le front ne devine
pas l'API : le serveur la déclare dans les pages qu'il sert. Sonder à l'aveugle
laisserait une erreur 404 dans la console de chaque visiteur, pour un état
parfaitement normal.

Un test de bout en bout (14 contrôles) démarre le vrai serveur et un vrai
navigateur : il envoie un appel signé, vérifie qu'il s'affiche chez le bon
cabinet, **qu'il reste invisible pour l'autre à l'écran comme par l'API**, que
le résumé n'est pas lisible dans le fichier de données, et que la liste se met à
jour sans rechargement.

Elle ne contient pas encore les intégrations (Retell, Brevo, Google, Stripe),
qui demandent des comptes et des clés. Elle contient ce qui coûte le plus cher
à rajouter après : cloisonnement des cabinets, chiffrement des champs
sensibles, signature des webhooks, hachage des mots de passe, limitation du
débit, journal d'accès. Chacun a un test qui échoue si on le casse.

Le découpage complet et les décisions produit arrêtées sont dans
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Avant la première mise en ligne

Ce qui suit n'est pas une liste de souhaits : ce sont des points qui rendent
une mise en ligne fautive tant qu'ils ne sont pas traités. Ils ne se voient
pas dans l'interface, c'est bien le problème.

**Retirer les accès de démonstration.** La page de connexion affiche deux
comptes avec leur mot de passe, dont un administrateur. C'est ce qui rend la
maquette essayable en dix secondes, et c'est une porte grande ouverte le jour
où elle est servie sur un domaine public. Le bloc `.demo-keys` de
`login.html`, et les comptes correspondants dans `js/accounts.js`.

**Écrire les mentions légales.** Un site marchand français les doit
(article 6-III de la LCEN) : dénomination et forme juridique, capital, adresse
du siège, email et téléphone, RCS ou SIREN, TVA intracommunautaire, directeur
de la publication, et l'identité de l'hébergeur. Rien de tout cela ne peut
être inventé ici — ce sont les vôtres. Il faut aussi les conditions générales
de vente (le service est vendu par abonnement, avec droit de rétractation) et
une politique de confidentialité qui dise ce que fait réellement le produit :
transcription d'appels, conservation, sous-traitants.

Le pied de page ne renvoie vers aucune de ces pages **parce qu'elles n'existent
pas** — un lien mort vaut moins qu'un lien absent. Les trois colonnes sont
prêtes à en accueillir une quatrième.

**Poser une vraie base de données.** Les données vivent dans un fichier JSON.
Cela tient pour une démonstration et ne tient plus à deux processus : deux
écritures simultanées se perdent. PostgreSQL, et le jour où l'on migre, passer
scrypt à argon2id — le premier est correct, le second est ce qu'on recommande
aujourd'hui.

**Ouvrir les comptes tiers.** Retell (numéro français), Brevo (envoi d'emails),
Scaleway ou OVH (hébergement européen), Stripe (paiement). Aucun ne peut être
créé depuis ici, et chacun conditionne une partie du produit qui n'est
aujourd'hui que simulée.

**Compteur de débit partagé.** La limitation est en mémoire : elle protège un
processus, pas une flotte. Redis, ou l'équivalent chez l'hébergeur retenu.
