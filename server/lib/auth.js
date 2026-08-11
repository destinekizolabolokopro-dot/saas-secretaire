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

function openSession(user) {
  const db = store.load();
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

function login(email, password) {
  const user = findUser(email);
  /* Même message dans les deux cas : sinon la page permet de découvrir qui a
     un compte, c'est-à-dire qui est client. */
  const refus = { ok: false, error: 'Identifiants incorrects.' };

  if (!user) return refus;
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
  login, logout, sessionFrom, openSession,
  requestReset, resetPassword,
  findUser, SESSION_MS
};
