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
