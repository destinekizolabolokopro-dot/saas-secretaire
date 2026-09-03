/* Ally — tout vérifier d'une commande.

       node tests/run.js

   Ces tests-ci ne demandent ni navigateur ni réseau : ils chargent le front
   dans Node et interrogent directement le moteur. Ils tournent en une seconde,
   sur n'importe quelle machine, et couvrent ce qui casse le plus souvent — la
   compréhension et la prononciation. Les tests d'interface, eux, exigent un
   navigateur ; ils sont décrits dans README.md. */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = [
  ['voix', 'tests/voix.js'],
  ['cerveau', 'tests/cerveau.js'],
  ['serveur', 'server/test.js']
];

const racine = path.resolve(__dirname, '..');
let echecs = 0;

for (const [nom, fichier] of suites) {
  const run = spawnSync(process.execPath, [fichier], { cwd: racine, encoding: 'utf8' });
  const sortie = (run.stdout || '') + (run.stderr || '');
  /* On cherche la conclusion, pas la dernière ligne : le serveur écrit un
     avertissement de démarrage après son résultat. */
  const lignes = sortie.trim().split('\n');
  const resultat = lignes.filter((l) => /Aucun problème|problème\(s\)|Tout est passé/.test(l)).pop()
    || lignes[lignes.length - 1] || '(aucune sortie)';

  if (run.status !== 0) {
    echecs += 1;
    console.log('ÉCHEC  ' + nom);
    console.log(sortie.split('\n').filter((l) => /ÉCHEC|problème/.test(l)).join('\n'));
  } else {
    const compte = (sortie.match(/(\d+) contrôles/) || [])[1];
    console.log('ok     ' + nom + (compte ? ' — ' + compte + ' contrôles' : '') + ' : ' + resultat);
  }
}

console.log('');
if (echecs) {
  console.log(echecs + ' suite(s) en échec.');
  process.exit(1);
}
console.log('Tout est vert.');
