/* Ally — API.

   Serveur HTTP sans aucune dépendance : `node server/index.js` suffit. Il est
   volontairement petit, parce que son intérêt n'est pas la richesse
   fonctionnelle mais la structure — cloisonnement, chiffrement, signatures,
   journal — que la version définitive reprendra telle quelle.

   Ce qui reste à brancher, et qui demande des comptes tiers : l'envoi réel des
   emails (Brevo), l'agenda (Google), le paiement (Stripe) et l'agent vocal
   (Retell). Les points d'entrée sont là, les intégrations non. */
'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const store = require('./lib/store');
const auth = require('./lib/auth');
const repo = require('./lib/repo');
const H = require('./lib/http');
const statics = require('./lib/static');
const { verifySignature } = require('./lib/crypto');

const PORT = Number(process.env.PORT || 8787);

/* Toute route sous /api/ sauf celles-ci exige une session valide. */
const PUBLIC = new Set([
  'POST /api/auth/signup',
  'POST /api/auth/verify',
  'POST /api/auth/resend',
  'POST /api/auth/login',
  'POST /api/auth/forgot',
  'POST /api/auth/reset',
  'POST /api/webhooks/retell',
  'GET /api/health',
  /* « Qui suis-je » a une réponse valable sans session : « personne ». Répondre
     401 obligeait le navigateur à journaliser une erreur rouge à chaque
     chargement de page, pour un état parfaitement normal. */
  'GET /api/me'
]);

/* ------------------------------------------------------------------ Routes */

const routes = {

  'GET /api/health': async (ctx) => H.json(ctx.res, 200, { ok: true, at: Date.now() }),

  /* ---------------------------------------------------------------- Auth */

  'POST /api/auth/signup': async (ctx) => {
    const limit = H.rateLimit('signup:' + ctx.ip, { max: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return H.fail(ctx.res, 429, 'Trop de tentatives. Réessayez plus tard.');

    const result = auth.signup(ctx.body);
    if (!result.ok) return H.fail(ctx.res, 400, result.error);

    const code = auth.issueCode(result.user.id, 'verify');
    /* En production ce code part par email et ne revient jamais dans la
       réponse. Il n'est exposé qu'en développement, pour pouvoir dérouler le
       parcours sans boîte mail. */
    H.json(ctx.res, 201, {
      userId: result.user.id,
      cabinetId: result.cabinet.id,
      devCode: process.env.NODE_ENV === 'production' ? undefined : code
    });
  },

  /* Un code de vérification se perd : il arrive dans les indésirables, ou la
     personne ferme l'onglet. En redemander un ne doit pas obliger à recréer un
     compte. La réponse est la même quel que soit l'identifiant fourni — sinon
     la route dirait qui existe et qui n'a pas encore confirmé son adresse. */
  'POST /api/auth/resend': async (ctx) => {
    const limit = H.rateLimit('resend:' + ctx.ip, { max: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return H.fail(ctx.res, 429, 'Trop de demandes. Réessayez plus tard.');

    const user = store.load().users.find((u) => u.id === ctx.body.userId);
    const code = user && !user.verified ? auth.issueCode(user.id, 'verify') : null;
    H.json(ctx.res, 200, {
      ok: true,
      devCode: process.env.NODE_ENV === 'production' ? undefined : code
    });
  },

  'POST /api/auth/verify': async (ctx) => {
    const result = auth.verifyEmail(ctx.body.userId, ctx.body.code);
    if (!result.ok) return H.fail(ctx.res, 400, result.error);

    const session = auth.openSession(result.user);
    H.setSession(ctx.res, session.token, auth.SESSION_MS / 1000);
    H.json(ctx.res, 200, { ok: true, cabinetId: result.user.cabinetId });
  },

  'POST /api/auth/login': async (ctx) => {
    /* Limitation par adresse ET par compte visé : sinon un attaquant change
       d'adresse IP pour continuer à essayer sur le même compte. */
    const perIp = H.rateLimit('login:ip:' + ctx.ip, { max: 10, windowMs: 15 * 60 * 1000 });
    const perUser = H.rateLimit('login:user:' + String(ctx.body.email || '').toLowerCase(),
      { max: 5, windowMs: 15 * 60 * 1000 });
    if (!perIp.ok || !perUser.ok) {
      return H.fail(ctx.res, 429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    }

    const result = auth.login(ctx.body.email, ctx.body.password);
    if (!result.ok && result.error === 'unverified') {
      const code = auth.issueCode(result.user.id, 'verify');
      return H.json(ctx.res, 403, {
        error: 'unverified',
        userId: result.user.id,
        devCode: process.env.NODE_ENV === 'production' ? undefined : code
      });
    }
    if (!result.ok) return H.fail(ctx.res, 401, result.error);

    H.setSession(ctx.res, result.session.token, auth.SESSION_MS / 1000);
    H.json(ctx.res, 200, { ok: true, cabinetId: result.user.cabinetId, role: result.user.role });
  },

  'POST /api/auth/logout': async (ctx) => {
    auth.logout(ctx.token);
    H.clearSession(ctx.res);
    H.json(ctx.res, 200, { ok: true });
  },

  'POST /api/auth/forgot': async (ctx) => {
    H.rateLimit('forgot:' + ctx.ip, { max: 5, windowMs: 60 * 60 * 1000 });
    const result = auth.requestReset(ctx.body.email);
    /* Réponse volontairement identique, que le compte existe ou non. */
    H.json(ctx.res, 200, {
      ok: true,
      userId: result.userId,
      devCode: process.env.NODE_ENV === 'production' ? undefined : result.code
    });
  },

  'POST /api/auth/reset': async (ctx) => {
    const result = auth.resetPassword(ctx.body.userId, ctx.body.code, ctx.body.password);
    if (!result.ok) return H.fail(ctx.res, 400, result.error);
    H.json(ctx.res, 200, { ok: true });
  },

  /* ------------------------------------------------------------- Cabinet */

  'GET /api/me': async (ctx) => {
    if (!ctx.session) return H.json(ctx.res, 200, { authenticated: false });
    const data = repo.forCabinet(ctx.session.cabinetId);
    H.json(ctx.res, 200, {
      authenticated: true,
      role: ctx.session.role,
      cabinet: data.cabinet(),
      members: data.members()
    });
  },

  'GET /api/calls': async (ctx) => {
    H.json(ctx.res, 200, { calls: repo.forCabinet(ctx.session.cabinetId).calls.list() });
  },

  /* L'identifiant vient de l'URL, mais le filtre vient de la session : un
     appel d'un autre cabinet répond 404, comme un appel inexistant. */
  'GET /api/calls/:id': async (ctx) => {
    const call = repo.forCabinet(ctx.session.cabinetId).calls.get(ctx.params.id);
    if (!call) return H.fail(ctx.res, 404, 'Introuvable.');
    H.json(ctx.res, 200, { call });
  },

  'GET /api/messages': async (ctx) => {
    H.json(ctx.res, 200, { messages: repo.forCabinet(ctx.session.cabinetId).messages.list() });
  },

  /* Envoi différé de dix secondes : l'email reste rattrapable, comme dans
     l'interface. Côté serveur, cela veut dire une file d'attente — pas un
     rappel de message, qui n'existe pas en SMTP. */
  'POST /api/messages': async (ctx) => {
    const data = repo.forCabinet(ctx.session.cabinetId);
    const message = data.messages.create({
      to: String(ctx.body.to || '').trim(),
      subject: String(ctx.body.subject || '').trim(),
      body: String(ctx.body.body || ''),
      state: 'queued',
      sendAfter: Date.now() + 10000
    });
    H.json(ctx.res, 201, { message });
  },

  'POST /api/messages/:id/cancel': async (ctx) => {
    const data = repo.forCabinet(ctx.session.cabinetId);
    const message = data.messages.get(ctx.params.id);
    if (!message) return H.fail(ctx.res, 404, 'Introuvable.');
    if (message.state !== 'queued') return H.fail(ctx.res, 409, 'Déjà parti.');
    H.json(ctx.res, 200, { message: data.messages.update(ctx.params.id, { state: 'cancelled' }) });
  },

  /* --------------------------------------------------------------- Admin */

  'GET /api/admin/stats': async (ctx) => {
    if (ctx.session.role !== 'admin') return H.fail(ctx.res, 403, 'Accès réservé.');
    H.json(ctx.res, 200, { stats: repo.admin.stats(), cabinets: repo.admin.cabinets() });
  },

  'GET /api/admin/events': async (ctx) => {
    if (ctx.session.role !== 'admin') return H.fail(ctx.res, 403, 'Accès réservé.');
    H.json(ctx.res, 200, { events: repo.admin.events(100) });
  },

  /* ------------------------------------------------------------ Webhooks */

  /* Point d'entrée public : sans vérification de signature, n'importe qui
     injecte de faux appels. Le corps brut est signé, pas l'objet analysé —
     une re-sérialisation changerait les octets et invaliderait tout. */
  'POST /api/webhooks/retell': async (ctx) => {
    const check = verifySignature(
      ctx.raw,
      ctx.req.headers['x-retell-signature'],
      process.env.RETELL_WEBHOOK_SECRET
    );
    if (!check.ok) {
      store.record('webhook-rejected', { reason: check.reason });
      store.save();
      return H.fail(ctx.res, 401, 'Signature invalide.');
    }

    const payload = ctx.body || {};
    const cabinet = store.load().cabinets.find((c) => c.id === payload.cabinetId);
    if (!cabinet) return H.fail(ctx.res, 404, 'Cabinet inconnu.');

    const call = repo.forCabinet(cabinet.id).calls.create({
      from: payload.from || 'inconnu',
      at: payload.at || Date.now(),
      durationSec: Number(payload.durationSec || 0),
      outcome: payload.outcome || 'handled',
      summary: payload.summary || '',
      transcript: payload.transcript || ''
    });

    store.record('call-received', { cabinetId: cabinet.id, callId: call.id });
    store.save();
    H.json(ctx.res, 201, { id: call.id });
  }
};

/* -------------------------------------------------------------- Répartiteur */

/* Trouve la route et extrait les paramètres d'URL. Volontairement minimal :
   pas de correspondance par expression régulière libre, donc pas de surprise. */
function match(method, pathname) {
  const direct = method + ' ' + pathname;
  if (routes[direct]) return { key: direct, handler: routes[direct], params: {} };

  const parts = pathname.split('/').filter(Boolean);
  for (const key of Object.keys(routes)) {
    const [routeMethod, routePath] = key.split(' ');
    if (routeMethod !== method) continue;
    const routeParts = routePath.split('/').filter(Boolean);
    if (routeParts.length !== parts.length) continue;

    const params = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) params[routeParts[i].slice(1)] = parts[i];
      else if (routeParts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { key, handler: routes[key], params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const found = match(req.method, url.pathname);

    /* Hors /api, on sert la maquette : une seule commande fait tourner
       l'ensemble. En production, ces fichiers viendront de l'hébergeur. */
    if (!found) {
      if (!url.pathname.startsWith('/api/') && statics.serve(req, res, url.pathname)) return;
      return H.fail(res, 404, 'Route inconnue.');
    }

    const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await H.readBody(req) : '';
    let body = {};
    if (raw) {
      try { body = JSON.parse(raw); }
      catch (e) { return H.fail(res, 400, 'JSON invalide.'); }
    }

    const token = H.parseCookies(req).ally_session;
    const session = auth.sessionFrom(token);

    /* Le contrôle d'accès est ici, une seule fois, en liste blanche : une
       route ajoutée est protégée par défaut. L'inverse — une liste noire —
       laisse passer tout ce qu'on oublie d'y inscrire. */
    if (!PUBLIC.has(found.key) && !session) {
      return H.fail(res, 401, 'Session requise.');
    }

    await found.handler({
      req, res, url, body, raw, token, session,
      params: found.params,
      ip: H.clientIp(req)
    });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error('[ally]', error);
    /* On ne renvoie jamais le message interne : il révèle la structure du
       serveur et parfois le contenu de la base. */
    H.fail(res, status, status === 500 ? 'Erreur interne.' : error.message);
  }
});

/* File d'envoi : les messages en attente partent une fois le délai écoulé.
   C'est ici que Brevo sera appelé. */
const OUTBOX_TICK = 2000;
function flushOutbox() {
  const db = store.load();
  let changed = false;
  for (const message of db.messages) {
    if (message.state === 'queued' && message.sendAfter <= Date.now()) {
      message.state = 'sent';
      message.sentAt = Date.now();
      store.record('message-sent', { cabinetId: message.cabinetId, messageId: message.id });
      changed = true;
    }
  }
  if (changed) store.save();
}

if (require.main === module) {
  setInterval(flushOutbox, OUTBOX_TICK).unref();
  server.listen(PORT, () => {
    console.log('[ally] API à l\'écoute sur http://localhost:' + PORT);
    console.log('[ally] données : ' + store.FILE);
  });
}

module.exports = { server, routes, match, flushOutbox };
