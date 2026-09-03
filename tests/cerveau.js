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
     de ce jour-là : celui-ci ne doit plus être proposé. */
  const D = store.data();
  const jour = A.resolveDate('demain', A.TODAY);
  D.rdv.push({ id: 'test-libre', date: jour, time: '10:00',
    client: 'M. Occupé', type: 'Consultation' });

  const r = B.ask('suis-je libre demain ?');
  const heures = r.reply.match(/\d{2}:\d{2}/g) || [];
  assert.ok(heures.length, 'aucun créneau proposé : ' + r.reply);
  assert.ok(heures.indexOf('10:00') === -1, '10:00 est pris et pourtant proposé');
  assert.ok(heures.indexOf('09:30') === -1,
    '09:30 chevauche un rendez-vous de 45 minutes à 10:00');

  D.rdv = D.rdv.filter((x) => x.id !== 'test-libre');
});

test('un jour fermé ne propose aucun créneau', () => {
  const S = store.state;
  const avant = S.hours.map((h) => h.on);
  S.hours.forEach((h) => { h.on = false; });
  const r = B.ask('suis-je libre demain ?');
  assert.ok(/Rien de libre/.test(r.reply), 'réponse : ' + r.reply);
  S.hours.forEach((h, i) => { h.on = avant[i]; });
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
  /* On place un rendez-vous plus tard dans la journée pour que le cas ait un
     sens quelle que soit l'heure à laquelle le test tourne. */
  const D = store.data();
  D.rdv.push({ id: 'test-retard', date: A.TODAY, time: '23:30',
    client: 'M. Tardif', type: 'Consultation' });

  const r = comprend('je suis en retard de 15 minutes', 'M. Tardif');
  assert.ok(/15/.test(r.texte), 'le retard annoncé n\'est pas repris : ' + r.texte);

  D.rdv = D.rdv.filter((x) => x.id !== 'test-retard');
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
