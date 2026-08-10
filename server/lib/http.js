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
    if (at > 0) acc[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
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

function rateLimit(key, { max = 10, windowMs = 60000 } = {}) {
  const now = Date.now();
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

function resetRateLimits() { buckets.clear(); }

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
  rateLimit, resetRateLimits, clientIp,
  MAX_BODY
};
