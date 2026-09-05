/* Quand le serveur devient injoignable en cours de session.

   La configuration du cabinet — horaires, script d'accueil, règles d'urgence —
   appartient au cabinet et non à l'appareil : c'est tout l'objet de
   js/configsync.js. Encore faut-il qu'elle y arrive.

   Un envoi qui échouait ne repartait jamais. Une coupure de trois secondes
   suffisait à ce que le réglage reste dans le seul navigateur qui l'avait
   saisi — exactement ce que ce module existe pour empêcher — et rien ne le
   disait. Le professionnel retrouvait son ancienne configuration sur son
   téléphone, sans jamais comprendre pourquoi.

       node tests/navigateur/coupure.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const { chromium } = require(CHEMIN_PW);
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8823;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA = path.join(os.tmpdir(), 'ally-coupure-' + process.pid);

const bad = [];
let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};

(async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ALLY_DATA_DIR: DATA,
           ALLY_SECRET_KEY: crypto.randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => bad.push('SERVEUR : ' + String(d).trim()));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serveur trop lent')), 8000);
    server.stdout.on('data', (d) => { if (String(d).includes('écoute')) { clearTimeout(t); res(); } });
  });

  const nav = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) {
      bad.push('CONSOLE : ' + m.text());
    }
  });

  /* Un vrai compte, jusqu'au tableau de bord. */
  const mail = 'coupure' + Date.now() + '@cabinet.fr';
  await page.goto(BASE + '/abonnement.html');
  await page.waitForTimeout(700);
  await page.locator('.plan.is-popular .btn').click();
  await page.waitForTimeout(500);
  await page.fill('#sub-first', 'Paul');
  await page.fill('#sub-last', 'Rivard');
  await page.fill('#sub-email', mail);
  await page.fill('#sub-pass', 'MotDePasseTresLong2026');
  await page.check('#sub-cgv');
  await page.click('#sub-submit');
  await page.waitForTimeout(1200);

  const code = await page.evaluate(() => {
    const c = document.querySelector('.code-sent code');
    return c ? c.textContent.trim() : null;
  });
  const cases = await page.locator('.code-box').count();
  for (let i = 0; i < cases; i++) await page.locator('.code-box').nth(i).fill(code[i]);
  await page.click('#ver-submit');
  await page.waitForTimeout(1500);

  for (let i = 1; i <= 12 && /onboarding/.test(page.url()); i++) {
    if (i === 2) await page.fill('#org', 'Cabinet Rivard');
    await page.locator('.ob-nav .btn-primary').click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);

  console.log('\n== Le serveur répond ==');

  await step('aucun avertissement quand tout va bien', async () => {
    if (await page.locator('.alert-warn').count()) {
      throw new Error('bannière affichée : ' + await page.locator('.alert-warn').innerText());
    }
  });

  console.log('\n== Le serveur devient injoignable ==');

  let coupe = true;
  await page.route('**/api/**', (r) => (coupe ? r.abort('connectionrefused') : r.continue()));

  /* On modifie un réglage depuis Mon compte — c'est là qu'on les modifie. */
  await page.locator('.profile-card').click();
  await page.waitForTimeout(700);
  await page.locator('.switch-row .toggle').first().click();

  await step('le premier échec ne déclenche rien', async () => {
    /* Le temps d'une reprise, la plupart des coupures sont déjà finies. Crier
       au loup au premier essai apprendrait à ignorer le message. */
    await page.waitForTimeout(1200);
    if (await page.locator('.alert-warn').count()) {
      throw new Error('averti dès le premier échec');
    }
  });

  await step('après les reprises, le retard est annoncé', async () => {
    await page.waitForTimeout(9000);
    if (!await page.locator('.alert-warn').count()) {
      throw new Error('rien après dix secondes : la perte serait silencieuse');
    }
    const texte = await page.locator('.alert-warn').innerText();
    if (!/cabinet|téléphone|collaborateur/i.test(texte)) {
      throw new Error('la conséquence n\'est pas dite : ' + texte);
    }
  });

  await step('l\'avertissement est visible depuis n\'importe quel onglet', async () => {
    /* Il vivait dans la vue « Aujourd'hui » : invisible depuis l'écran où l'on
       modifie justement ses réglages. */
    for (const i of [0, 1, 2]) {
      await page.locator('.nav-item').nth(i).click();
      await page.waitForTimeout(500);
      if (!await page.locator('.alert-warn').count()) {
        throw new Error('absent de l\'onglet ' + (await page.locator('#tab-title').innerText()));
      }
    }
  });

  console.log('\n== La connexion revient ==');

  await step('l\'avertissement disparaît sans rechargement', async () => {
    coupe = false;
    await page.waitForTimeout(14000);
    if (await page.locator('.alert-warn').count()) {
      throw new Error('toujours affiché alors que la synchronisation a repris');
    }
  });

  await step('le réglage a bien atteint le serveur', async () => {
    /* La preuve qui compte : ce n'est pas l'écran qu'on interroge, c'est
       l'API — celle que verrait le téléphone du professionnel. */
    const vu = await page.evaluate(async () => {
      const r = await fetch('/api/cabinet/config', { credentials: 'same-origin' });
      const b = await r.json();
      return b && b.config ? JSON.stringify(b.config).length : 0;
    });
    if (!vu) throw new Error('le serveur ne détient aucune configuration');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await nav.close();
  server.kill();
  process.exit(bad.length ? 1 : 0);
})();
