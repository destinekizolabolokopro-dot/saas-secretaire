/* Les quatre suites navigateur, l'une après l'autre.

   Elles ont besoin d'un serveur statique et d'un Chromium ; c'est pourquoi
   elles ne sont pas dans tests/run.js, qui tourne en une seconde sans rien
   installer.

       python3 -m http.server 8123
       node tests/navigateur/run.js
*/
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SUITES = [
  ['ecran.js', 'ce qui s\'affiche'],
  ['clavier.js', 'ce qui se fait sans souris'],
  ['contraste.js', 'ce qui se lit'],
  ['gestes.js', 'ce que les boutons font vraiment'],
  ['stockage.js', 'ce qui arrive quand le navigateur refuse d\'enregistrer'],
  ['ligne.js', 'la ligne téléphonique'],
  ['coupure.js', 'ce qui arrive quand le serveur tombe']
];

let echecs = 0;

SUITES.forEach(function (paire) {
  const fichier = paire[0];
  console.log('\n\n########  ' + fichier + ' — ' + paire[1] + '  ########');
  const r = spawnSync(process.execPath, [path.join(__dirname, fichier)], { stdio: 'inherit' });
  if (r.status !== 0) echecs++;
});

console.log('\n\n========================================');
console.log(echecs ? echecs + ' suite(s) en échec.' : 'Tout est vert.');
process.exit(echecs ? 1 : 0);
