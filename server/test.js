/* Ally — tests du serveur.

   Chaque test correspond à une mesure de sécurité annoncée dans
   ARCHITECTURE.md. Le plus important est le cloisonnement : il tourne à chaque
   déploiement, parce que c'est la faille qui coûterait le plus cher et la plus
   facile à réintroduire sans s'en apercevoir.

   Lancement : node server/test.js */
'use strict';

process.env.ALLY_DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'ally-test-' + process.pid);
process.env.RETELL_WEBHOOK_SECRET = 'secret-de-test';

const assert = require('node:assert');
const fs = require('node:fs');
const { server, flushOutbox } = require('./index');
const store = require('./lib/store');
const auth = require('./lib/auth');
const H = require('./lib/http');
const { sign, encrypt, decrypt, hashPassword, verifyPassword } = require('./lib/crypto');

let passed = 0;
const failures = [];

async function test(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ' + label);
  } catch (error) {
    failures.push(label + ' : ' + error.message);
    console.log('  ÉCHEC ' + label + ' — ' + error.message);
  }
}

/* ------------------------------------------------------------ Client HTTP */

let base;
const jar = new Map();

async function call(method, path, { body, cookie, headers } = {}) {
  const options = {
    method,
    headers: { 'content-type': 'application/json', ...(headers || {}) }
  };
  if (cookie) options.headers.cookie = cookie;

  const response = await fetch(base + path, {
    ...options,
    body: body === undefined ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body))
  });

  const setCookie = response.headers.get('set-cookie');
  let token = null;
  if (setCookie) {
    const m = /ally_session=([^;]*)/.exec(setCookie);
    if (m) token = m[1];
  }
  let payload = null;
  try { payload = await response.json(); } catch (e) { payload = null; }
  return { status: response.status, body: payload, token };
}

/* Inscrit un cabinet complet et renvoie son cookie de session.
   On remet les compteurs à zéro : le plafond de cinq inscriptions par heure
   et par adresse IP est fait pour les attaques, pas pour la suite de tests,
   qui en crée plusieurs depuis la même machine. */
async function newCabinet(email, org) {
  H.resetRateLimits();
  const created = await call('POST', '/api/auth/signup', {
    body: { email, password: 'MotDePasse42!', org, trade: 'avocat' }
  });
  assert.strictEqual(created.status, 201, 'inscription refusée : ' + JSON.stringify(created.body));
  const verified = await call('POST', '/api/auth/verify', {
    body: { userId: created.body.userId, code: created.body.devCode }
  });
  assert.strictEqual(verified.status, 200, 'vérification refusée');
  return {
    cabinetId: created.body.cabinetId,
    userId: created.body.userId,
    cookie: 'ally_session=' + verified.token
  };
}

/* ------------------------------------------------------------------ Suite */

(async () => {
  store.reset();
  await new Promise((resolve) => server.listen(0, resolve));
  base = 'http://127.0.0.1:' + server.address().port;

  console.log('\n== Cryptographie ==');

  await test('un mot de passe ne se retrouve pas dans son empreinte', () => {
    const hash = hashPassword('MotDePasse42!');
    assert.ok(!hash.includes('MotDePasse42!'), 'le mot de passe apparaît en clair');
    assert.ok(hash.startsWith('scrypt$'), 'format inattendu : ' + hash.slice(0, 20));
  });

  await test('deux empreintes du même mot de passe diffèrent', () => {
    assert.notStrictEqual(hashPassword('identique'), hashPassword('identique'));
  });

  await test('la vérification accepte le bon et refuse le mauvais', () => {
    const hash = hashPassword('MotDePasse42!');
    assert.strictEqual(verifyPassword('MotDePasse42!', hash), true);
    assert.strictEqual(verifyPassword('MotDePasse42', hash), false);
    assert.strictEqual(verifyPassword('', hash), false);
  });

  await test('le chiffrement de champ fait l\'aller-retour', () => {
    const clear = 'Mme Aubert demande le report de son rendez-vous.';
    const sealed = encrypt(clear);
    assert.ok(sealed.startsWith('enc:v1:'), 'préfixe manquant');
    assert.ok(!sealed.includes('Aubert'), 'le contenu transparaît');
    assert.strictEqual(decrypt(sealed), clear);
  });

  await test('un chiffré altéré est refusé, pas déchiffré de travers', () => {
    const sealed = encrypt('secret professionnel');
    const raw = Buffer.from(sealed.slice(7), 'base64');
    raw[raw.length - 1] ^= 0xff;                       // on retourne un octet
    const tampered = 'enc:v1:' + raw.toString('base64');
    assert.throws(() => decrypt(tampered), 'un contenu modifié a été accepté');
  });

  console.log('\n== Inscription et session ==');

  await test('inscription puis vérification ouvrent une session', async () => {
    const a = await newCabinet('a@cabinet-a.fr', 'Cabinet A');
    assert.ok(a.cookie.length > 20);
  });

  await test('la même adresse ne peut pas être réutilisée', async () => {
    H.resetRateLimits();
    const again = await call('POST', '/api/auth/signup', {
      body: { email: 'a@cabinet-a.fr', password: 'MotDePasse42!', org: 'Doublon' }
    });
    assert.strictEqual(again.status, 400);
  });

  await test('un mot de passe trop court est refusé', async () => {
    H.resetRateLimits();
    const short = await call('POST', '/api/auth/signup', {
      body: { email: 'court@cabinet.fr', password: 'court', org: 'Court' }
    });
    assert.strictEqual(short.status, 400);
  });

  await test('un code de vérification erroné ne vérifie rien', async () => {
    H.resetRateLimits();
    const created = await call('POST', '/api/auth/signup', {
      body: { email: 'code@cabinet.fr', password: 'MotDePasse42!', org: 'Code' }
    });
    const wrong = await call('POST', '/api/auth/verify', {
      body: { userId: created.body.userId, code: '000000' }
    });
    assert.strictEqual(wrong.status, 400);
  });

  await test('une route protégée refuse sans session', async () => {
    const anonymous = await call('GET', '/api/calls');
    assert.strictEqual(anonymous.status, 401);
  });

  await test('« qui suis-je » répond « personne » sans erreur', async () => {
    const me = await call('GET', '/api/me');
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.authenticated, false);
    assert.ok(!me.body.cabinet, 'un cabinet est renvoyé sans session');
  });

  await test('un jeton inventé ne vaut pas une session', async () => {
    const forged = await call('GET', '/api/calls', { cookie: 'ally_session=nimportequoi' });
    assert.strictEqual(forged.status, 401);
  });

  console.log('\n== Cloisonnement des cabinets ==');

  /* Le test qui compte : deux cabinets, chacun avec ses données, et aucune
     route ne doit laisser l'un atteindre l'autre. */
  const A = await newCabinet('pro-a@cabinet-a.fr', 'Cabinet A');
  const B = await newCabinet('pro-b@cabinet-b.fr', 'Cabinet B');

  const callA = await call('POST', '/api/webhooks/retell', {
    body: JSON.stringify({ cabinetId: A.cabinetId, from: '0600000001', summary: 'Secret de A' }),
    headers: {
      'x-retell-signature': sign(
        JSON.stringify({ cabinetId: A.cabinetId, from: '0600000001', summary: 'Secret de A' }),
        process.env.RETELL_WEBHOOK_SECRET)
    }
  });

  await test('l\'appel de A est bien enregistré', () => {
    assert.strictEqual(callA.status, 201, JSON.stringify(callA.body));
  });

  await test('A voit son appel', async () => {
    const list = await call('GET', '/api/calls', { cookie: A.cookie });
    assert.strictEqual(list.body.calls.length, 1);
    assert.strictEqual(list.body.calls[0].summary, 'Secret de A');
  });

  await test('B ne voit aucun appel de A', async () => {
    const list = await call('GET', '/api/calls', { cookie: B.cookie });
    assert.strictEqual(list.body.calls.length, 0, 'fuite entre cabinets');
  });

  await test('B ne peut pas lire un appel de A par son identifiant', async () => {
    const stolen = await call('GET', '/api/calls/' + callA.body.id, { cookie: B.cookie });
    assert.strictEqual(stolen.status, 404, 'fuite par identifiant direct');
  });

  await test('la réponse ne distingue pas « chez un autre » de « inexistant »', async () => {
    const other = await call('GET', '/api/calls/' + callA.body.id, { cookie: B.cookie });
    const ghost = await call('GET', '/api/calls/cal_inexistant', { cookie: B.cookie });
    assert.strictEqual(other.status, ghost.status, 'la réponse révèle l\'existence');
    assert.deepStrictEqual(other.body, ghost.body);
  });

  await test('les messages sont cloisonnés de la même façon', async () => {
    const sent = await call('POST', '/api/messages', {
      cookie: A.cookie,
      body: { to: 'client@example.fr', subject: 'Confirmation', body: 'Corps confidentiel de A' }
    });
    assert.strictEqual(sent.status, 201);

    const mine = await call('GET', '/api/messages', { cookie: A.cookie });
    assert.strictEqual(mine.body.messages.length, 1);
    assert.strictEqual(mine.body.messages[0].body, 'Corps confidentiel de A');

    const theirs = await call('GET', '/api/messages', { cookie: B.cookie });
    assert.strictEqual(theirs.body.messages.length, 0, 'fuite de messages');

    const cancel = await call('POST', '/api/messages/' + sent.body.message.id + '/cancel',
      { cookie: B.cookie });
    assert.strictEqual(cancel.status, 404, 'B a pu agir sur un message de A');
  });

  await test('B ne peut pas se déclarer d\'un autre cabinet', async () => {
    /* On tente d'imposer le cabinet dans le corps de la requête : le dépôt
       doit l'ignorer et retenir celui de la session. */
    const forged = await call('POST', '/api/messages', {
      cookie: B.cookie,
      body: { to: 'x@y.fr', subject: 'Injection', body: 'test', cabinetId: A.cabinetId }
    });
    assert.strictEqual(forged.status, 201);
    const listA = await call('GET', '/api/messages', { cookie: A.cookie });
    assert.strictEqual(listA.body.messages.length, 1, 'le message a atterri chez A');
  });

  console.log('\n== Chiffrement en base ==');

  await test('le fichier de données ne contient rien en clair', () => {
    const raw = fs.readFileSync(store.FILE, 'utf8');
    assert.ok(!raw.includes('Secret de A'), 'un résumé d\'appel est lisible en base');
    assert.ok(!raw.includes('Corps confidentiel de A'), 'un corps d\'email est lisible en base');
    assert.ok(!raw.includes('MotDePasse42!'), 'un mot de passe est lisible en base');
  });

  console.log('\n== Webhooks ==');

  const payload = JSON.stringify({ cabinetId: A.cabinetId, from: '0600000002', summary: 'x' });

  await test('un webhook sans signature est rejeté', async () => {
    const res = await call('POST', '/api/webhooks/retell', { body: payload });
    assert.strictEqual(res.status, 401);
  });

  await test('une signature invalide est rejetée', async () => {
    const res = await call('POST', '/api/webhooks/retell', {
      body: payload, headers: { 'x-retell-signature': 't=' + Math.floor(Date.now() / 1000) + ',v1=faux' }
    });
    assert.strictEqual(res.status, 401);
  });

  await test('une signature d\'un autre secret est rejetée', async () => {
    const res = await call('POST', '/api/webhooks/retell', {
      body: payload, headers: { 'x-retell-signature': sign(payload, 'mauvais-secret') }
    });
    assert.strictEqual(res.status, 401);
  });

  await test('un corps modifié après signature est rejeté', async () => {
    const signature = sign(payload, process.env.RETELL_WEBHOOK_SECRET);
    const tampered = JSON.stringify({ cabinetId: B.cabinetId, from: '0600000002', summary: 'x' });
    const res = await call('POST', '/api/webhooks/retell', {
      body: tampered, headers: { 'x-retell-signature': signature }
    });
    assert.strictEqual(res.status, 401, 'un corps réécrit a été accepté');
  });

  await test('une signature trop ancienne est rejetée', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await call('POST', '/api/webhooks/retell', {
      body: payload,
      headers: { 'x-retell-signature': sign(payload, process.env.RETELL_WEBHOOK_SECRET, old) }
    });
    assert.strictEqual(res.status, 401, 'une signature d\'il y a une heure a été acceptée');
  });

  console.log('\n== Envoi différé ==');

  await test('un message part après le délai, et pas avant', async () => {
    const sent = await call('POST', '/api/messages', {
      cookie: A.cookie, body: { to: 'z@z.fr', subject: 'Différé', body: 'corps' }
    });
    const id = sent.body.message.id;

    flushOutbox();
    let list = await call('GET', '/api/messages', { cookie: A.cookie });
    let mine = list.body.messages.find((m) => m.id === id);
    assert.strictEqual(mine.state, 'queued', 'parti avant l\'heure');

    /* On avance l'échéance plutôt que d'attendre dix secondes. */
    const row = store.load().messages.find((m) => m.id === id);
    row.sendAfter = Date.now() - 1;
    flushOutbox();

    list = await call('GET', '/api/messages', { cookie: A.cookie });
    mine = list.body.messages.find((m) => m.id === id);
    assert.strictEqual(mine.state, 'sent');
  });

  await test('un message annulé ne part jamais', async () => {
    const sent = await call('POST', '/api/messages', {
      cookie: A.cookie, body: { to: 'z@z.fr', subject: 'Annulé', body: 'corps' }
    });
    await call('POST', '/api/messages/' + sent.body.message.id + '/cancel', { cookie: A.cookie });
    const row = store.load().messages.find((m) => m.id === sent.body.message.id);
    row.sendAfter = Date.now() - 1;
    flushOutbox();
    assert.strictEqual(row.state, 'cancelled', 'un message annulé est parti');
  });

  console.log('\n== Limitation du débit ==');

  await test('les tentatives de connexion sont plafonnées', async () => {
    H.resetRateLimits();
    let blocked = false;
    for (let i = 0; i < 12; i++) {
      const res = await call('POST', '/api/auth/login', {
        body: { email: 'pro-a@cabinet-a.fr', password: 'mauvais' + i }
      });
      if (res.status === 429) { blocked = true; break; }
    }
    assert.ok(blocked, 'aucun plafond sur la connexion');
  });

  console.log('\n== Rôles ==');

  await test('un professionnel n\'accède pas à la console d\'administration', async () => {
    H.resetRateLimits();
    const res = await call('GET', '/api/admin/stats', { cookie: A.cookie });
    assert.strictEqual(res.status, 403);
  });

  await test('l\'administrateur voit des volumes, jamais de contenu', async () => {
    const session = store.load().sessions.find((s) => s.cabinetId === A.cabinetId);
    session.role = 'admin';
    store.save();
    const res = await call('GET', '/api/admin/stats', { cookie: A.cookie });
    assert.strictEqual(res.status, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('Secret de A'), 'l\'admin voit un résumé d\'appel');
    assert.ok(!serialized.includes('Corps confidentiel'), 'l\'admin voit un corps d\'email');
    assert.ok(res.body.stats.cabinets >= 2);
  });

  await test('le rôle administrateur ne s\'obtient pas par un formulaire', async () => {
    H.resetRateLimits();
    const sournois = await call('POST', '/api/auth/signup', {
      body: { email: 'malin@cabinet.fr', password: 'MotDePasse42!', org: 'Malin', role: 'admin' }
    });
    assert.strictEqual(sournois.status, 201);
    const user = store.load().users.find((u) => u.id === sournois.body.userId);
    assert.strictEqual(user.role, 'pro', 'le rôle demandé dans le formulaire a été accordé');
  });

  await test('l\'administrateur vient de l\'environnement, et pas d\'ailleurs', () => {
    const sans = auth.ensureAdmin();
    assert.strictEqual(sans.ok, false, 'un administrateur est apparu sans configuration');

    process.env.ALLY_ADMIN_EMAIL = 'patron@ally.fr';
    process.env.ALLY_ADMIN_PASSWORD = 'court';
    assert.strictEqual(auth.ensureAdmin().ok, false, 'un mot de passe court est accepté');

    process.env.ALLY_ADMIN_PASSWORD = 'MotDePasseTresLong2026';
    const cree = auth.ensureAdmin();
    assert.ok(cree.ok && cree.created, 'administrateur non créé');
    assert.strictEqual(cree.user.role, 'admin');
    assert.ok(cree.user.verified, 'administrateur non vérifié');

    /* Deuxième démarrage : on retrouve le même compte, sans doublon. */
    const encore = auth.ensureAdmin();
    assert.ok(encore.ok && !encore.created, 'un second compte a été créé');
    const combien = store.load().users.filter((u) => u.email === 'patron@ally.fr').length;
    assert.strictEqual(combien, 1);

    delete process.env.ALLY_ADMIN_EMAIL;
    delete process.env.ALLY_ADMIN_PASSWORD;
  });

  await test('l\'administrateur créé peut se connecter et voir la plateforme', async () => {
    H.resetRateLimits();
    const connexion = await call('POST', '/api/auth/login', {
      body: { email: 'patron@ally.fr', password: 'MotDePasseTresLong2026' }
    });
    assert.strictEqual(connexion.status, 200);
    assert.strictEqual(connexion.body.role, 'admin');
    assert.ok(connexion.body.userId, 'l\'identifiant n\'est pas renvoyé après connexion');

    const vue = await call('GET', '/api/admin/stats', {
      cookie: 'ally_session=' + connexion.token
    });
    assert.strictEqual(vue.status, 200);
    assert.ok(vue.body.stats.cabinets >= 2);
  });

  console.log('\n== Renvoi du code de vérification ==');

  await test('un compte non confirmé peut redemander un code, et le nouveau marche', async () => {
    H.resetRateLimits();
    const fresh = await call('POST', '/api/auth/signup', {
      body: { email: 'renvoi@cabinet.fr', password: 'MotDePasse42!', org: 'Renvoi' }
    });
    assert.strictEqual(fresh.status, 201);

    const again = await call('POST', '/api/auth/resend', { body: { userId: fresh.body.userId } });
    assert.strictEqual(again.status, 200);
    assert.ok(again.body.devCode, 'aucun code renvoyé');
    assert.notStrictEqual(again.body.devCode, fresh.body.devCode, 'le même code est réémis');

    const stale = await call('POST', '/api/auth/verify', {
      body: { userId: fresh.body.userId, code: fresh.body.devCode }
    });
    assert.strictEqual(stale.status, 400, 'l\'ancien code est encore accepté');

    const done = await call('POST', '/api/auth/verify', {
      body: { userId: fresh.body.userId, code: again.body.devCode }
    });
    assert.strictEqual(done.status, 200);
  });

  await test('le renvoi ne dit pas qui existe ni qui a déjà confirmé', async () => {
    const inconnu = await call('POST', '/api/auth/resend', { body: { userId: 'usr_inexistant' } });
    const confirme = await call('POST', '/api/auth/resend', { body: { userId: A.userId } });
    assert.strictEqual(inconnu.status, confirme.status);
    assert.deepStrictEqual(inconnu.body, confirme.body);
    assert.ok(!confirme.body.devCode, 'un compte déjà confirmé reçoit un code');
  });

  console.log('\n== Agenda ==');

  await test('un rendez-vous est cloisonné et son client chiffré', async () => {
    const pose = await call('POST', '/api/rdv', {
      cookie: A.cookie,
      body: { date: '2026-09-14', time: '14:00', client: 'Mme Aubert', type: 'Consultation' }
    });
    assert.strictEqual(pose.status, 201);

    const brut = fs.readFileSync(store.FILE, 'utf8');
    assert.ok(!brut.includes('Mme Aubert'), 'le nom du client est lisible en base');

    const chezA = await call('GET', '/api/rdv', { cookie: A.cookie });
    assert.strictEqual(chezA.body.rdv.length, 1);
    assert.strictEqual(chezA.body.rdv[0].client, 'Mme Aubert');

    const chezB = await call('GET', '/api/rdv', { cookie: B.cookie });
    assert.strictEqual(chezB.body.rdv.length, 0, 'B voit l\'agenda de A');

    A.rdvId = pose.body.rdv.id;
  });

  await test('deux rendez-vous ne tiennent pas dans le même créneau', async () => {
    const doublon = await call('POST', '/api/rdv', {
      cookie: A.cookie,
      body: { date: '2026-09-14', time: '14:00', client: 'M. Doublon', type: 'Consultation' }
    });
    assert.strictEqual(doublon.status, 409);

    /* Mais le même créneau reste libre pour un autre cabinet. */
    const chezB = await call('POST', '/api/rdv', {
      cookie: B.cookie,
      body: { date: '2026-09-14', time: '14:00', client: 'Client de B', type: 'Consultation' }
    });
    assert.strictEqual(chezB.status, 201, 'le créneau de A bloque celui de B');
  });

  await test('une date ou une heure mal formée est refusée', async () => {
    const bancal = await call('POST', '/api/rdv', {
      cookie: A.cookie, body: { date: '14 septembre', time: '14h', client: 'X' }
    });
    assert.strictEqual(bancal.status, 400);
  });

  await test('on n\'annule pas le rendez-vous d\'un autre cabinet', async () => {
    const croise = await call('POST', '/api/rdv/' + A.rdvId + '/cancel', {
      cookie: B.cookie, body: {}
    });
    assert.strictEqual(croise.status, 404);

    const encore = await call('GET', '/api/rdv', { cookie: A.cookie });
    assert.strictEqual(encore.body.rdv.length, 1, 'le rendez-vous de A a disparu');
  });

  await test('Ally pose un rendez-vous pendant l\'appel', async () => {
    const payload = {
      cabinetId: A.cabinetId, from: '0611223344', summary: 'Veut un rendez-vous',
      rdv: { date: '2026-09-15', time: '10:00', client: 'M. Chevalier', type: 'Suivi' }
    };
    const raw = JSON.stringify(payload);
    const recu = await call('POST', '/api/webhooks/retell', {
      body: raw,
      headers: { 'x-retell-signature': sign(raw, process.env.RETELL_WEBHOOK_SECRET) }
    });
    assert.strictEqual(recu.status, 201);
    assert.ok(recu.body.rdvId, 'aucun rendez-vous posé');

    const liste = await call('GET', '/api/rdv', { cookie: A.cookie });
    const pris = liste.body.rdv.find((r) => r.id === recu.body.rdvId);
    assert.strictEqual(pris.source, 'call', 'l\'origine n\'est pas tracée');
    assert.strictEqual(pris.client, 'M. Chevalier');
  });

  await test('un créneau occupé ne fait pas perdre l\'appel', async () => {
    const payload = {
      cabinetId: A.cabinetId, from: '0699999999', summary: 'Voulait le même créneau',
      rdv: { date: '2026-09-15', time: '10:00', client: 'M. Tardif', type: 'Suivi' }
    };
    const raw = JSON.stringify(payload);
    const recu = await call('POST', '/api/webhooks/retell', {
      body: raw,
      headers: { 'x-retell-signature': sign(raw, process.env.RETELL_WEBHOOK_SECRET) }
    });
    assert.strictEqual(recu.status, 201, 'l\'appel a été perdu');
    assert.strictEqual(recu.body.rdvId, null, 'un doublon a été posé');
  });

  console.log('\n== Collaborateurs ==');

  await test('une formule à une place refuse l\'invitation', async () => {
    const refus = await call('POST', '/api/cabinet/invite', {
      cookie: A.cookie, body: { email: 'collegue@cabinet-a.fr' }
    });
    assert.strictEqual(refus.status, 403);
    assert.ok(/Expert/.test(refus.body.error), 'message : ' + refus.body.error);
    assert.ok(!auth.findUser('collegue@cabinet-a.fr'), 'le compte a été créé malgré le refus');
  });

  await test('un cabinet Expert invite, et l\'invité ne peut pas encore entrer', async () => {
    /* La formule vit sur le cabinet : on la passe à Expert comme le ferait un
       changement d'abonnement. */
    const cabinet = store.load().cabinets.find((c) => c.id === A.cabinetId);
    cabinet.plan = 'expert';
    store.save();

    const invited = await call('POST', '/api/cabinet/invite', {
      cookie: A.cookie, body: { email: 'collegue@cabinet-a.fr' }
    });
    assert.strictEqual(invited.status, 201);
    assert.ok(invited.body.devCode, 'aucun code d\'invitation');

    const user = auth.findUser('collegue@cabinet-a.fr');
    assert.strictEqual(user.cabinetId, A.cabinetId);
    assert.strictEqual(user.pass, null, 'un mot de passe existe déjà');
    assert.strictEqual(user.owner, false);

    H.resetRateLimits();
    const essai = await call('POST', '/api/auth/login', {
      body: { email: 'collegue@cabinet-a.fr', password: 'MotDePasse42!' }
    });
    assert.strictEqual(essai.status, 401, 'un compte sans mot de passe s\'est connecté');

    A.inviteId = user.id;
    A.inviteCode = invited.body.devCode;
  });

  await test('l\'invitation acceptée ouvre une session sur le bon cabinet', async () => {
    const mauvais = await call('POST', '/api/auth/accept', {
      body: { userId: A.inviteId, code: '000000', password: 'MotDePasse42!' }
    });
    assert.strictEqual(mauvais.status, 400);

    const rejoint = await call('POST', '/api/auth/accept', {
      body: { userId: A.inviteId, code: A.inviteCode, password: 'MotDePasse42!' }
    });
    assert.strictEqual(rejoint.status, 200);
    assert.strictEqual(rejoint.body.cabinetId, A.cabinetId);

    /* Et il voit bien les appels du cabinet — c'est tout l'intérêt. */
    const vue = await call('GET', '/api/calls', { cookie: 'ally_session=' + rejoint.token });
    assert.strictEqual(vue.status, 200);
    assert.ok(vue.body.calls.length >= 1);
    A.memberCookie = 'ally_session=' + rejoint.token;
  });

  await test('la même invitation ne sert pas deux fois', async () => {
    const encore = await call('POST', '/api/auth/accept', {
      body: { userId: A.inviteId, code: A.inviteCode, password: 'AutreMotDePasse42!' }
    });
    assert.strictEqual(encore.status, 400);
  });

  await test('le collaborateur ne peut ni inviter ni retirer', async () => {
    const invite = await call('POST', '/api/cabinet/invite', {
      cookie: A.memberCookie, body: { email: 'pirate@cabinet-a.fr' }
    });
    assert.strictEqual(invite.status, 403);

    const retire = await call('POST', '/api/cabinet/members/' + A.userId + '/remove', {
      cookie: A.memberCookie, body: {}
    });
    assert.strictEqual(retire.status, 403, 'un invité a pu retirer le responsable');
  });

  await test('retirer quelqu\'un ferme aussi ses sessions', async () => {
    const retire = await call('POST', '/api/cabinet/members/' + A.inviteId + '/remove', {
      cookie: A.cookie, body: {}
    });
    assert.strictEqual(retire.status, 200);

    const perime = await call('GET', '/api/calls', { cookie: A.memberCookie });
    assert.strictEqual(perime.status, 401, 'la session du retiré vaut encore');
    assert.ok(!auth.findUser('collegue@cabinet-a.fr'), 'le compte existe encore');
  });

  await test('on ne retire pas le membre d\'un autre cabinet', async () => {
    const croise = await call('POST', '/api/cabinet/members/' + B.userId + '/remove', {
      cookie: A.cookie, body: {}
    });
    assert.strictEqual(croise.status, 404, 'un cabinet a pu toucher au compte d\'un autre');
    assert.ok(store.load().users.some((u) => u.id === B.userId), 'le compte a été supprimé');
  });

  console.log('\n== Mot de passe oublié ==');

  await test('la demande répond pareil pour une adresse inconnue', async () => {
    const known = await call('POST', '/api/auth/forgot', { body: { email: 'pro-b@cabinet-b.fr' } });
    const unknown = await call('POST', '/api/auth/forgot', { body: { email: 'personne@nulle-part.fr' } });
    assert.strictEqual(known.status, unknown.status);
    assert.strictEqual(known.body.ok, unknown.body.ok);
  });

  await test('le nouveau mot de passe remplace l\'ancien et ferme les sessions', async () => {
    const asked = await call('POST', '/api/auth/forgot', { body: { email: 'pro-b@cabinet-b.fr' } });
    const reset = await call('POST', '/api/auth/reset', {
      body: { userId: asked.body.userId, code: asked.body.devCode, password: 'NouveauSecret42' }
    });
    assert.strictEqual(reset.status, 200);

    const stale = await call('GET', '/api/calls', { cookie: B.cookie });
    assert.strictEqual(stale.status, 401, 'l\'ancienne session survit à la réinitialisation');

    H.resetRateLimits();
    const old = await call('POST', '/api/auth/login', {
      body: { email: 'pro-b@cabinet-b.fr', password: 'MotDePasse42!' }
    });
    assert.strictEqual(old.status, 401, 'l\'ancien mot de passe fonctionne encore');

    const fresh = await call('POST', '/api/auth/login', {
      body: { email: 'pro-b@cabinet-b.fr', password: 'NouveauSecret42' }
    });
    assert.strictEqual(fresh.status, 200);
  });

  console.log('\n== Robustesse ==');

  await test('un compte inexistant ne se distingue pas au chronomètre', async () => {
    H.resetRateLimits();
    const mesure = async (email) => {
      const debut = process.hrtime.bigint();
      await call('POST', '/api/auth/login', { body: { email, password: 'MauvaisMotDePasse42' } });
      return Number(process.hrtime.bigint() - debut) / 1e6;
    };

    /* Trois mesures chacune, on garde la médiane : une seule mesure sur une
       machine partagée ne veut rien dire. */
    const median = async (email) => {
      const runs = [];
      for (let i = 0; i < 3; i++) { H.resetRateLimits(); runs.push(await mesure(email)); }
      return runs.sort((a, b) => a - b)[1];
    };

    const connu = await median('pro-a@cabinet-a.fr');
    const inconnu = await median('personne@nulle-part.fr');
    const ecart = Math.abs(connu - inconnu) / Math.max(connu, inconnu);
    assert.ok(ecart < 0.5,
      'écart de ' + Math.round(ecart * 100) + ' % (' + connu.toFixed(1) + ' ms contre '
      + inconnu.toFixed(1) + ' ms) : le temps de réponse trahit les comptes existants');
    H.resetRateLimits();
  });

  await test('les demandes de mot de passe oublié sont plafonnées', async () => {
    H.resetRateLimits();
    let dernier = null;
    for (let i = 0; i < 7; i++) {
      dernier = await call('POST', '/api/auth/forgot', { body: { email: 'pro-a@cabinet-a.fr' } });
    }
    assert.strictEqual(dernier.status, 429, 'la route accepte un nombre illimité de demandes');
    H.resetRateLimits();
  });

  await test('les sessions expirées quittent le fichier', () => {
    const db = store.load();
    db.sessions.push({
      token: 'perime', userId: 'usr_x', cabinetId: 'cab_x', role: 'pro',
      createdAt: Date.now() - 86400000, expiresAt: Date.now() - 3600000
    });
    store.save();

    const avant = store.load().sessions.length;
    auth.openSession({ id: 'usr_y', cabinetId: 'cab_y', role: 'pro' });
    const apres = store.load().sessions;

    assert.ok(!apres.some((s) => s.token === 'perime'), 'une session périmée reste en base');
    assert.ok(apres.length <= avant, 'le fichier de sessions ne fait que grossir');
  });

  await test('le fichier de données n\'est lisible que par son propriétaire', () => {
    store.save();
    const mode = fs.statSync(store.FILE).mode & 0o777;
    assert.strictEqual(mode, 0o600, 'droits : ' + mode.toString(8));
    const dir = fs.statSync(store.DIR).mode & 0o777;
    assert.strictEqual(dir, 0o700, 'droits du dossier : ' + dir.toString(8));
  });

  await test('une ligne chiffrée illisible n\'emporte pas toute la liste', async () => {
    const db = store.load();
    const ligne = db.calls.find((c) => c.cabinetId === A.cabinetId);
    const sauvegarde = ligne.summary;
    ligne.summary = 'enc:v1:' + Buffer.from('nimportequoi').toString('base64');
    store.save();

    const res = await call('GET', '/api/calls', { cookie: A.cookie });
    assert.strictEqual(res.status, 200, 'la liste entière est tombée');
    const abime = res.body.calls.find((c) => c.summary && c.summary.includes('illisible'));
    assert.ok(abime, 'la ligne abîmée n\'est pas signalée');

    ligne.summary = sauvegarde;
    store.save();
  });

  await test('un cookie mal formé ne fait pas tomber la requête', async () => {
    /* decodeURIComponent lève sur un pourcentage isolé. Sans filet, toutes les
       requêtes du navigateur concerné répondaient 500 — y compris les pages. */
    const bancal = await call('GET', '/api/me', { cookie: 'ally_session=%E0%A4%A' });
    assert.strictEqual(bancal.status, 200);
    assert.strictEqual(bancal.body.authenticated, false);
  });

  await test('un chemin mal encodé répond 404, pas 500', async () => {
    const res = await fetch(base + '/%');
    assert.ok(res.status === 404 || res.status === 400, 'statut ' + res.status);
  });

  await test('la table des compteurs ne grossit pas sans fin', () => {
    H.resetRateLimits();
    /* Chaque adresse essayée créait une entrée que rien n'effaçait. */
    for (let i = 0; i < 60000; i++) {
      H.rateLimit('essai:' + i, { max: 5, windowMs: 1 });
    }
    assert.ok(H.rateLimitSize() <= 50000,
      'la table contient ' + H.rateLimitSize() + ' entrées');
    H.resetRateLimits();
  });

  await test('les pages portent une politique de contenu et un nonce', async () => {
    const res = await fetch(base + '/login.html');
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'aucune politique de contenu');
    assert.ok(/script-src 'self' 'nonce-/.test(csp), 'scripts non restreints : ' + csp);
    assert.ok(/frame-ancestors 'none'/.test(csp), 'la page peut être encadrée');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');

    const html = await res.text();
    const nonce = /nonce-([^']+)'/.exec(csp)[1];
    assert.ok(html.includes('nonce="' + nonce + '"'), 'le script injecté ne porte pas le nonce');

    /* Deux chargements, deux nonces : un nonce fixe ne vaut rien. */
    const encore = await fetch(base + '/login.html');
    const autre = /nonce-([^']+)'/.exec(encore.headers.get('content-security-policy'))[1];
    assert.notStrictEqual(nonce, autre, 'le nonce est constant');
  });

  await test('un JSON invalide ne fait pas tomber le serveur', async () => {
    const res = await call('POST', '/api/auth/login', { body: '{ ceci n est pas du json' });
    assert.strictEqual(res.status, 400);
  });

  await test('un corps démesuré est refusé', async () => {
    const res = await call('POST', '/api/auth/login', { body: 'x'.repeat(H.MAX_BODY + 1024) })
      .catch(() => ({ status: 413 }));
    assert.ok(res.status === 413 || res.status === 400, 'statut : ' + res.status);
  });

  await test('une route inconnue répond 404 sans détail', async () => {
    const res = await call('GET', '/api/nimporte-quoi');
    assert.strictEqual(res.status, 404);
    assert.ok(!JSON.stringify(res.body).includes('server/'), 'un chemin interne a fuité');
  });

  console.log('\n== Journal ==');

  await test('les événements sensibles sont tracés', () => {
    const actions = store.load().events.map((e) => e.action);
    for (const expected of ['signup', 'login', 'login-failed', 'password-reset', 'webhook-rejected']) {
      assert.ok(actions.includes(expected), 'événement absent du journal : ' + expected);
    }
  });

  /* ------------------------------------------------------------ Conclusion */
  server.close();
  try { fs.rmSync(store.DIR, { recursive: true, force: true }); } catch (e) {}

  console.log('\n================ RÉSULTAT ================');
  console.log((passed + failures.length) + ' contrôles');
  if (failures.length) {
    console.log(failures.length + ' problème(s) :');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('Aucun problème.');
})();
