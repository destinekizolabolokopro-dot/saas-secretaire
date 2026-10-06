# Mettre Ally en ligne

Ce fichier dit exactement quoi faire, dans quel ordre, et ce qui arrive si on
saute une étape.

---

## D'abord, une chose à savoir

**GitHub Pages ne peut pas faire tourner Ally.** Pages sert des fichiers, il
n'exécute rien. Or les comptes, les mots de passe, les codes de confirmation et
le cloisonnement des cabinets vivent dans un serveur Node.

Déposer ces pages sur Pages donnerait un site qui *a l'air* de marcher :
l'inscription s'afficherait, le tableau de bord s'ouvrirait — et chaque
visiteur se créerait un compte que lui seul verrait, dans son propre
navigateur. Rien ne serait partagé, rien ne survivrait à un vidage de cache, et
personne ne recevrait d'appel.

Le produit le dit maintenant de lui-même : servies en ligne sans API derrière,
les pages de connexion affichent « Pas de serveur derrière cette page ».

Donc deux usages, et il faut choisir :

| Ce que vous voulez | Où |
| --- | --- |
| Montrer le produit — une démonstration qu'on parcourt | GitHub Pages, ou le fichier `ally-demo.html` par double-clic |
| Ouvrir un service — de vrais clients, de vrais comptes | Un hébergeur qui exécute Node (voir plus bas) |

Le dépôt GitHub sert aux deux : il porte le code, l'intégration continue, et
c'est de lui que l'hébergeur tire le déploiement.

---

## 1. Le dépôt

```bash
git remote -v                 # vérifier où ça pousse
git push -u origin <branche>
```

L'intégration continue (`.github/workflows/tests.yml`) tourne à chaque poussée :
249 contrôles sans navigateur, 202 dans un vrai Chromium, et un garde-fou qui
échoue si `ally-demo.html` n'a pas été régénéré après une modification du front.

---

## 2. La démonstration sur GitHub Pages — facultatif

Dans **Settings → Pages**, choisissez « Deploy from a branch », la branche et le
dossier `/ (root)`. Le site s'ouvre sur `index.html`.

Rien à configurer : sans API, le front bascule tout seul en mode navigateur. Les
accès de démonstration (`admin@ally.fr`) ne s'affichent **pas** sur un domaine en
ligne — seulement en local ou dans le fichier autonome. Un mot de passe
d'administrateur publié sur le web n'est pas une démonstration.

---

## 3. Le vrai service

### Ce qu'il faut avant de commencer

| Quoi | Pourquoi | Sans |
| --- | --- | --- |
| Un hébergeur qui exécute Node ≥ 20 | Le serveur | rien ne tourne |
| Un volume persistant | `ALLY_DATA_DIR` | tout disparaît au redéploiement |
| Un domaine en HTTPS | Cookie `Secure` | la session voyage en clair |
| Un expéditeur d'emails | Les codes de confirmation | aucun compte ne peut être confirmé |

Hébergeurs qui conviennent : Fly.io, Railway, Render, Scaleway, OVH, ou
n'importe quel VPS avec Docker. Le `Dockerfile` est à la racine et n'installe
aucune dépendance — l'image se résume au runtime et au code.

### Les variables

Copiez `.env.example`, remplissez-le, et donnez-le à votre hébergeur. Les trois
qui comptent :

```bash
# La clé qui chiffre les contenus en base. La perdre = perdre les données.
npm run cle            # → 64 caractères hexadécimaux
ALLY_SECRET_KEY=…

# Votre compte de plateforme : celui qui voit tous les cabinets.
ALLY_ADMIN_EMAIL=vous@votre-domaine.fr
ALLY_ADMIN_PASSWORD=…  # douze caractères sont un plancher

# Où écrire. Pointez un volume, pas le disque de l'instance.
ALLY_DATA_DIR=/var/lib/ally
```

Plus `NODE_ENV=production` et, derrière un reverse proxy, `ALLY_TRUST_PROXY=1`
— sans quoi la limitation de tentatives compte toutes les connexions comme
venant du proxy, et bloque tout le monde d'un coup.

### Le courrier — c'est le point qui bloque

En production, le code de confirmation ne revient plus dans la réponse HTTP
(un code qui transite par la page est un code public). Il faut donc qu'il
parte vraiment. Deux chemins :

**Soit un fournisseur d'emails.** Brevo (une clé d'API suffit) ou n'importe quel
relais SMTP :

```bash
ALLY_MAIL_FROM=bonjour@votre-domaine.fr
BREVO_API_KEY=…
# ou : SMTP_URL=smtps://user:pass@smtp.exemple.fr:465
```

L'adresse d'expédition doit être vérifiée chez le fournisseur, sinon les envois
sont refusés.

**Soit pas de confirmation du tout**, pour un lancement avec quelques cabinets
pilotes que vous connaissez :

```bash
ALLY_VERIFY_MODE=open
```

Le compte est alors actif dès l'inscription et la session s'ouvre dans la
foulée.

**Le serveur refuse de démarrer** en production si vous demandez une
confirmation par email sans avoir branché d'expéditeur. C'est délibéré : il vaut
mieux un démarrage qui échoue qu'un formulaire qui crée des comptes que
personne ne pourra jamais confirmer.

### Démarrer

```bash
docker build -t ally .
docker run -d --name ally -p 80:8787 \
  --env-file .env \
  -v ally-data:/var/lib/ally \
  ally
```

Sans Docker :

```bash
export $(grep -v '^#' .env | xargs)
node server/index.js
```

Le serveur sert aussi les pages : une seule adresse pour le site, l'espace pro
et l'API. Il annonce au démarrage ce qu'il a compris :

```
[ally] API à l'écoute sur http://localhost:8787
[ally] données : /var/lib/ally/ally.json
[ally] courrier : codes envoyés par brevo depuis bonjour@votre-domaine.fr
[ally] administrateur : vous@votre-domaine.fr (créé)
```

Si une de ces lignes manque ou vous surprend, arrêtez-vous là.

---

## 4. Votre espace de plateforme

Allez sur `/login.html`, connectez-vous avec `ALLY_ADMIN_EMAIL`. Vous arrivez
sur `/admin.html`.

La carte **« La plateforme réelle »** est votre console. Vous y voyez tous les
cabinets réellement inscrits, et sur chacun :

- **ouvrir sa fiche** — ses membres, leur état de confirmation, ses volumes,
  ses sessions ouvertes ;
- **attribuer un numéro** — celui sur lequel Ally décroche pour ce cabinet.
  Tant qu'il n'est pas posé, le professionnel n'a aucun code de renvoi à
  composer : c'est le geste qui met un cabinet en service ;
- **ajuster sa formule** — et donc ses places de collaborateur ;
- **confirmer une adresse à la main** — le cas d'assistance le plus courant,
  celui où l'email n'est jamais arrivé ;
- **suspendre son accès** — impayé, demande du client. Cela coupe tout le
  cabinet et ferme ses sessions ouvertes. Cela se rouvre ;
- **supprimer le cabinet** — comptes, appels, emails, rendez-vous. Sans
  corbeille, parce que c'est ce qu'exige le droit à l'effacement.

Ce que vous **ne** voyez pas, et c'est voulu : aucun résumé d'appel, aucun corps
d'email, aucune configuration de cabinet. L'API d'administration n'en renvoie
pas. Un administrateur capable de lire les dossiers de ses clients avocats
serait un risque, pas une fonction — et c'est un argument de vente, pas une
limitation.

Le reste de `/admin.html` (les seize cabinets, les revenus) est l'annuaire de
démonstration du navigateur : il sert à concevoir l'écran, il est faux, et
l'écran le dit.

---

## 5. Ce qui reste à brancher

Ces points demandent des comptes chez des tiers. Les points d'entrée sont
écrits et testés ; les intégrations non.

| Service | Ce qu'il apporte | Variable | Sans lui |
| --- | --- | --- | --- |
| **Retell** + un numéro français | Ally décroche vraiment | `RETELL_WEBHOOK_SECRET` | aucun appel n'arrive |
| **Brevo / SMTP** | Codes et emails sortants | `BREVO_API_KEY` ou `SMTP_URL` | aucune confirmation, aucun email client |
| **Stripe** | Encaisser les abonnements | — | les formules s'affichent, rien n'est facturé |
| **Google / Microsoft** | Agenda synchronisé | — | l'agenda reste interne |

Et les obligations légales, qui ne s'écrivent pas depuis un éditeur de code :

- **Mentions légales** (LCEN art. 6-III) : raison sociale, SIREN, adresse,
  directeur de publication, hébergeur. Le pied de page n'a volontairement
  aucune colonne « légal » tant que ces pages n'existent pas.
- **CGV** et **politique de confidentialité** — avec le détail du traitement
  des données, qui est déjà conforme dans le code (chiffrement, cloisonnement,
  purge automatique) mais doit être écrit.
- **Registre des traitements** et, pour les cabinets d'avocats, l'articulation
  avec le secret professionnel. Le mode « brouillon à valider » par défaut y
  répond techniquement ; il faut le documenter.

---

## 6. Avant d'ouvrir à des clients

Une liste courte, à cocher :

- [ ] `npm test` et `node tests/navigateur/run.js` au vert sur la machine de déploiement
- [ ] `ALLY_SECRET_KEY` générée, sauvegardée ailleurs que sur le serveur
- [ ] `ALLY_DATA_DIR` sur un volume persistant, et **sauvegardé**
- [ ] HTTPS actif, `NODE_ENV=production`, `ALLY_TRUST_PROXY=1` si proxy
- [ ] Connexion testée avec le compte administrateur
- [ ] Une inscription de bout en bout faite depuis une adresse réelle
- [ ] Un numéro attribué à un cabinet de test, et les trois codes de renvoi posés
- [ ] Mentions légales, CGV, politique de confidentialité en ligne

Le septième point est celui qu'on oublie : sans numéro attribué, un client
inscrit ne reçoit aucun appel, et rien à l'écran ne lui dit que c'est à vous de
le faire.
