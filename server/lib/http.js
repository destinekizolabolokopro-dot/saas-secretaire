/* Ally — utilitaires HTTP : corps de requête, réponses, cookies, limitation
   du débit. Rien d'exotique, mais chaque garde-fou est ici plutôt que répété
   dans chaque route, pour qu'aucune ne puisse l'oublier. */
'use strict';

/* Un corps de requête sans plafond est un déni de service à une ligne. */
const MAX_BODY = 256 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Corps trop volumineux'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    /* En-têtes de sécurité de base. HSTS n'est posé qu'en HTTPS réel : annoncé
       à tort en local, il rendrait le site inaccessible en http. */
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const at = part.indexOf('=');
    if (at <= 0) return acc;
    const value = part.slice(at + 1).trim();
    /* decodeURIComponent lève sur un pourcentage isolé — « ally_session=% ».
       Sans ce filet, un cookie mal formé faisait répondre 500 à toutes les
       requêtes du navigateur concerné, y compris aux pages : le site devenait
       inutilisable jusqu'à ce que la personne vide ses cookies elle-même. */
    let decoded;
    try { decoded = decodeURIComponent(value); }
    catch (e) { decoded = value; }
    acc[part.slice(0, at).trim()] = decoded;
    return acc;
  }, {});
}

/* httpOnly : le jeton reste inaccessible au JavaScript de la page, donc une
   faille XSS ne suffit pas à voler la session. sameSite=Lax bloque l'usage du
   cookie depuis un autre site. secure dès qu'on est en HTTPS. */
function setSession(res, token, maxAgeSeconds) {
  const bits = [
    'ally_session=' + encodeURIComponent(token),
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=' + maxAgeSeconds
  ];
  if (process.env.NODE_ENV === 'production') bits.push('Secure');
  res.setHeader('set-cookie', bits.join('; '));
}

function clearSession(res) {
  res.setHeader('set-cookie', 'ally_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

/* ------------------------------------------------------ Limitation du débit */
/* En mémoire, ce qui suffit à un seul processus. Derrière plusieurs instances,
   il faudra un compteur partagé (Redis) — sinon la limite se divise par le
   nombre de machines. */
const buckets = new Map();

/* La table des compteurs est elle-même une cible : chaque adresse email
   essayée y crée une entrée, et rien ne l'effaçait. Quelques centaines de
   milliers de tentatives sur des adresses inventées suffisaient à faire enfler
   la mémoire du processus indéfiniment. On balaie donc les compteurs périmés,
   et on plafonne la table. */
const MAX_BUCKETS = 50000;

function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
  /* Si le balayage ne suffit pas — beaucoup de fenêtres encore ouvertes — on
     vide les plus anciennes entrées. Perdre un compteur en cours est moins
     grave que de perdre le serveur. */
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++removed >= excess) break;
    }
  }
}

let lastSweep = 0;
const SWEEP_MS = 60000;

function rateLimit(key, { max = 10, windowMs = 60000 } = {}) {
  const now = Date.now();
  /* Balayage périodique, et immédiat si la table dépasse son plafond : la
     minute d'attente ne doit pas laisser la mémoire filer pendant une rafale. */
  if (now - lastSweep > SWEEP_MS || buckets.size > MAX_BUCKETS) {
    lastSweep = now;
    sweep(now);
  }

  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: max - bucket.count };
}

function resetRateLimits() { buckets.clear(); lastSweep = 0; }

function rateLimitSize() { return buckets.size; }

/* Adresse de l'appelant. On ne fait confiance à x-forwarded-for que si on a
   explicitement déclaré tourner derrière un proxy : sinon n'importe qui
   contourne la limitation en changeant un en-tête. */
function clientIp(req) {
  if (process.env.ALLY_TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'inconnu';
}

module.exports = {
  readBody, json, fail, parseCookies,
  setSession, clearSession,
  rateLimit, resetRateLimits, rateLimitSize, clientIp,
  MAX_BODY
};
