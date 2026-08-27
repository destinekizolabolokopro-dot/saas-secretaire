# Ally — API

Fondation du serveur. **Aucune dépendance** : uniquement des modules Node
natifs, pour qu'il démarre partout et qu'il n'y ait rien de plus à auditer.

```bash
node server/index.js       # http://localhost:8787 — API *et* maquette
node server/test.js        # 70 contrôles
```

Le serveur sert aussi les fichiers du front : une seule commande fait tourner
l'ensemble. Ouvrez http://localhost:8787 et **le compte devient réel** :
l'inscription, le code de vérification, la connexion, la déconnexion et le mot
de passe oublié passent par l'API — mot de passe haché en scrypt, session en
cookie httpOnly, tentatives plafonnées. Dans **Téléphonie**, la carte
**« La ligne réelle »** montre les appels livrés par le webhook.

Sans API — fichier autonome, hébergeur statique — les mêmes écrans retombent sur
l'annuaire du navigateur et tout continue de fonctionner. C'est `js/gate.js` qui
choisit, et les écrans n'en savent rien.

Pour y voir un appel, il faut le signer comme le ferait Retell :

```bash
CAB=cab_xxx   # renvoyé par /api/auth/signup
SECRET=$RETELL_WEBHOOK_SECRET
BODY=$(printf '{"cabinetId":"%s","from":"06 11 22 33 44","outcome":"transferred","summary":"Audience demain"}' "$CAB")
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:8787/api/webhooks/retell \
  -H "content-type: application/json" \
  -H "x-retell-signature: t=$TS,v1=$SIG" \
  -d "$BODY"
```

## L'administrateur

Il ne se crée pas par un formulaire : **aucune route n'accorde ce rôle**, sinon
un champ oublié dans une inscription suffirait à devenir administrateur de la
plateforme. Il vient de l'environnement du serveur, c'est-à-dire de quelqu'un
qui a déjà accès à la machine :

```bash
ALLY_ADMIN_EMAIL=vous@ally.fr \
ALLY_ADMIN_PASSWORD='un mot de passe long' \
node server/index.js
```

Le compte est créé au démarrage s'il n'existe pas, promu s'il existe déjà, et
son mot de passe **n'est jamais réécrit** par l'environnement — vous avez pu le
changer depuis. Un mot de passe de moins de douze caractères est refusé : ce
compte voit toute la plateforme.

Connecté, il trouve dans la console la carte **« la plateforme réelle »** :
cabinets inscrits, sessions ouvertes, volumes, journal du serveur. Jamais un
résumé d'appel ni un corps d'email — l'API d'administration n'en renvoie pas.

## Pourquoi cette forme

Ce n'est pas encore le produit : ni Retell, ni Brevo, ni Google, ni Stripe ne
sont branchés — ils demandent des comptes, des clés et une validation OAuth.

Ce qui est ici, en revanche, est ce qui **coûte le plus cher à rajouter après** :
le cloisonnement, le chiffrement des champs, la vérification des signatures, le
hachage des mots de passe, la limitation du débit, le journal d'accès. Chacun a
un test qui échoue si on le casse.

## Ce qui est en place

| Mesure | Où | Vérifié par |
| --- | --- | --- |
| Cloisonnement par cabinet | `lib/repo.js` | 7 tests, dont l'accès par identifiant direct |
| Chiffrement des champs sensibles | `lib/crypto.js` | aller-retour, altération refusée, base illisible |
| Hachage des mots de passe (scrypt) | `lib/crypto.js` | empreintes distinctes, comparaison à temps constant |
| Signature des webhooks | `lib/crypto.js` | absente, fausse, périmée, corps réécrit |
| Limitation du débit | `lib/http.js` | plafond sur la connexion |
| Journal d'accès | `lib/store.js` | présence des événements sensibles |
| Séparation des rôles | `index.js` | un pro reçoit 403 sur l'administration |
| Service de fichiers sans traversée | `lib/static.js` | `/server/...` et `/../etc/passwd` refusés |
| Parcours de compte de bout en bout | `js/gate.js` + `index.js` | 14 contrôles au navigateur : inscription, code, session, oubli |
| Rôle administrateur hors d'atteinte | `lib/auth.js` | un formulaire qui réclame `role: admin` reste « pro » |
| Places du cabinet comptées au serveur | `lib/auth.js` | une formule à une place refuse, interface contournée ou non |
| Agenda cloisonné, créneau unique | `index.js` | 409 sur un créneau pris, libre pour un autre cabinet |
| Export et effacement RGPD | `lib/auth.js` | export cloisonné sans empreintes, suppression sous mot de passe |
| Configuration du cabinet chiffrée | `index.js` | illisible en base, absente de `/me`, refus d'une version plus ancienne |
| Conservation appliquée | `lib/auth.js` | les enregistrements périmés partent, les récents restent |
| Responsable seul à inviter et retirer | `lib/auth.js` | un collaborateur reçoit 403, un autre cabinet reçoit 404 |
| Politique de contenu avec nonce par réponse | `lib/static.js` | scripts restreints, page non encadrable, nonce jamais constant |
| Connexion insensible au chronomètre | `lib/auth.js` | écart de temps inexistant entre compte connu et inconnu |
| Fichier de données en 0600 | `lib/store.js` | droits vérifiés après écriture |
| Console d'administration réelle | `js/platform.js` | 10 contrôles : volumes vrais, contenu jamais exposé, refus côté API |
| Envoi différé de 10 s | `index.js` | part après le délai, jamais si annulé |

## Le cloisonnement, en une règle

On n'accède jamais à une collection directement. On demande un dépôt lié à un
cabinet, et **ce cabinet vient du jeton de session** :

```js
const data = repo.forCabinet(session.cabinetId);
const calls = data.calls.list();          // filtré, toujours
const one   = data.calls.get(req.params.id);  // null si c'est celui d'un autre
```

`repo.forCabinet()` lève une exception sans identifiant, et `create()` réécrit
le `cabinetId` même si l'appelant en fournit un autre. Un identifiant
appartenant à un autre cabinet répond **404, exactement comme un identifiant
inexistant** : la réponse ne doit pas permettre de deviner qu'une ressource
existe ailleurs.

## L'audit, et ce qu'il a trouvé

Le serveur a été relu ligne à ligne. Neuf défauts corrigés, chacun avec un test
qui échoue si on le réintroduit :

| Ce qui n'allait pas | Conséquence |
| --- | --- |
| La connexion ne dérivait aucune empreinte pour un compte inexistant | 44 ms contre 0,05 ms : chronométrer révélait qui est client |
| Le plafond de « mot de passe oublié » n'était pas lu | route ouverte à volonté — de quoi inonder une boîte mail |
| Les compteurs de débit n'étaient jamais effacés | mémoire qui enfle à chaque adresse inventée |
| Les sessions expirées restaient en base | fichier qui ne fait que grossir |
| Un cookie mal formé faisait lever `decodeURIComponent` | 500 sur **toutes** les requêtes de ce navigateur, pages comprises |
| Un chemin mal encodé faisait de même | 500 au lieu de 404 |
| Le fichier de données était créé en 0644 | lisible par tout compte de la machine |
| Un champ chiffré illisible faisait lever le déchiffrement | une ligne abîmée rendait tout l'onglet inaccessible |
| Aucune politique de contenu sur les pages | un script injecté s'exécutait, la page pouvait être encadrée |

## Ce qu'il reste à faire

**Base de données.** `lib/store.js` écrit un fichier JSON. C'est le plus petit
substitut crédible pour écrire et tester les règles. Le passage à PostgreSQL ne
touche que `store.js` et `repo.js` : aucune route ne connaît de requête.

**argon2id** remplacera scrypt. Le format stocké porte déjà ses paramètres, on
pourra donc migrer sans invalider les comptes.

**Intégrations** : Retell (le point d'entrée existe, signé et testé), Brevo (la
file d'envoi existe, il manque l'appel), Google Calendar (OAuth à faire valider,
plusieurs semaines), Stripe.

**Compteur de débit partagé.** La limitation est en mémoire : derrière
plusieurs instances, elle se divise par le nombre de machines. Redis, ou
l'équivalent de l'hébergeur.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `ALLY_SECRET_KEY` | Clé de chiffrement, 32 octets en hexadécimal. **Obligatoire en production.** |
| `RETELL_WEBHOOK_SECRET` | Secret de signature des webhooks |
| `ALLY_DATA_DIR` | Emplacement du fichier de données |
| `ALLY_TRUST_PROXY` | `1` derrière un proxy, pour lire `x-forwarded-for` |
| `PORT` | Port d'écoute, 8787 par défaut |
| `NODE_ENV` | `production` : impose la clé, ajoute `Secure` au cookie, masque les codes |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sans `ALLY_SECRET_KEY`, le serveur dérive une clé de développement **et le dit
au démarrage**. En production il refuse de démarrer : mieux vaut une panne
visible qu'un chiffrement en trompe-l'œil.

## En développement, les codes reviennent dans la réponse

L'inscription et la récupération de mot de passe renvoient `devCode`, pour
dérouler le parcours sans boîte mail. Ce champ **disparaît dès que
`NODE_ENV=production`** — sinon n'importe qui vérifierait le compte d'un autre.
