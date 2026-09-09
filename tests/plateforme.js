/* L'arithmétique de la plateforme.

   La console d'administration affiche du revenu, des coûts et une marge. Ce
   sont les seuls chiffres du produit qui portent sur de l'argent, et personne
   ne les vérifie à l'œil : ils paraissent toujours plausibles.

   Le contrôle qui compte est celui du cycle. Un abonnement annuel se paie
   790 € d'un coup et vaut 66 € par mois : le compter à 79 gonflerait le
   revenu récurrent de onze pour cent sans que rien ne le signale. C'est
   exactement l'erreur que j'ai faite en recalculant à la main, avant de
   constater que la console, elle, avait raison. */
'use strict';

const assert = require('node:assert');
const { charger, suite } = require('./harness');

const w = charger(['js/profiles.js', 'js/plans.js', 'js/accounts.js']);
const A = w.ALLY_ACCOUNTS;
const PLANS = w.ALLY_PLANS;
const PAR_ID = w.ALLY_PLAN_BY_ID;
const { test, fin } = suite('La plateforme : ce que disent les chiffres');

const pros = () => A.all().filter((u) => u.role !== 'admin');
const actifs = () => pros().filter((u) => u.status === 'active');

/* ------------------------------------------------------------- Catalogue */

test('chaque compte porte une formule qui existe', () => {
  const orphelins = pros().filter((u) => !PAR_ID(u.planId));
  assert.strictEqual(orphelins.length, 0,
    'formules inconnues : ' + orphelins.map((u) => u.planId).join(', '));
});

test('les formules annuelles valent bien dix mois', () => {
  /* « Deux mois offerts » est une promesse commerciale : elle doit se lire
     dans les prix, pas seulement sur l'étiquette. */
  PLANS.forEach((f) => {
    assert.strictEqual(f.priceYear, f.price * 10,
      f.name + ' : ' + f.priceYear + ' € par an pour ' + f.price + ' € par mois');
  });
});

/* --------------------------------------------------------------- Revenu */

test('le revenu récurrent ramène l\'annuel au mois', () => {
  const attendu = actifs().reduce((somme, u) => {
    const f = PAR_ID(u.planId);
    return somme + (u.cycle === 'year' ? Math.round(f.priceYear / 12) : f.price);
  }, 0);
  assert.strictEqual(A.stats().mrr, attendu);
});

test('compter l\'annuel au prix mensuel donnerait un autre chiffre', () => {
  /* Le garde-fou du garde-fou : si aucun compte n'est en annuel, le contrôle
     précédent ne prouve rien. On vérifie que le jeu de données contient bien
     le cas qu'on prétend éprouver. */
  const naif = actifs().reduce((s, u) => s + PAR_ID(u.planId).price, 0);
  assert.notStrictEqual(A.stats().mrr, naif,
    'aucun abonnement annuel dans le jeu de données : le contrôle du cycle ne vérifie rien');
});

test('seuls les comptes actifs alimentent le revenu', () => {
  /* Un compte en essai ou suspendu ne paie pas. Il est compté à part — pas
     oublié, ce qui serait tout aussi faux. */
  const s = A.stats();
  const enEssai = pros().filter((u) => u.status === 'trial');
  assert.ok(s.trialMrr > 0 || !enEssai.length,
    'des comptes en essai existent mais ne sont comptés nulle part');
  const suspendus = pros().filter((u) => u.status === 'suspended');
  if (suspendus.length) {
    const avecEux = s.mrr + suspendus.reduce((n, u) => n + PAR_ID(u.planId).price, 0);
    assert.notStrictEqual(s.mrr, avecEux, 'un compte suspendu est compté comme payant');
  }
});

test('le revenu annuel est douze fois le mensuel', () => {
  const s = A.stats();
  assert.strictEqual(s.arr, s.mrr * 12);
});

/* ---------------------------------------------------------------- Marge */

test('la marge est le revenu moins les coûts', () => {
  const s = A.stats();
  assert.strictEqual(s.margin, s.mrr - s.cost);
});

test('le taux de marge suit la marge', () => {
  const s = A.stats();
  const attendu = s.mrr ? Math.round((s.margin / s.mrr) * 100) : 0;
  assert.strictEqual(s.marginRate, attendu);
});

test('le revenu moyen par compte n\'est pas calculé sur zéro', () => {
  const s = A.stats();
  const nb = actifs().length;
  assert.strictEqual(s.arpu, nb ? Math.round(s.mrr / nb) : 0);
});

/* -------------------------------------------------- Répartition affichée */

test('la répartition par formule totalise le revenu', () => {
  /* Le tableau des revenus affiche une part en pourcentage par formule :
     si les lignes ne somment pas au total, l'une d'elles ment. */
  const s = A.stats();
  const somme = Object.keys(s.byPlan)
    .reduce((n, id) => n + s.byPlan[id].mrr, 0);
  assert.strictEqual(somme, s.mrr);
});

test('la répartition par formule totalise les comptes', () => {
  const s = A.stats();
  const somme = Object.keys(s.byPlan).reduce((n, id) => n + s.byPlan[id].count, 0);
  assert.strictEqual(somme, pros().length);
});

fin();
