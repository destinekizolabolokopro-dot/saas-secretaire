/* Ally — faire tourner le front dans Node, sans navigateur.

   Les tests d'interface passent par un vrai navigateur, ce qui est lent et
   demande Playwright. Mais le cœur d'Ally — la prononciation, le moteur
   d'intentions, l'agenda — est du JavaScript sans DOM : il suffit de lui
   fournir les quelques objets globaux qu'il attend pour le tester en une
   fraction de seconde, et depuis n'importe quelle machine.

   C'est ce que fait ce fichier : un faux navigateur minimal, honnête sur ce
   qu'il ne fait pas. Il ne remplace pas les tests au navigateur ; il les
   complète là où ils coûtent trop cher pour ce qu'ils prouvent. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.resolve(__dirname, '..');

/* localStorage de poche : une Map, avec la même interface. */
function fauxStockage() {
  const donnees = new Map();
  return {
    getItem: (k) => (donnees.has(k) ? donnees.get(k) : null),
    setItem: (k, v) => donnees.set(k, String(v)),
    removeItem: (k) => donnees.delete(k),
    clear: () => donnees.clear()
  };
}

/* Le strict nécessaire de document : les modules testés ici ne dessinent pas,
   mais certains en effleurent l'existence au chargement. */
function fauxDocument() {
  const vide = {
    innerHTML: '', textContent: '', className: '', hidden: false, style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dataset: {},
    appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  return {
    body: { ...vide, contains() { return true; } },
    documentElement: vide,
    createElement() { return { ...vide }; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createTextNode() { return {}; }
  };
}

/* Charge les modules du front dans un contexte partagé, dans l'ordre donné. */
function charger(fichiers) {
  const fenetre = {
    localStorage: fauxStockage(),
    location: { protocol: 'http:', hostname: 'localhost', search: '', pathname: '/' },
    navigator: { language: 'fr-FR' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    isSecureContext: true,
    fetch: undefined,
    speechSynthesis: undefined
  };
  fenetre.window = fenetre;
  fenetre.document = fauxDocument();
  fenetre.self = fenetre;

  const contexte = vm.createContext(fenetre);

  for (const fichier of fichiers) {
    const code = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
    vm.runInContext(code, contexte, { filename: fichier });
  }
  return fenetre;
}

/* --------------------------------------------------------------- Rapport */

function suite(titre) {
  let passes = 0;
  const echecs = [];

  const test = (label, fn) => {
    try {
      fn();
      passes += 1;
      console.log('  ok  ' + label);
    } catch (error) {
      echecs.push(label + ' : ' + error.message);
      console.log('  ÉCHEC ' + label + ' — ' + error.message);
    }
  };

  const fin = () => {
    console.log('\n' + (passes + echecs.length) + ' contrôles');
    if (echecs.length) {
      console.log(echecs.length + ' problème(s) :');
      echecs.forEach((e) => console.log(' - ' + e));
      process.exitCode = 1;
      return false;
    }
    console.log('Aucun problème.');
    return true;
  };

  console.log('\n== ' + titre + ' ==');
  return { test, fin };
}

module.exports = { charger, suite, RACINE };
