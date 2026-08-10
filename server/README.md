# Ally — API

Fondation du serveur. **Aucune dépendance** : uniquement des modules Node
natifs, pour qu'il démarre partout et qu'il n'y ait rien de plus à auditer.

```bash
node server/index.js       # http://localhost:8787
node server/test.js        # 35 contrôles
```

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
