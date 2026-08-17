/* Ally — persistance.

   Un fichier JSON, écrit de façon atomique. Ce n'est pas la base de production :
   c'est le plus petit substitut crédible qui permette d'écrire — et de tester —
   le cloisonnement, le chiffrement et les règles métier sans dépendance.

   Le passage à PostgreSQL ne touchera que ce fichier et repo.js : le reste du
   serveur ne connaît que des méthodes de dépôt, jamais de requêtes. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.ALLY_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'ally.json');

const EMPTY = {
  cabinets: [],     // { id, org, trade, plan, createdAt }
  users: [],        // { id, cabinetId, role, email, pass, ... }
  sessions: [],     // { token, userId, cabinetId, createdAt, expiresAt }
  calls: [],        // { id, cabinetId, from, at, summary(chiffré), outcome }
  messages: [],     // { id, cabinetId, to, subject, body(chiffré), state, sendAfter }
  rdv: [],          // { id, cabinetId, date, time, client(chiffré), type, note(chiffré) }
  events: []        // journal d'accès, en ajout seul
};

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const key of Object.keys(EMPTY)) if (!db[key]) db[key] = [];
  } catch (e) {
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  return db;
}

/* Écriture atomique : on écrit à côté puis on renomme. Une coupure au milieu
   d'un write() laisserait sinon un fichier tronqué, donc une base perdue. */
function save() {
  /* Droits restreints dès la création. Le fichier contient des adresses, des
     empreintes de mots de passe et des données de cabinets : sur une machine
     partagée, le mode par défaut (0644) le rend lisible par tout compte du
     système. On le pose à l'écriture, et non après, pour qu'il n'existe pas
     une fraction de seconde en lecture publique. */
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

function reset() {
  db = JSON.parse(JSON.stringify(EMPTY));
  save();
}

/* Journal d'accès. En production il vit ailleurs, en écriture seule, hors de
   portée de l'administrateur : un journal qu'on peut effacer ne prouve rien. */
function record(action, detail) {
  load().events.push({ at: Date.now(), action, ...detail });
  if (db.events.length > 5000) db.events.splice(0, db.events.length - 5000);
}

module.exports = { load, save, reset, record, FILE, DIR };
