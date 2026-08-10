/* Ally — primitives cryptographiques.
   Uniquement des modules Node natifs : rien à installer, rien à auditer en
   plus. Chaque fonction porte la raison de son choix, parce que ce sont
   exactement les décisions qu'un prestataire relira le jour d'un audit. */
'use strict';

const crypto = require('node:crypto');

/* ---------------------------------------------------------------- Secrets */

/* La clé de chiffrement ne vit jamais dans le code ni dans la base : elle est
   lue dans l'environnement au démarrage. En développement, on en dérive une
   depuis une phrase fixe pour que le serveur démarre — et on le dit fort. */
function readKey() {
  const raw = process.env.ALLY_SECRET_KEY;
  if (raw) {
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) {
      throw new Error('ALLY_SECRET_KEY doit faire 32 octets en hexadécimal (64 caractères).');
    }
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ALLY_SECRET_KEY est obligatoire en production.');
  }
  console.warn('[ally] ALLY_SECRET_KEY absente : clé de développement dérivée. '
    + 'Ne jamais faire tourner ainsi en production.');
  return crypto.scryptSync('cle-de-developpement-ally', 'ally-dev-salt', 32);
}

const KEY = readKey();

/* ------------------------------------------------------- Mots de passe */

/* scrypt, natif à Node. argon2id reste le meilleur choix, mais il exige une
   dépendance compilée : on garde scrypt tant qu'on n'a pas d'étape de build,
   avec des paramètres coûteux. Le format stocké porte ses propres paramètres,
   pour pouvoir les durcir plus tard sans invalider les comptes existants. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('base64'), derived.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const options = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');

  let derived;
  try {
    derived = crypto.scryptSync(password, salt, expected.length, options);
  } catch (e) {
    return false;
  }
  /* Comparaison à temps constant : une comparaison naïve laisse mesurer le
     nombre d'octets corrects et reconstruire l'empreinte octet par octet. */
  return crypto.timingSafeEqual(derived, expected);
}

/* ------------------------------------------- Chiffrement au niveau du champ */

/* AES-256-GCM : confidentialité et intégrité en une passe. C'est la seule
   protection qui tienne si quelqu'un obtient un export de la base — le
   chiffrement du disque, lui, ne protège que du vol de matériel. */
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:v1:' + Buffer.concat([iv, tag, body]).toString('base64');
}

function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value;
  const raw = Buffer.from(value.slice(7), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/* ------------------------------------------------------------- Webhooks */

/* Sans vérification de signature, n'importe qui peut poster de faux appels et
   de faux paiements sur nos points d'entrée publics. La comparaison est à
   temps constant, et la fenêtre temporelle empêche de rejouer une requête
   interceptée. */
function verifySignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!secret) return { ok: false, reason: 'aucun secret configuré' };
  if (!header) return { ok: false, reason: 'signature absente' };

  const parts = String(header).split(',').reduce((acc, chunk) => {
    const [k, v] = chunk.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  if (!parts.t || !parts.v1) return { ok: false, reason: 'signature mal formée' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: 'signature expirée' };
  }

  const expected = crypto.createHmac('sha256', secret)
    .update(parts.t + '.' + rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(parts.v1), 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'signature invalide' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature invalide' };
  return { ok: true };
}

/* Utilitaire symétrique, pour que les tests puissent signer comme Retell. */
function sign(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/* ------------------------------------------------------------- Jetons */

function token() { return crypto.randomBytes(32).toString('base64url'); }

/* Code à usage unique. randomInt est cryptographiquement sûr, contrairement à
   Math.random — un code de vérification devinable ne vérifie rien. */
function code6() { return String(crypto.randomInt(100000, 1000000)); }

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(9).toString('base64url');
}

module.exports = {
  hashPassword, verifyPassword,
  encrypt, decrypt,
  verifySignature, sign,
  token, code6, id
};
