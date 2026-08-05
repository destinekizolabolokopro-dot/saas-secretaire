# Ally — architecture technique

État actuel : **front seul**, données en `localStorage`, aucun serveur. Ce
document décrit ce qu'il faut construire derrière pour que la maquette
devienne un produit.

## Briques retenues

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Agent vocal téléphonique | **Retell AI** | Pas de minimum mensuel, API simple, gère STT + LLM + TTS dans une seule boucle temps réel |
| Envoi d'emails | **Brevo** | Société française, hébergement UE, offre gratuite au démarrage |
| Raisonnement | **LLM économique** (Claude Haiku ou équivalent) | Les tâches sont courtes : qualifier une demande, rédiger 5 lignes, extraire une date |
| Agenda | Google Calendar API / Microsoft Graph | Les deux agendas que les cabinets utilisent réellement |

Vérifier les tarifs avant de vous engager, ils bougent vite. À ce jour, un
agent vocal se facture à la minute — comptez de l'ordre de 0,10 à 0,30 $ selon
la configuration. **C'est la seule ligne de coût qui monte avec l'usage**, donc
la seule à surveiller.

## Ce que la formule Permanence change

Permanence n'utilise **aucun agent IA** : c'est un serveur vocal interactif à
touches (« tapez 1 pour un rendez-vous »). Techniquement, un simple arbre de
menu sur la brique téléphonie, sans LLM ni transcription.

Conséquence directe : son coût de revient est quasi nul et fixe. C'est ce qui
permet de la vendre 79 € sans marge négative, et de justifier l'écart avec
Cabinet autrement que par un nombre de fonctionnalités.

## Découpage recommandé

```
Téléphonie (Retell)  →  webhook  →  API Ally  →  base de données (UE)
                                        ├→ LLM (qualification, rédaction)
                                        ├→ Google Calendar / Graph
                                        └→ Brevo (envoi)
```

L'API est le seul endroit qui détient les secrets. Le front ne parle qu'à elle.

## Décisions produit arrêtées

**Le professionnel garde son numéro.** Pas de portage, pas de nouveau numéro à
communiquer. Il pose trois renvois conditionnels vers la ligne Ally :

| Cas | Code | Effet |
| --- | --- | --- |
| Sans réponse après 20 s | `**61*<ligne>*11*20#` | Il décroche s'il peut, sinon Ally prend |
| Déjà en ligne | `**67*<ligne>#` | Le deuxième appelant ne tombe plus sur la messagerie |
| Injoignable | `**62*<ligne>#` | La ligne répond même hors réseau |

`##002#` annule tout, sans passer par nous. C'est un argument de vente : il
peut arrêter du jour au lendemain, donc il ose essayer.

**Ally ne décroche jamais en premier.** Renvoi conditionnel, jamais
inconditionnel : le professionnel garde le contact direct avec ses clients, et
Ally n'attrape que ce qu'il aurait manqué.

**Ally ne rappelle pas.** Aucun appel sortant. Elle prend le message, le
résume, et le pose dans les actions à traiter avec le numéro. Deux raisons :
l'appel sortant coûte plus cher, et une IA qui appelle sans prévenir passe mal
chez la clientèle d'un avocat. À revoir plus tard si le besoin remonte du
terrain.

## Sécuriser Ally

Le risque n'est pas réparti uniformément. Cinq mesures couvrent l'essentiel,
le reste est de l'hygiène.

### 1. Ne pas stocker ce dont on n'a pas besoin

C'est le levier le plus fort, et le moins cher. **Ce qu'on n'a pas ne peut pas
fuiter.**

- Les enregistrements audio sont supprimés après la durée choisie par le
  professionnel (7 à 365 jours, réglable dans l'espace pro). Par défaut : 30.
- On ne stocke pas le contenu des emails du cabinet. On garde une référence
  vers le message chez le fournisseur, pas une copie.
- Les transcriptions sont réduites à un résumé structuré — motif, décision,
  suite — pas au verbatim intégral.
- Aucun numéro de dossier, aucune pièce jointe.

Pour un avocat, cette liste n'est pas une contrainte technique : c'est
l'argument commercial. Elle doit figurer dans la page Confidentialité.

### 2. Cloisonner les cabinets

La faille classique du SaaS : changer un identifiant dans l'URL et voir les
données du voisin.

- Chaque requête filtre sur `cabinet_id`, **déduit du jeton de session côté
  serveur**, jamais d'un paramètre envoyé par le navigateur.
- Un test automatisé vérifie, pour chaque route, qu'un cabinet A ne peut pas
  lire une ressource de B. Ce test tourne à chaque déploiement.

### 3. Chiffrer, à trois niveaux

| Niveau | Moyen | Protège de |
| --- | --- | --- |
| Transport | HTTPS partout, HSTS | l'écoute réseau |
| Disque | chiffrement de la base, activé chez l'hébergeur | le vol de matériel |
| Champ | transcriptions et messages chiffrés applicativement | **le vol de la base elle-même** |

Le troisième est celui qu'on oublie, et le seul qui protège si quelqu'un
récupère un export de la base. La clé vit dans le gestionnaire de secrets, pas
dans la base.

### 4. Protéger les secrets et les accès

Les clés d'API fuitées dans un dépôt public sont la première cause de
compromission de petits SaaS.

- Aucune clé dans le code ni dans Git. Variables d'environnement, et un scan
  automatique du dépôt à chaque commit.
- **Double authentification obligatoire** sur les comptes hébergeur, Google,
  Stripe et GitHub. C'est par là qu'on entre, pas par le code.
- Jetons Google au périmètre minimal : `calendar.events`, pas l'accès complet
  au Drive. Si le jeton fuite, le dégât est borné.
- Signature vérifiée sur les webhooks Retell et Stripe — sinon n'importe qui
  peut injecter de faux appels et de faux paiements.

### 5. Sauvegarder, et vérifier les sauvegardes

Une sauvegarde jamais restaurée n'existe pas.

- Sauvegardes chiffrées, quotidiennes, dont une copie hors du compte
  hébergeur — sinon un rançongiciel qui prend le compte prend aussi les
  sauvegardes.
- Un test de restauration réel, tous les trimestres, noté quelque part.

### Ce que la maquette applique déjà

Quatre des mesures ci-dessus existent dans le front, pour que le serveur les
reprenne au lieu de les inventer :

- **Cloisonnement.** La configuration de chaque professionnel est stockée sous
  une clé dérivée de son identifiant de session, jamais d'un paramètre lisible
  dans l'URL. Côté serveur, ce sera le même principe : `cabinet_id` déduit du
  jeton.
- **Séparation des rôles.** L'administrateur voit des volumes et des statuts.
  Il ne voit aucune transcription, aucun email, aucun nom de client final. Un
  compte professionnel qui ouvre la console d'administration reçoit un refus —
  le contrôle porte sur le rôle, pas sur l'adresse de la page.
- **Vérification d'adresse et récupération de mot de passe** par code à usage
  unique : 6 chiffres, 10 minutes, 5 tentatives. La page de récupération répond
  la même chose que l'adresse existe ou non.
- **Journal d'activité.** Connexions, échecs, changements de formule,
  suspensions et suppressions sont horodatés. En production ce journal vit côté
  serveur, en écriture seule, et l'administrateur ne peut pas l'effacer.

Ce qui reste impossible sans serveur : le hachage argon2id, le chiffrement
applicatif des transcriptions, la signature des webhooks. L'onglet **Système**
de la console les affiche comme « à faire », plutôt que de laisser croire que le
sujet est traité.

### Le reste, à tenir

Requêtes paramétrées, validation des entrées, dépendances à jour
(Dependabot), limitation du nombre de tentatives sur la connexion, journal
d'accès conservé, mots de passe hachés avec argon2 ou bcrypt.

### Avant le premier client payant

- **Contrat de sous-traitance** (article 28 RGPD) signé avec l'hébergeur,
  Retell et Brevo. Un cabinet sérieux le réclamera avant de signer.
- **RC Pro avec volet cyber.** Quelques centaines d'euros par an, et ça évite
  qu'un incident coule l'entreprise.
- **Procédure de notification** écrite à l'avance : 72 heures pour prévenir la
  CNIL. On ne l'improvise pas le jour J.

### Avant les gros cabinets

Un test d'intrusion par un prestataire externe. C'est ce qu'un cabinet de
taille demandera, et le rapport devient un argument de vente.

## Points bloquants à traiter tôt

**OAuth Google.** Lire une boîte Gmail et écrire dans un agenda demande une
autorisation validée par Google : domaine vérifié, écran de consentement,
revue de sécurité si le périmètre est large. Comptez plusieurs semaines. À
lancer dès le début, pas à la fin.

**Hébergement.** Pour des avocats et des médecins, l'hébergement doit être
européen. Pour les données de santé, la certification **HDS** est obligatoire
en France — c'est un argument commercial autant qu'une contrainte, et une
raison de plus de commencer par les avocats.

**Enregistrement des appels.** Il exige le consentement de l'appelant, annoncé
au décroché. La phrase doit être dans le script, pas en option.

## Le risque assumé : envoi sans relecture

Le produit envoie les emails dictés à la voix **sans confirmation orale**.
C'est un choix explicite du porteur de projet, retenu ici : `confirmLevel`
vaut `none` par défaut.

Ce qu'il faut savoir : un email part alors sur la seule base de ce que la
reconnaissance vocale a compris. Une erreur de transcription ou un mauvais
destinataire s'envoie sans filet, chez des professionnels dont un écrit
engage la responsabilité.

Deux garde-fous peu coûteux, à considérer sans revenir sur la décision :

1. **Annulation de 10 secondes** après l'envoi — l'email part, mais reste
   rattrapable. C'est le compromis retenu par la plupart des messageries.
2. **Le réglage reste disponible** dans l'onglet Ally, sur trois niveaux. Un
   professionnel prudent peut le remonter lui-même.

Le premier n'est pas encore implémenté. C'est ma recommandation principale
avant une mise en production réelle.

## Concurrence

Le médical est déjà occupé (Alto, CareCall et d'autres). Le juridique est
quasi vide — c'est le point d'entrée retenu, et il justifie que tout le
vocabulaire par défaut de la maquette soit celui d'un cabinet d'avocats.
