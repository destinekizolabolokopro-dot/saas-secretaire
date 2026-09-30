/* Ce qui change quand le temps passe.

   Un tableau de bord de professionnel seul n'est pas une page qu'on ouvre et
   qu'on ferme : c'est un onglet qui reste là, du matin au soir, et parfois
   d'un jour sur l'autre. Plusieurs défauts de ce produit ne se voyaient donc
   jamais en le regardant — il fallait attendre minuit, ou dix-huit heures.

   Cette suite avance l'horloge à la place du temps.

       node tests/horloge.js
*/
'use strict';

const assert = require('node:assert');
const { charger, suite } = require('./harness');

const { test, fin } = suite('L\'horloge : ce qui bouge quand le jour tourne');

/* Une horloge que l'on déplace. Tout le reste de Date est conservé : les
   modules s'en servent pour formater, pas seulement pour lire l'heure. */
function horlogeA(instant) {
  let courant = new Date(instant).getTime();
  class FausseDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(courant);
      else super(...args);
    }
    static now() { return courant; }
  }
  return {
    Date: FausseDate,
    avanceA(nouvelInstant) { courant = new Date(nouvelInstant).getTime(); }
  };
}

const MODULES = ['js/profiles.js', 'js/plans.js', 'js/accounts.js', 'js/store.js',
  'js/speech.js', 'js/agenda.js', 'js/brain.js', 'js/converse.js'];

/* Un jeudi soir, à une minute de minuit. */
const horloge = horlogeA('2026-09-10T23:59:00');
const w = charger(MODULES, { Date: horloge.Date });
const A = w.ALLY_AGENDA;

test('avant minuit, le jour est le bon', () => {
  assert.strictEqual(A.TODAY, '2026-09-10');
});

/* Le défaut : TODAY était une constante calculée au chargement de la page.
   Passé minuit, « Auj. » désignait encore la veille, la case du jour restait
   allumée sur hier, et surtout « pose-moi un rendez-vous demain » visait le
   mauvais jour — un rendez-vous posé la nuit atterrissait vingt-quatre heures
   trop tôt, sans que rien ne le signale. */
test('deux minutes plus tard, on est le lendemain', () => {
  horloge.avanceA('2026-09-11T00:01:00');
  assert.strictEqual(A.TODAY, '2026-09-11',
    'la page croit encore être la veille');
});

test('« demain » suit le passage de minuit', () => {
  assert.strictEqual(A.resolveDate('demain'), '2026-09-12',
    'un rendez-vous pris la nuit se poserait un jour trop tôt');
});

test('« aujourd\'hui » aussi', () => {
  assert.strictEqual(A.resolveDate("aujourd'hui"), '2026-09-11');
});

test('l\'étiquette courte ne montre plus la veille comme aujourd\'hui', () => {
  assert.strictEqual(A.shortLabel('2026-09-10'), 'Jeu 10');
  assert.strictEqual(A.shortLabel('2026-09-11'), 'Auj.');
  assert.strictEqual(A.shortLabel('2026-09-12'), 'Dem.');
});

/* Et le lendemain d'un mois : le piège classique du décalage à la main. */
test('un changement de mois se passe aussi bien', () => {
  horloge.avanceA('2026-09-30T23:59:30');
  assert.strictEqual(A.TODAY, '2026-09-30');
  horloge.avanceA('2026-10-01T00:00:30');
  assert.strictEqual(A.TODAY, '2026-10-01');
  assert.strictEqual(A.resolveDate('demain'), '2026-10-02');
});

test('et un changement d\'année', () => {
  horloge.avanceA('2026-12-31T23:59:00');
  assert.strictEqual(A.TODAY, '2026-12-31');
  horloge.avanceA('2027-01-01T00:02:00');
  assert.strictEqual(A.TODAY, '2027-01-01');
});

/* Le cerveau lit la même date : c'est lui qui pose les rendez-vous dictés. */
test('le moteur d\'intentions suit la même horloge', () => {
  horloge.avanceA('2026-09-11T00:05:00');
  const B = w.ALLY_BRAIN;
  const r = B.ask('prends un rendez-vous demain à 10h pour M. Testeur');
  const D = w.ALLY_STORE.data();
  const avant = D.rdv.length;
  if (r.apply) r.apply();
  assert.strictEqual(D.rdv.length, avant + 1, 'aucun rendez-vous posé');
  const pose = D.rdv[D.rdv.length - 1];
  assert.strictEqual(pose.date, '2026-09-12',
    'posé le ' + pose.date + ' au lieu du 2026-09-12');
});

fin();
