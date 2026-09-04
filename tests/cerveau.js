/* Ce qu'Ally comprend, et ce qu'elle refuse d'inventer.

   Le moteur d'intentions est déterministe : chaque réponse s'explique par une
   règle. C'est ce qui permet de le tester ligne à ligne — et c'est le bon
   choix pour un métier où un écrit engage la responsabilité de quelqu'un. */
'use strict';

const assert = require('node:assert');
const { charger, suite } = require('./harness');

const w = charger([
  'js/profiles.js', 'js/plans.js', 'js/accounts.js', 'js/store.js',
  'js/speech.js', 'js/agenda.js', 'js/brain.js', 'js/converse.js'
]);

const B = w.ALLY_BRAIN;
const A = w.ALLY_AGENDA;
const store = w.ALLY_STORE;
const { test, fin } = suite('Le cerveau : comprendre sans deviner');

const dit = (question) => {
  const r = B.ask(question);
  return { kind: r.kind, texte: (r.reply || r.confirm || ''), r };
};

/* Le premier jour ouvert *après* aujourd'hui, selon les horaires du cabinet.

   Deux pièges, tous deux rencontrés :

   Le samedi est fermé — un test qui demande « demain » un vendredi n'a rien à
   se mettre sous la dent, et ce n'est pas un défaut du produit.

   Et « aujourd'hui » ne convient pas non plus : lancé à 22 h, il ne reste pas
   un créneau d'une journée qui ferme à 18 h 30. On part donc de demain, et le
   test cesse de dépendre de l'heure à laquelle il tourne.

   (La première version de cette aide appelait resolveDate('dans N jours') —
   qui ne comprend que les nombres écrits en lettres et renvoyait donc
   toujours aujourd'hui. Le calcul se fait ici en clair.) */
const prochainJourOuvert = () => {
  const ids = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const base = Date.parse(A.TODAY + 'T00:00:00');
  for (let i = 1; i <= 8; i++) {
    const jour = new Date(base + i * 864e5).toISOString().slice(0, 10);
    const h = store.state.hours.filter((x) => x.id === ids[new Date(jour + 'T00:00:00').getDay()])[0];
    if (h && h.on) return jour;
  }
  throw new Error('aucun jour ouvert dans les horaires du cabinet');
};

/* Le premier jour fermé à partir de demain — pour vérifier ce qu'Ally répond
   quand il n'y a rien à proposer. */
const prochainJourFerme = () => {
  const ids = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const base = Date.parse(A.TODAY + 'T00:00:00');
  for (let i = 1; i <= 8; i++) {
    const jour = new Date(base + i * 864e5).toISOString().slice(0, 10);
    const h = store.state.hours.filter((x) => x.id === ids[new Date(jour + 'T00:00:00').getDay()])[0];
    if (!h || !h.on) return jour;
  }
  return null;
};

const comprend = (question, attendu) => {
  const r = dit(question);
  assert.notStrictEqual(r.kind, 'unknown', '« ' + question +' » n\'est pas comprise');
  if (attendu) {
    assert.ok(r.texte.includes(attendu),
      '« ' + question + ' »\n      attendu : …' + attendu + '…\n      obtenu  : ' + r.texte);
  }
  return r;
};

/* ------------------------------------------------------- Fautes de frappe */

test('une faute de frappe ne fait pas échouer la demande', () => {
  comprend('rendez vou demain');
  comprend('mon planing de la journee');
  comprend('combien de brouillon a valider');
});

test('deux mots réellement différents ne sont pas confondus', () => {
  /* La tolérance s'arrête à une lettre : au-delà, mieux vaut le dire. */
  const r = dit('fais moi un café');
  assert.strictEqual(r.kind, 'unknown', 'réponse inventée : ' + r.texte);
});

/* --------------------------------------------------------------- Dates */

test('les dates se disent de dix façons', () => {
  comprend('crée un rendez-vous demain à 10h', 'demain');
  comprend('crée un rendez-vous le 14 septembre à 10h', '14');
  comprend('crée un rendez-vous dans trois jours à 15h');
  comprend('crée un rendez-vous dans 3 jours à 15h');
});

test('« demain » veut dire demain, même pour consulter', () => {
  const r = comprend('mes rendez-vous demain');
  assert.ok(!/aujourd/.test(r.texte), 'Ally répond pour aujourd\'hui : ' + r.texte);
});

test('une heure dictée en toutes lettres est comprise', () => {
  comprend('crée un rendez-vous demain à quatorze heures trente', '14h30');
});

/* ------------------------------------------------------- Créneaux libres */

test('Ally trouve un trou dans la journée', () => {
  const r = comprend('quels sont mes créneaux libres cette semaine ?', 'Créneaux libres');
  assert.ok(/\d{2}:\d{2}/.test(r.texte), 'aucune heure proposée : ' + r.texte);
});

test('un créneau proposé est réellement libre', () => {
  /* On pose un rendez-vous à une heure connue, puis on demande les créneaux
     de ce jour-là : celui-ci ne doit plus être proposé.

     Le jour n'est pas « demain » : le test tournait un jeudi, il a fini par
     tourner un vendredi, et « demain » est devenu un samedi fermé — plus un
     seul créneau à proposer, et un échec qui ne disait rien du produit. On
     demande donc explicitement le prochain jour ouvert. */
  const D = store.data();
  const jour = prochainJourOuvert();
  D.rdv.push({ id: 'test-libre', date: jour, time: '10:00',
    client: 'M. Occupé', type: 'Consultation' });

  const r = B.ask('suis-je libre le ' + A.longLabel(jour) + ' ?');
  const heures = r.reply.match(/\d{2}:\d{2}/g) || [];
  assert.ok(heures.length, 'aucun créneau proposé : ' + r.reply);
  assert.ok(heures.indexOf('10:00') === -1, '10:00 est pris et pourtant proposé');
  assert.ok(heures.indexOf('09:30') === -1,
    '09:30 chevauche un rendez-vous de 45 minutes à 10:00');

  D.rdv = D.rdv.filter((x) => x.id !== 'test-libre');
});

test('un jour fermé le dit, et propose le suivant', () => {
  /* « Rien de libre dans vos horaires sur la période demandée » était exact et
     inutilisable : il laissait croire à un agenda plein là où le cabinet était
     simplement fermé. La réponse doit nommer la raison, et surtout ne pas
     laisser l'appelant sans date. */
  const ferme = prochainJourFerme();
  if (!ferme) return; /* cabinet ouvert sept jours sur sept : rien à vérifier */

  const r = comprend('suis-je libre le ' + A.longLabel(ferme) + ' ?');
  assert.ok(/ferm/i.test(r.texte), 'la raison n\'est pas dite : ' + r.texte);
  assert.ok(/\d{2}:\d{2}/.test(r.texte),
    'aucun créneau de repli proposé : ' + r.texte);
});

test('une journée déjà finie ne se confond pas avec un agenda plein', () => {
  /* Interrogée après l'heure de fermeture, Ally répondait « rien de libre »
     comme si la semaine entière était prise. */
  const S = store.state;
  const cles = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const aujourdhui = S.hours.filter((h) => h.id === cles[new Date(A.TODAY + 'T00:00:00').getDay()])[0];
  if (!aujourdhui || !aujourdhui.on) return; /* fermé aujourd'hui : autre cas */

  const avant = aujourdhui.to;
  aujourdhui.to = '00:30'; /* la journée est forcément derrière nous */
  try {
    const r = B.ask('suis-je libre aujourd\'hui ?');
    assert.ok(/termin/i.test(r.reply), 'la fin de journée n\'est pas dite : ' + r.reply);
    assert.ok(/\d{2}:\d{2}/.test(r.reply), 'aucun créneau de repli : ' + r.reply);
  } finally {
    aujourdhui.to = avant;
  }
});

test('un cabinet fermé toute la semaine n\'invente pas de créneau', () => {
  /* Le garde-fou : quelle que soit la qualité de la réponse de repli, Ally ne
     doit jamais proposer une heure quand il n'y en a aucune. */
  const S = store.state;
  const avant = S.hours.map((h) => h.on);
  S.hours.forEach((h) => { h.on = false; });
  try {
    const r = B.ask('suis-je libre demain ?');
    assert.ok(/ferm/i.test(r.reply), 'la fermeture n\'est pas dite : ' + r.reply);
    assert.ok(!/\d{2}:\d{2}/.test(r.reply),
      'une heure est proposée alors que tout est fermé : ' + r.reply);
  } finally {
    S.hours.forEach((h, i) => { h.on = avant[i]; });
  }
});

/* ------------------------------------------- Ne pas se tromper de personne */

test('un nom qu\'on ne trouve pas arrête la demande', () => {
  /* Le plus dangereux de tous les défauts trouvés : « écris un mail à
     monsieur Petit pour reporter » déclenchait le déplacement d'un rendez-vous
     — le mot « reporte » suffisait — et, faute d'en trouver un au nom de
     Petit, Ally prenait le premier à venir. Elle proposait donc, avec
     assurance, de déplacer celui de quelqu'un d'autre. */
  const r = B.ask('deplace le rendez-vous de Kowalski a 16h');
  assert.ok(/aucun rendez-vous à ce nom/i.test(r.reply), r.reply);
  assert.ok(!/aubert|chevalier|meridian|petit|roussel/i.test(r.reply),
    'un autre client est cité : ' + r.reply);
});

test('« écris un mail pour reporter » n\'est pas un déplacement', () => {
  const r = B.ask('ecris un mail a monsieur Petit pour reporter');
  assert.notStrictEqual(r.kind, 'unknown');
  assert.ok(!/déplace/i.test(r.confirm || r.reply || ''),
    'la demande a été prise pour un déplacement : ' + (r.confirm || r.reply));
});

test('le rendez-vous visé est celui qu\'on nomme', () => {
  const D = store.data();
  const cible = D.rdv.filter((r) => r.date >= A.TODAY)[1] || D.rdv[0];
  const nom = cible.client.replace(/^(M\.|Mme|Dr)\s*/, '').split(' ')[0];
  const r = B.ask('deplace le rendez-vous de ' + nom + ' a 16h');
  assert.ok((r.confirm || '').includes(cible.client),
    'attendu ' + cible.client + ', obtenu : ' + r.confirm);
});

test('« à 16h » dit où le rendez-vous va, pas lequel c\'est', () => {
  /* L'heure d'arrivée était prise pour l'heure du rendez-vous : on cherchait
     donc un rendez-vous à 16h, qui n'existait pas, et Ally répondait qu'elle
     ne le trouvait pas — alors qu'il était à 14h. */
  const r = B.ask('deplace le rendez-vous de 14h a 16h');
  assert.strictEqual(r.kind, 'action', r.reply);
  assert.ok(/16h/.test(r.confirm), 'l\'heure d\'arrivée n\'est pas reprise : ' + r.confirm);
});

test('un ordre de modification n\'est pas servi par une lecture', () => {
  /* « Reporte mon prochain rendez-vous » était capté par l'intention qui
     *annonce* le prochain rendez-vous : Ally répondait poliment, et ne
     déplaçait rien. Cinq listes de verbes écrites à la main avaient divergé. */
  const r = B.ask('reporte mon prochain rendez-vous a lundi 11h');
  assert.strictEqual(r.kind, 'action', 'répondu au lieu d\'agir : ' + r.reply);
});

test('poser un rendez-vous un jour fermé le signale', () => {
  const S = store.state;
  const cles = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const ferme = prochainJourFerme();
  if (!ferme) return;
  const jour = S.hours.filter((h) => h.id === cles[new Date(ferme + 'T00:00:00').getDay()])[0];
  const r = B.ask('cree un rendez-vous ' + jour.label.toLowerCase() + ' a 10h avec M. Durand');
  assert.ok(/ferm/i.test(r.reply), 'aucun avertissement : ' + r.reply);
});

test('poser un rendez-vous hors horaires le signale', () => {
  const r = B.ask('cree un rendez-vous lundi a 23h avec M. Durand');
  assert.ok(/en dehors de vos horaires/i.test(r.reply), 'aucun avertissement : ' + r.reply);
});

/* ------------------------------------------- Base de connaissances honnête */

test('un seul mot en commun ne fait pas une réponse', () => {
  /* « Quel est mon chiffre d'affaires ce mois-ci ? » tombait sur la fiche
     « Domaines d'intervention » — qui contient le mot « affaires » — et Ally
     la récitait comme si c'était la réponse. Une réponse confiante et fausse
     est pire qu'un aveu d'incompréhension : la première s'utilise. */
  const r = B.ask('quel est mon chiffre d\'affaires ce mois-ci');
  assert.ok(!/droit du travail|domaines/i.test(r.reply || ''),
    'une fiche sans rapport a été servie : ' + r.reply);
});

test('une vraie question trouve toujours sa fiche', () => {
  /* Le garde-fou ne doit pas rendre Ally muette : les questions que la base
     couvre vraiment doivent continuer de recevoir leur réponse. */
  ['quels sont vos horaires', 'quels sont vos tarifs', 'tarifs'].forEach((q) => {
    const r = B.ask(q);
    assert.notStrictEqual(r.kind, 'unknown', '« ' + q + ' » n\'est plus comprise');
  });
});

/* ------------------------------------------------------ Recherche par nom */

test('on retrouve un rendez-vous par le nom du client', () => {
  const premier = store.data().rdv[0];
  const nom = premier.client.replace(/^(M\.|Mme|Dr)\s*/, '').split(' ')[0];
  comprend('quand est mon rendez-vous avec ' + nom + ' ?', premier.time);
});

test('un nom inconnu reçoit une réponse honnête', () => {
  const r = comprend('quand est mon rendez-vous avec Kowalski ?');
  assert.ok(/Aucun rendez-vous à ce nom/.test(r.texte), r.texte);
});

/* --------------------------------------------------------------- Bilans */

test('le résumé compte ce qui s\'est passé', () => {
  const r = comprend('résume-moi la semaine', 'appel');
  assert.ok(/rendez-vous à venir/.test(r.texte), r.texte);
});

/* --------------------------------------------------------------- Rappels */

test('« rappelle Mme X » retrouve son appel', () => {
  const appel = store.data().calls[0];
  const nom = appel.caller.replace(/^(M\.|Mme|Dr)\s*/, '').split(' ')[0];
  comprend('rappelle ' + nom, 'attend un rappel');
});

/* ---------------------------------------------------------------- Retard */

test('« je suis en retard » prévient le bon client', () => {
  /* Un seul rendez-vous dans l'agenda, plus tard dans la journée : Ally
     prévient le prochain, et le test veut savoir lequel. Ajouter le nôtre à
     côté des autres ne suffisait pas — un rendez-vous du jeu de démonstration
     tombait avant, et c'est lui qui était prévenu, à juste titre. */
  const D = store.data();
  const garde = D.rdv;
  D.rdv = [{ id: 'test-retard', date: A.TODAY, time: '23:30',
    client: 'Mme Tardif', type: 'Consultation' }];

  const r = comprend('je suis en retard de 15 minutes', 'Mme Tardif');
  assert.ok(/15/.test(r.texte), 'le retard annoncé n\'est pas repris : ' + r.texte);
  /* Le féminin s'accorde : « Mme Aubert est prévenu » se lisait mal, et se
     lisait sur l'écran de la seule personne concernée. */
  assert.ok(/prévenue/.test(r.texte), 'l\'accord n\'est pas fait : ' + r.texte);

  D.rdv = garde;
});

test('un retard sans rendez-vous ne réveille personne', () => {
  const D = store.data();
  const garde = D.rdv;
  D.rdv = [];
  const r = B.ask('je suis en retard');
  assert.ok(/personne ne vous attend/.test(r.reply), r.reply);
  D.rdv = garde;
});

/* ----------------------------------------------------------------- Repli */

test('quand Ally ne comprend pas, elle oriente', () => {
  const agenda = dit('je veux bidouiller mon agenda du 32 du mois');
  assert.ok(/agenda/.test(agenda.texte), agenda.texte);

  const courrier = dit('envoie quelque chose à quelqu\'un');
  assert.ok(/email|courrier/i.test(courrier.texte), courrier.texte);
});

fin();
