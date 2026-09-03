/* La mise en service de la ligne : ce qui se passe vraiment quand on pose un
   renvoi d'appel.

   L'étape la plus importante du produit — sans renvoi, la ligne ne sonne
   jamais — et la plus facile à faire semblant de réussir : il suffit de cocher
   une case quand quelqu'un copie un code.

   Demande un serveur statique pour la partie « sans API » :

       python3 -m http.server 8123
       node tests/navigateur/ligne.js
*/
const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STATIQUE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path'); const os = require('node:os'); const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8821, BASE = 'http://127.0.0.1:' + PORT, SECRET = 'secret-ligne';
const DATA = path.join(os.tmpdir(), 'ally-ligne-' + process.pid);
const ADMIN = { email: 'patron@ally.fr', password: 'MotDePasseTresLong2026' };

const bad = []; let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};
const post = (route, payload, signIt) => {
  const raw = JSON.stringify(payload);
  const h = { 'content-type': 'application/json' };
  if (signIt) {
    const ts = Math.floor(Date.now() / 1000);
    h['x-retell-signature'] = 't=' + ts + ',v1=' +
      crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
  }
  return fetch(BASE + route, { method: 'POST', headers: h, body: raw })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};

(async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ALLY_DATA_DIR: DATA,
           RETELL_WEBHOOK_SECRET: SECRET,
           ALLY_SECRET_KEY: crypto.randomBytes(32).toString('hex'),
           ALLY_ADMIN_EMAIL: ADMIN.email, ALLY_ADMIN_PASSWORD: ADMIN.password },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => bad.push('SERVEUR : ' + String(d).trim()));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serveur trop lent')), 8000);
    server.stdout.on('data', (d) => { if (String(d).includes('écoute')) { clearTimeout(t); res(); } });
  });

  const nav = await chromium.launch({ executablePath: CHROMIUM });
  const mk = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|net::ERR|status of (400|401|403|404|409)/.test(m.text())) {
        bad.push('CONSOLE : ' + m.text());
      }
    });
    return { ctx, page };
  };
  const login = async (page, email, pass) => {
    await page.goto(BASE + '/login.html');
    await page.fill('#login-email', email);
    await page.fill('#login-password', pass);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL(/dashboard|onboarding|admin/, { timeout: 8000 });
  };
  const ouvrirTelephonie = async (page) => {
    await page.goto(BASE + '/dashboard.html');
    await page.waitForSelector('#tabpanel');
    await page.click('[data-tab="telephony"]');
    await page.waitForTimeout(1200);
  };

  const cab = await post('/api/auth/signup',
    { email: 'pro@ligne.fr', password: 'MotDePasse42!', org: 'Cabinet Ligne' });
  await post('/api/auth/verify', { userId: cab.body.userId, code: cab.body.devCode });

  console.log('\n== Sans numéro attribué ==');

  const A = await mk();

  await step('aucun code n\'est proposé tant qu\'il n\'y a pas de ligne', async () => {
    await login(A.page, 'pro@ligne.fr', 'MotDePasse42!');
    await ouvrirTelephonie(A.page);

    const texte = await A.page.textContent('#tabpanel');
    if (!/Aucun numéro n'est encore attribué/.test(texte)) {
      throw new Error('texte : ' + texte.slice(0, 200));
    }
    if (/\*\*61\*/.test(texte)) throw new Error('un code de renvoi est affiché sans numéro');
    if (/XX XX/.test(texte)) throw new Error('un numéro d\'exemple est affiché');
  });

  console.log('\n== L\'administrateur ouvre la ligne ==');

  await step('le numéro attribué arrive chez le professionnel', async () => {
    const admin = await mk();
    await login(admin.page, ADMIN.email, ADMIN.password);
    await admin.page.waitForSelector('[data-platform]', { timeout: 8000 });

    const pose = await admin.page.evaluate(async (id) => {
      const res = await fetch('/api/admin/cabinets/' + id + '/line', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ numero: '09 72 12 34 56', operateur: 'OVH Telecom' })
      });
      return res.status;
    }, cab.body.cabinetId);
    if (pose !== 200) throw new Error('statut ' + pose);
    await admin.ctx.close();

    await ouvrirTelephonie(A.page);
    await A.page.waitForFunction(
      () => /09 72 12 34 56/.test(document.getElementById('tabpanel').textContent),
      null, { timeout: 10000 }
    );
  });

  await step('les trois codes portent le vrai numéro', async () => {
    const texte = await A.page.textContent('#tabpanel');
    ['**61*0972123456*11*20#', '**67*0972123456#', '**62*0972123456#'].forEach((code) => {
      if (!texte.includes(code)) throw new Error('code absent : ' + code);
    });
    if (/XX/.test(texte)) throw new Error('un numéro d\'exemple subsiste');
  });

  await step('chaque code se compose d\'un doigt', async () => {
    const liens = await A.page.$$eval('.serve-actions a', (as) => as.map((a) => a.getAttribute('href')));
    if (liens.length !== 3) throw new Error(liens.length + ' lien(s) de composition');
    liens.forEach((href) => {
      if (!/^tel:/.test(href)) throw new Error('lien : ' + href);
      /* Le dièse doit être encodé, sinon le navigateur le prend pour une ancre
         et le code part tronqué. */
      if (/#/.test(href)) throw new Error('dièse non encodé : ' + href);
      if (!/%23$/.test(href)) throw new Error('code incomplet : ' + href);
    });
  });

  console.log('\n== Ce qui prouve que le renvoi est posé ==');

  await step('copier un code ne coche pas l\'étape', async () => {
    await A.page.click('[data-copy]');
    await A.page.waitForTimeout(600);
    const coche = await A.page.evaluate(() => window.ALLY_STORE.state.steps.forward);
    if (coche) throw new Error('copier a suffi à déclarer la ligne branchée');
  });

  await step('un appel réellement reçu coche l\'étape', async () => {
    const recu = await post('/api/webhooks/retell', {
      cabinetId: cab.body.cabinetId, from: '06 11 22 33 44', at: Date.now(),
      outcome: 'handled', summary: 'Appel test depuis un autre téléphone'
    }, true);
    if (recu.status !== 201) throw new Error('webhook refusé : ' + recu.status);

    await A.page.waitForFunction(
      () => window.ALLY_STORE.state.steps.forward === true, null, { timeout: 25000 });

    await ouvrirTelephonie(A.page);
    const texte = await A.page.textContent('#tabpanel');
    if (!/Le renvoi fonctionne/.test(texte)) throw new Error('la preuve n\'est pas affichée');
  });

  console.log('\n== Sans serveur ==');

  await step('le fichier autonome n\'invente pas de numéro', async () => {
    const solo = await mk();
    await solo.page.goto(STATIQUE + '/dashboard.html');
    await solo.page.waitForSelector('#tabpanel');
    await solo.page.click('[data-tab="telephony"]');
    await solo.page.waitForTimeout(800);
    const texte = await solo.page.textContent('#tabpanel');
    if (/XX XX/.test(texte)) throw new Error('un numéro d\'exemple est affiché');
    if (!/Aucun numéro n'est encore attribué/.test(texte)) {
      throw new Error('texte : ' + texte.slice(0, 200));
    }
    await solo.ctx.close();
  });

  await nav.close();
  server.kill();
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  if (bad.length) {
    console.log(bad.length + ' problème(s) :');
    bad.forEach((e) => console.log(' - ' + e));
    process.exit(1);
  }
  console.log('Aucun problème.');
})();
