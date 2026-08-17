/* Ally — comptes et sessions.
   Le rôle et le cabinet sont attachés à la session côté serveur. Aucune route
   ne les lit ailleurs : c'est la seule façon d'être sûr qu'on ne peut pas les
   réclamer depuis le navigateur. */
'use strict';

const store = require('./store');
const {
  hashPassword, verifyPassword, token, code6, id
} = require('./crypto');

const SESSION_MS = 12 * 60 * 60 * 1000;   // 12 h
const CODE_MS = 10 * 60 * 1000;           // 10 min
const MAX_CODE_TRIES = 5;

function normalize(email) { return String(email || '').trim().toLowerCase(); }

function findUser(email) {
  return store.load().users.find((u) => u.email === normalize(email)) || null;
}

function findById(userId) {
  return store.load().users.find((u) => u.id === userId) || null;
}

/* --------------------------------------------------------------- Inscription */

function signup({ email, password, org, trade, plan }) {
  const db = store.load();
  const clean = normalize(email);

  if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: 'Adresse email invalide.' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  }
  /* On répond la même chose qu'une adresse soit prise ou non n'aurait ici pas
     de sens : l'inscription doit dire pourquoi elle échoue. C'est la
     récupération de mot de passe qui doit rester muette. */
  if (findUser(clean)) {
    return { ok: false, error: 'Un compte existe déjà avec cette adresse.' };
  }

  const cabinet = {
    id: id('cab'),
    org: String(org || '').trim() || 'Cabinet',
    trade: trade || 'avocat',
    plan: plan || 'cabinet',
    createdAt: Date.now()
  };
  db.cabinets.push(cabinet);

  const user = {
    id: id('usr'),
    cabinetId: cabinet.id,
    role: 'pro',
    /* Celui qui crée le cabinet en est responsable : lui seul invite et
       retire. Sans ce drapeau, un collaborateur invité pourrait retirer celui
       qui l'a invité. */
    owner: true,
    email: clean,
    pass: hashPassword(password),
    verified: false,
    createdAt: Date.now(),
    code: null
  };
  db.users.push(user);

  store.record('signup', { userId: user.id, cabinetId: cabinet.id });
  store.save();
  return { ok: true, user, cabinet };
}

/* Compte administrateur de la plateforme.

   Il ne se crée pas par l'inscription : aucune route ne doit pouvoir accorder
   ce rôle, sinon il suffirait d'un champ oublié dans un formulaire pour devenir
   administrateur. Il vient de l'environnement du serveur, c'est-à-dire de
   quelqu'un qui a déjà accès à la machine.

   Renvoie une explication plutôt qu'une exception : un serveur qui refuse de
   démarrer parce que l'administrateur est mal configuré empêcherait aussi les
   clients de travailler. */
function ensureAdmin() {
  const email = normalize(process.env.ALLY_ADMIN_EMAIL);
  const password = process.env.ALLY_ADMIN_PASSWORD;
  if (!email && !password) return { ok: false, reason: 'absent' };
  if (!email || !password) return { ok: false, reason: 'incomplet' };
  /* Ce compte voit toute la plateforme : douze caractères sont un plancher,
     pas une recommandation. */
  if (password.length < 12) return { ok: false, reason: 'mot de passe trop court' };

  const db = store.load();
  const existing = findUser(email);
  if (existing) {
    /* Le mot de passe n'est pas réécrit : l'administrateur a pu le changer
       depuis, et l'environnement ne doit pas le ramener en arrière. */
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      store.record('admin-promoted', { userId: existing.id });
      store.save();
    }
    return { ok: true, created: false, user: existing };
  }

  const cabinet = {
    id: id('cab'), org: 'Ally', trade: 'avocat', plan: 'expert', createdAt: Date.now()
  };
  db.cabinets.push(cabinet);

  const user = {
    id: id('usr'), cabinetId: cabinet.id, role: 'admin', email,
    pass: hashPassword(password), verified: true, createdAt: Date.now(), code: null
  };
  db.users.push(user);
  store.record('admin-created', { userId: user.id });
  store.save();
  return { ok: true, created: true, user };
}

/* ------------------------------------------------------------ Collaborateurs

   Un cabinet à plusieurs, c'est ce que vend la formule Expert. Le nombre de
   places vient de la formule, et il est compté ici : un contrôle fait dans
   l'interface se contourne avec deux lignes de JavaScript. */

const SEATS = { permanence: 1, cabinet: 1, expert: 5 };

function seatsOf(cabinet) {
  return SEATS[cabinet && cabinet.plan] || 1;
}

/* Le responsable est celui qui a créé le cabinet. Les comptes créés avant que
   ce drapeau n'existe n'en portent pas : le plus ancien fait office. */
function isOwner(user) {
  if (!user) return false;
  if (user.owner) return true;
  const family = store.load().users
    .filter((u) => u.cabinetId === user.cabinetId)
    .sort((a, b) => a.createdAt - b.createdAt);
  return !family.some((u) => u.owner) && family[0] && family[0].id === user.id;
}

function invite(cabinetId, email, byUser) {
  const db = store.load();
  const clean = normalize(email);

  if (!isOwner(byUser)) {
    return { ok: false, error: 'Seul le responsable du cabinet peut inviter.' };
  }
  if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: 'Adresse email invalide.' };
  }
  if (findUser(clean)) {
    return { ok: false, error: 'Cette adresse a déjà un compte Ally.' };
  }

  const cabinet = db.cabinets.find((c) => c.id === cabinetId);
  const family = db.users.filter((u) => u.cabinetId === cabinetId);
  const places = seatsOf(cabinet);
  if (family.length >= places) {
    return {
      ok: false,
      error: places === 1
        ? 'Votre formule ne comprend qu\'un utilisateur. Passez à Expert pour inviter vos collaborateurs.'
        : 'Votre formule comprend ' + places + ' utilisateurs, ils sont tous pris.'
    };
  }

  const user = {
    id: id('usr'),
    cabinetId,
    role: 'pro',
    owner: false,
    email: clean,
    /* Aucun mot de passe tant que l'invitation n'est pas acceptée. Un compte
       sans empreinte ne peut pas se connecter : verifyPassword le refuse. */
    pass: null,
    verified: false,
    invitedBy: byUser.id,
    createdAt: Date.now(),
    code: null
  };
  db.users.push(user);

  const value = code6();
  user.code = { kind: 'invite', value, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, tries: 0 };
  store.record('member-invited', { cabinetId, userId: user.id });
  store.save();

  return { ok: true, user, code: value };
}

/* L'invité choisit son mot de passe en même temps qu'il prouve qu'il a reçu le
   code. C'est la seule route qui crée une session sans mot de passe existant —
   elle exige donc un code valide, et refuse un compte déjà actif. */
function acceptInvite(userId, value, password) {
  const user = store.load().users.find((u) => u.id === userId);
  if (!user || user.verified || !user.code || user.code.kind !== 'invite') {
    return { ok: false, error: 'Cette invitation n\'est plus valable.' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  }

  const result = checkCode(user, 'invite', value);
  if (!result.ok) return result;

  user.pass = hashPassword(password);
  user.verified = true;
  user.code = null;
  store.record('member-joined', { cabinetId: user.cabinetId, userId: user.id });
  store.save();
  return { ok: true, user };
}

function removeMember(cabinetId, targetId, byUser) {
  const db = store.load();
  if (!isOwner(byUser)) {
    return { ok: false, error: 'Seul le responsable du cabinet peut retirer un collaborateur.' };
  }
  if (targetId === byUser.id) {
    return { ok: false, error: 'Vous ne pouvez pas vous retirer vous-même.' };
  }

  const target = db.users.find((u) => u.id === targetId && u.cabinetId === cabinetId);
  /* Même réponse qu'un identifiant inexistant : la route ne doit pas dire à
     quel cabinet appartient un identifiant qu'on lui souffle. */
  if (!target) return { ok: false, error: 'Introuvable.', status: 404 };

  db.users = db.users.filter((u) => u.id !== targetId);
  db.sessions = db.sessions.filter((s) => s.userId !== targetId);
  store.record('member-removed', { cabinetId, userId: targetId });
  store.save();
  return { ok: true };
}

/* ------------------------------------------------------- Codes à usage unique */

function issueCode(userId, kind) {
  const user = store.load().users.find((u) => u.id === userId);
  if (!user) return null;
  const value = code6();
  user.code = { kind, value, expiresAt: Date.now() + CODE_MS, tries: 0 };
  store.record('code-issued', { userId, kind });
  store.save();
  return value;
}

function checkCode(user, kind, value) {
  if (!user || !user.code || user.code.kind !== kind) {
    return { ok: false, error: 'Aucun code en attente.' };
  }
  if (Date.now() > user.code.expiresAt) {
    return { ok: false, error: 'Ce code a expiré.' };
  }
  user.code.tries += 1;
  if (user.code.tries > MAX_CODE_TRIES) {
    user.code = null;
    store.save();
    return { ok: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
  }
  if (String(value) !== user.code.value) {
    store.save();
    return { ok: false, error: 'Code incorrect.' };
  }
  return { ok: true };
}

function verifyEmail(userId, value) {
  const user = store.load().users.find((u) => u.id === userId);
  const result = checkCode(user, 'verify', value);
  if (!result.ok) return result;
  user.verified = true;
  user.code = null;
  store.record('verified', { userId });
  store.save();
  return { ok: true, user };
}

/* ------------------------------------------------------------------ Session */

/* Les sessions expirées ne partaient qu'au moment où l'on présentait leur
   jeton : celles qu'on ne représente jamais restaient dans le fichier pour
   toujours. On balaie à chaque ouverture, ce qui suffit largement. */
function pruneSessions(db) {
  const now = Date.now();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
  return before - db.sessions.length;
}

function openSession(user) {
  const db = store.load();
  pruneSessions(db);
  const session = {
    token: token(),
    userId: user.id,
    cabinetId: user.cabinetId,
    role: user.role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MS
  };
  db.sessions.push(session);
  store.record('login', { userId: user.id, cabinetId: user.cabinetId });
  store.save();
  return session;
}

/* Empreinte de comparaison, calculée une fois au démarrage.

   Le message était bien le même pour un compte inexistant et un mot de passe
   faux — mais pas le temps de réponse : sans utilisateur, on ne dérivait aucune
   empreinte et la réponse revenait en une milliseconde au lieu de cinquante.
   Chronométrer suffisait donc à savoir qui a un compte chez Ally, c'est-à-dire
   qui est client. On dérive maintenant dans les deux cas. */
const DUMMY_HASH = hashPassword('empreinte de comparaison, jamais utilisée');

function login(email, password) {
  const user = findUser(email);
  /* Même message dans les deux cas : sinon la page permet de découvrir qui a
     un compte, c'est-à-dire qui est client. */
  const refus = { ok: false, error: 'Identifiants incorrects.' };

  if (!user) {
    verifyPassword(String(password || ''), DUMMY_HASH);
    return refus;
  }
  if (!verifyPassword(password, user.pass)) {
    store.record('login-failed', { userId: user.id });
    store.save();
    return refus;
  }
  if (!user.verified) return { ok: false, error: 'unverified', user };

  return { ok: true, user, session: openSession(user) };
}

function sessionFrom(tokenValue) {
  if (!tokenValue) return null;
  const db = store.load();
  const session = db.sessions.find((s) => s.token === tokenValue);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    db.sessions = db.sessions.filter((s) => s.token !== tokenValue);
    store.save();
    return null;
  }
  return session;
}

function logout(tokenValue) {
  const db = store.load();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.token !== tokenValue);
  if (db.sessions.length !== before) {
    store.record('logout', {});
    store.save();
  }
}

/* -------------------------------------------------- Mot de passe oublié */

function requestReset(email) {
  const user = findUser(email);
  /* Réponse identique dans les deux cas. Le code n'est émis que si le compte
     existe, mais l'appelant ne peut pas faire la différence. */
  if (!user) return { ok: true, code: null };
  return { ok: true, code: issueCode(user.id, 'reset'), userId: user.id };
}

function resetPassword(userId, value, password) {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  }
  const user = store.load().users.find((u) => u.id === userId);
  const result = checkCode(user, 'reset', value);
  if (!result.ok) return result;

  user.pass = hashPassword(password);
  user.code = null;
  /* Toutes les sessions tombent : si le mot de passe a été réinitialisé, c'est
     peut-être qu'un tiers y avait accès. */
  const db = store.load();
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  store.record('password-reset', { userId: user.id });
  store.save();
  return { ok: true, user };
}

module.exports = {
  signup, issueCode, verifyEmail, ensureAdmin,
  invite, acceptInvite, removeMember, isOwner, seatsOf, SEATS,
  login, logout, sessionFrom, openSession,
  requestReset, resetPassword,
  findUser, findById, pruneSessions, SESSION_MS
};
