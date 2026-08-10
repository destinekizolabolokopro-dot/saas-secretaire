/* Ally — accès aux données, cloisonné par cabinet.

   Règle unique et non négociable : on n'accède jamais à une collection
   directement. On demande d'abord un dépôt lié à un cabinet, et ce cabinet
   vient du jeton de session — jamais d'un paramètre d'URL ou d'un corps de
   requête. C'est ce qui empêche la faille la plus banale du SaaS : changer un
   identifiant dans l'adresse et lire les données du voisin.

   Le contenu sensible (résumé d'appel, corps d'email) est chiffré à l'écriture
   et déchiffré à la lecture, ici et nulle part ailleurs : aucune route ne peut
   oublier de le faire. */
'use strict';

const store = require('./store');
const { encrypt, decrypt, id } = require('./crypto');

/* Champs chiffrés au niveau applicatif, par collection. */
const SECRET_FIELDS = {
  calls: ['summary', 'transcript'],
  messages: ['body']
};

function seal(collection, row) {
  const fields = SECRET_FIELDS[collection] || [];
  const out = { ...row };
  for (const field of fields) if (field in out) out[field] = encrypt(out[field]);
  return out;
}

function open(collection, row) {
  if (!row) return null;
  const fields = SECRET_FIELDS[collection] || [];
  const out = { ...row };
  for (const field of fields) if (field in out) out[field] = decrypt(out[field]);
  return out;
}

/* Dépôt lié à un cabinet. Toutes les méthodes filtrent, sans exception. */
function forCabinet(cabinetId) {
  if (!cabinetId) throw new Error('repo.forCabinet : cabinetId manquant');
  const db = store.load();

  function collection(name) {
    return {
      list(filter) {
        return db[name]
          .filter((row) => row.cabinetId === cabinetId)
          .filter((row) => !filter || Object.entries(filter)
            .every(([key, value]) => row[key] === value))
          .map((row) => open(name, row));
      },

      /* Un identifiant appartenant à un autre cabinet renvoie null, comme un
         identifiant inexistant : la réponse ne doit pas permettre de deviner
         qu'une ressource existe ailleurs. */
      get(rowId) {
        const row = db[name].find((r) => r.id === rowId && r.cabinetId === cabinetId);
        return open(name, row);
      },

      create(data) {
        const row = seal(name, { id: id(name.slice(0, 3)), cabinetId, createdAt: Date.now(), ...data });
        row.cabinetId = cabinetId;   // jamais surchargeable par l'appelant
        db[name].push(row);
        store.save();
        return open(name, row);
      },

      update(rowId, patch) {
        const row = db[name].find((r) => r.id === rowId && r.cabinetId === cabinetId);
        if (!row) return null;
        const merged = seal(name, { ...open(name, row), ...patch });
        merged.id = row.id;
        merged.cabinetId = cabinetId;
        Object.assign(row, merged);
        store.save();
        return open(name, row);
      },

      remove(rowId) {
        const index = db[name].findIndex((r) => r.id === rowId && r.cabinetId === cabinetId);
        if (index < 0) return false;
        db[name].splice(index, 1);
        store.save();
        return true;
      },

      count(filter) { return this.list(filter).length; }
    };
  }

  return {
    cabinetId,
    calls: collection('calls'),
    messages: collection('messages'),

    cabinet() {
      return db.cabinets.find((c) => c.id === cabinetId) || null;
    },

    members() {
      return db.users
        .filter((u) => u.cabinetId === cabinetId)
        .map(({ pass, code, ...rest }) => rest);   // jamais l'empreinte ni le code
    }
  };
}

/* ------------------------------------------------------------------ Admin */
/* L'administrateur de la plateforme voit des volumes et des statuts. Aucune
   méthode ici ne renvoie de contenu d'appel ni d'email : c'est une décision
   de conception, pas un oubli. Un administrateur capable de lire les
   transcriptions d'un cabinet d'avocats est un risque, pas une fonction. */
const admin = {
  cabinets() {
    const db = store.load();
    return db.cabinets.map((cabinet) => ({
      ...cabinet,
      members: db.users.filter((u) => u.cabinetId === cabinet.id).length,
      calls: db.calls.filter((c) => c.cabinetId === cabinet.id).length,
      messages: db.messages.filter((m) => m.cabinetId === cabinet.id).length
    }));
  },

  stats() {
    const db = store.load();
    return {
      cabinets: db.cabinets.length,
      users: db.users.length,
      calls: db.calls.length,
      messages: db.messages.length,
      sessions: db.sessions.filter((s) => s.expiresAt > Date.now()).length
    };
  },

  events(limit = 100) {
    return store.load().events.slice(-limit).reverse();
  }
};

module.exports = { forCabinet, admin };
