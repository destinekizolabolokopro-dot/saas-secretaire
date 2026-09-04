/* Ce qu'Ally prononce, et ce qu'elle comprend quand on lui parle.

   Ces deux traductions sont invisibles à l'écran et décident pourtant de tout :
   une heure lue « quatorze deux points zéro zéro » ruine la meilleure des voix,
   et une heure dictée « quatorze heures trente » que le moteur ne reconnaît pas
   rend la dictée inutilisable. */
'use strict';

const assert = require('node:assert');
const { charger, suite } = require('./harness');

const w = charger(['js/speech.js']);
const S = w.ALLY_SPEECH;
const { test, fin } = suite('La voix : prononcer et comprendre');

/* ------------------------------------------------------------ Prononcer */

const dit = (entree, attendu, quoi) => {
  const obtenu = S.pourLaVoix(entree);
  assert.ok(obtenu.includes(attendu),
    (quoi || entree) + '\n      attendu : …' + attendu + '…\n      obtenu  : ' + obtenu);
};

test('les heures se disent, elles ne s\'épellent pas', () => {
  dit('Rendez-vous à 14:00', 'quatorze heures');
  dit('Rappel à 9h30', 'neuf heures et demie');
  dit('Fermeture à 18h45', 'dix-neuf heures moins le quart');
  dit('Ouvert à 12:00', 'midi');
  dit('Appel à 00:00', 'minuit');
  dit('Départ à 1h00', 'une heure');
});

test('les titres se prononcent en entier', () => {
  dit('M. Lefebvre', 'Monsieur Lefebvre');
  dit('Mme Aubert a rappelé', 'Madame Aubert');
  dit('Dr Fabre vous attend', 'Docteur Fabre');
  dit('RDV confirmé', 'rendez-vous');
});

test('un numéro de téléphone se dit par paires', () => {
  dit('Rappelez le 06 12 34 56 78',
    'zéro six, douze, trente-quatre, cinquante-six, soixante-dix-huit');
  dit('Appel du 0144556677', 'zéro un, quarante-quatre');
});

test('les montants et les dates deviennent du français', () => {
  dit('180 €', 'cent quatre-vingts euros');
  dit('1 250 € encaissés', 'mille deux cent cinquante euros');
  dit('Facture de 1 €', 'un euro');
  dit('Le 14/09', 'quatorze septembre');
  dit('Le 01/10/2026', 'premier octobre deux mille vingt-six');
  dit('20 % de remise', 'vingt pour cent');
});

test('une adresse email se dicte, elle ne se lit pas', () => {
  dit('Écrivez à contact@cabinet.fr', 'contact arobase cabinet point fr');
});

test('le balisage ne se prononce jamais', () => {
  const obtenu = S.pourLaVoix('<strong>Urgent</strong> : rappeler *vite*');
  assert.ok(!/[<>*]/.test(obtenu), 'des balises subsistent : ' + obtenu);
});

test('les phrases se séparent pour laisser respirer', () => {
  const morceaux = S.phrases('C\'est noté. Je préviens Mme Aubert. Autre chose ?');
  assert.strictEqual(morceaux.length, 3, 'découpage : ' + JSON.stringify(morceaux));
  assert.ok(morceaux[2].endsWith('?'), 'la ponctuation finale est perdue');
});

/* ------------------------------------------------------------ Comprendre */

const entend = (parle, attendu) => {
  const obtenu = S.depuisLaVoix(parle);
  assert.ok(obtenu.includes(attendu),
    '« ' + parle + ' »\n      attendu : …' + attendu + '…\n      obtenu  : ' + obtenu);
};

test('une heure dictée devient une heure lisible par le moteur', () => {
  entend('rendez-vous demain à quatorze heures trente', '14h30');
  entend('rappelle à neuf heures et quart', '09h15');
  entend('bloque à dix heures moins le quart', '09h45');
  entend('déjeuner à midi', '12h');
  entend('appelle à une heure', '01h00');
  entend('réunion à dix-sept heures', '17h00');
});

test('les nombres dictés deviennent des chiffres', () => {
  entend('j\'ai vingt-trois appels', '23');
  entend('deux cent cinquante euros', '250');
  entend('vingt et un rendez-vous', '21');
});

test('« un » reste un article', () => {
  const obtenu = S.depuisLaVoix('crée un rendez-vous pour madame Aubert');
  assert.ok(/crée un rendez-vous/.test(obtenu), 'article transformé : ' + obtenu);
});

test('« et » ne disparaît pas en route', () => {
  const obtenu = S.depuisLaVoix('vingt-trois appels et deux emails');
  assert.ok(/23 appels et 2 emails/.test(obtenu), 'obtenu : ' + obtenu);
});

test('le reste de la phrase est rendu tel quel', () => {
  const obtenu = S.depuisLaVoix('envoie un mail à monsieur Petit pour confirmer');
  assert.ok(/envoie un mail à monsieur petit pour confirmer/.test(obtenu), 'obtenu : ' + obtenu);
});

/* --------------------------------------------------------- Aller-retour */

test('ce qu\'Ally dit, Ally peut le relire', () => {
  /* Une heure prononcée puis réentendue doit revenir à la même heure : c'est
     le tour complet d'une conversation vocale. */
  const prononce = S.pourLaVoix('Rendez-vous à 14:30');
  const relu = S.depuisLaVoix(prononce);
  assert.ok(relu.includes('14h30'), 'aller-retour cassé : ' + prononce + ' → ' + relu);
});

/* ------------------------------------------------- Abréviations et ordinaux */

test('« Sté » devient Société, « Stéphane » reste Stéphane', () => {
  /* Le motif s'arrêtait sur une frontière de mot que JavaScript place entre
     « t » et « é » — le é n'étant pas un caractère de mot à ses yeux. Il
     attrapait donc « St » seul et laissait le « é » : « Sté Meridian » se
     disait « Sociétéé Meridian », et un client prénommé Stéphane était
     annoncé « Sociétééphane » à chaque appel. */
  assert.strictEqual(S.pourLaVoix('Sté Meridian'), 'Société Meridian');
  assert.strictEqual(S.pourLaVoix('Stéphane Dubois'), 'Stéphane Dubois');
  /* « Ste » sans accent est « Sainte », pas « Société ». */
  assert.ok(!/Société/.test(S.pourLaVoix('Ste Anne')));
});

test('les ordinaux gardent leur genre et leur nombre', () => {
  /* « 1ère consultation » se disait « premier consultation » : les deux
     formes retombaient sur le masculin singulier, alors que la forme écrite
     porte l'accord. */
  assert.ok(/première consultation/.test(S.pourLaVoix('1ère consultation')),
    S.pourLaVoix('1ère consultation'));
  assert.ok(/premier septembre/.test(S.pourLaVoix('le 1er septembre')));
  assert.ok(/premiers dossiers/.test(S.pourLaVoix('les 1ers dossiers')));
  assert.ok(/seconde chambre/.test(S.pourLaVoix('la 2nde chambre')));
  assert.ok(/deuxième fois/.test(S.pourLaVoix('la 2ème fois')));
});

test('une durée ne se dit pas comme une heure', () => {
  /* « Environ 12 h 58 ce mois-ci » — le temps gagné — se prononçait « midi
     cinquante-huit ». Le texte lui-même a été changé : une durée s'écrit en
     toutes lettres, ce qui est aussi plus clair à lire. */
  const B = charger(['js/profiles.js', 'js/plans.js', 'js/accounts.js', 'js/store.js',
    'js/speech.js', 'js/agenda.js', 'js/brain.js', 'js/converse.js']).ALLY_BRAIN;
  const dit = S.pourLaVoix(B.ask('combien de temps ai-je gagné').reply);
  assert.ok(!/midi|minuit/.test(dit), 'la durée est prise pour une heure : ' + dit);
});

fin();
