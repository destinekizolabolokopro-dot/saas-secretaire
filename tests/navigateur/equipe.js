/* Le cabinet à plusieurs : inviter, retirer, et la formule qui autorise.

   La formule Expert promet cinq collaborateurs. Deux moitiés du produit en
   décidaient séparément : l'espace pro écrivait la formule dans le navigateur,
   le serveur en gardait une autre et comptait les places. Un cabinet passé à
   Expert lisait donc « 5 collaborateurs » sur sa facture et s'entendait
   répondre, au moment d'inviter quelqu'un : « Passez à Expert. » Les deux
   phrases venaient du même écran.

   Cette suite fait le chemin en entier, sur un vrai serveur : changer de
   formule, inviter, retirer.

       node tests/navigateur/equipe.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const { chromium } = require(CHEMIN_PW);
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path'); const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8823, BASE = 'http://127.0.0.1:' + PORT;
const DATA = path.join(os.tmpdir(), 'ally-equipe-' + process.pid);

const bad = []; let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};
const post = (route, payload) =>
  fetch(BASE + route, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ALLY_DATA_DIR: DATA,
           ALLY_SECRET_KEY: crypto.randomBytes(32).toString('hex'),
           ALLY_ADMIN_EMAIL: 'patron@ally.fr',
           ALLY_ADMIN_PASSWORD: 'MotDePasseTresLong2026' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => bad.push('SERVEUR : ' + String(d).trim()));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serveur trop lent')), 8000);
    server.stdout.on('data', (d) => { if (String(d).includes('écoute')) { clearTimeout(t); res(); } });
  });

  const cab = await post('/api/auth/signup',
    { email: 'pro@equipe.fr', password: 'MotDePasse42!', org: 'Cabinet Équipe' });
  await post('/api/auth/verify', { userId: cab.body.userId, code: cab.body.devCode });

  const nav = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));

  const carte = () => p.locator('[data-team]');
  const erreur = () => p.locator('[data-team-error]');
  const lignes = () => carte().locator('.live-list .row');

  const ouvrirAbonnement = async () => {
    await p.goto(BASE + '/dashboard.html');
    await p.waitForSelector('#tabpanel');
    await p.click('#profile-card');
    await p.waitForTimeout(500);
    await p.click('[data-account="plan"]');
    await p.waitForSelector('[data-team]', { timeout: 8000 });
    /* La carte se peint deux fois : une fois vide, une fois après la lecture
       du serveur. C'est la seconde qui compte. */
    await p.waitForFunction(
      () => !document.querySelector('[data-team] .empty'), null, { timeout: 8000 });
  };

  await p.goto(BASE + '/login.html');
  await p.fill('#login-email', 'pro@equipe.fr');
  await p.fill('#login-password', 'MotDePasse42!');
  await p.click('#login-form button[type="submit"]');
  await p.waitForURL(/dashboard|onboarding/, { timeout: 8000 });

  console.log('\n== Une formule à une place ==');

  await step('la carte annonce une seule place', async () => {
    await ouvrirAbonnement();
    const texte = await carte().innerText();
    if (!/1 \/ 1/.test(texte)) throw new Error('compteur : ' + texte.split('\n')[0]);
  });

  await step('et n\'offre pas d\'inviter', async () => {
    if (await carte().locator('#team-email').count()) {
      throw new Error('le champ d\'invitation est offert alors qu\'aucune place n\'est libre');
    }
    if (!/places de votre formule sont prises/.test(await carte().innerText())) {
      throw new Error('rien n\'explique pourquoi');
    }
  });

  console.log('\n== Passer à Expert ==');

  /* Le contrôle central : la formule choisie dans l'écran doit franchir le
     serveur, sinon les places restent à une et l'invitation sera refusée par
     une phrase qui contredit l'écran. */
  await step('changer de formule ouvre vraiment les places', async () => {
    await p.click('#plan-open');
    await p.waitForTimeout(300);
    await p.click('[data-plan="expert"]');
    await p.waitForTimeout(1200);

    const seats = await p.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      return (await r.json()).seats;
    });
    if (seats !== 5) throw new Error('le serveur compte encore ' + seats + ' place(s)');
  });

  await step('la carte suit', async () => {
    await ouvrirAbonnement();
    const texte = await carte().innerText();
    if (!/1 \/ 5/.test(texte)) throw new Error('compteur : ' + texte.split('\n')[0]);
    if (!await carte().locator('#team-email').count()) {
      throw new Error('toujours pas de champ d\'invitation');
    }
  });

  console.log('\n== Inviter ==');

  await step('un champ vide ne part pas en silence', async () => {
    await carte().locator('[data-team-invite]').click();
    await p.waitForTimeout(400);
    if (!await erreur().isVisible()) throw new Error('aucun message : le clic n\'a rien dit');
    if (await carte().locator('#team-email').getAttribute('aria-invalid') !== 'true') {
      throw new Error('le champ n\'est pas marqué en faute');
    }
  });

  await step('une adresse qui n\'en est pas une est nommée', async () => {
    await carte().locator('#team-email').fill('collegue-arobase-absent');
    await carte().locator('[data-team-invite]').click();
    await p.waitForTimeout(400);
    const dit = await erreur().textContent();
    if (!/collegue-arobase-absent/.test(dit)) throw new Error('message : « ' + dit + ' »');
  });

  await step('Entrée envoie, comme le bouton', async () => {
    await carte().locator('#team-email').fill('associe@equipe.fr');
    await carte().locator('#team-email').press('Enter');
    await p.waitForFunction(
      () => document.querySelector('[data-team] .code-sent'), null, { timeout: 8000 });
  });

  await step('le code d\'invitation s\'affiche pour être transmis', async () => {
    const code = (await carte().locator('.code-sent code').textContent()).trim();
    if (!/^\d{6}$/.test(code)) throw new Error('code affiché : « ' + code + ' »');
    if (!/associe@equipe\.fr/.test(await carte().locator('.code-sent').innerText())) {
      throw new Error('le bloc ne dit pas pour qui');
    }
  });

  await step('le collaborateur apparaît, en attente', async () => {
    await p.waitForFunction(
      () => /associe@equipe\.fr/.test(document.querySelector('[data-team]').textContent),
      null, { timeout: 8000 });
    const texte = await carte().innerText();
    if (!/En attente/.test(texte)) throw new Error('il est annoncé actif avant d\'avoir rejoint');
    if (!/2 \/ 5/.test(texte)) throw new Error('compteur : ' + texte.split('\n')[0]);
  });

  await step('inviter deux fois la même personne est refusé, et expliqué', async () => {
    await carte().locator('#team-email').fill('associe@equipe.fr');
    await carte().locator('[data-team-invite]').click();
    await p.waitForTimeout(500);
    const dit = await erreur().textContent();
    if (!/déjà/.test(dit)) throw new Error('message : « ' + dit + ' »');
    if (await lignes().count() !== 2) throw new Error('un doublon a été créé');
  });

  console.log('\n== Retirer ==');

  await step('le premier clic n\'enlève personne', async () => {
    const bouton = carte().locator('[data-team-remove]').first();
    await bouton.click();
    await p.waitForTimeout(400);
    if (!/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton n\'annonce pas ce que fera le clic suivant');
    }
    if (await lignes().count() !== 2) throw new Error('la personne a été retirée au premier clic');
  });

  await step('un bouton armé se désarme seul', async () => {
    await p.waitForTimeout(5400);
    const bouton = carte().locator('[data-team-remove]').first();
    if (/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton est resté chargé');
    }
  });

  await step('le second clic retire pour de bon', async () => {
    const bouton = carte().locator('[data-team-remove]').first();
    await bouton.click();
    await p.waitForTimeout(300);
    await bouton.click();
    await p.waitForTimeout(1500);
    const dit = await erreur().isVisible() ? await erreur().textContent() : '';
    if (dit) throw new Error('le retrait a été refusé : « ' + dit + ' »');
    await p.waitForFunction(
      () => !/associe@equipe\.fr/.test(document.querySelector('[data-team]').textContent),
      null, { timeout: 8000 });

    const reste = await p.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      return (await r.json()).members.length;
    });
    if (reste !== 1) throw new Error('le serveur compte encore ' + reste + ' membre(s)');
  });

  /* Le lien et le code d'une invitation retirée ne mènent plus nulle part :
     les laisser à l'écran, c'est inviter le responsable à les transmettre. */
  await step('le cartouche d\'invitation disparaît avec la personne', async () => {
    if (await carte().locator('.code-sent').isVisible().catch(() => false)) {
      throw new Error('le code d\'une invitation annulée est toujours proposé');
    }
  });

  console.log('\n== Redescendre de formule ==');

  await step('le serveur refuse, et l\'écran le dit au lieu de mentir', async () => {
    /* On réinvite pour être deux, puis on tente de repasser à une place. */
    await carte().locator('#team-email').fill('associe2@equipe.fr');
    await carte().locator('#team-email').press('Enter');
    await p.waitForFunction(
      () => /associe2@equipe\.fr/.test(document.querySelector('[data-team]').textContent),
      null, { timeout: 8000 });

    await p.click('#plan-open');
    await p.waitForTimeout(300);
    await p.click('[data-plan="cabinet"]');

    await p.waitForSelector('.flash', { timeout: 8000 });
    const toast = await p.locator('.flash').first().textContent();
    if (!/Retirez|refus/i.test(toast)) throw new Error('message affiché : « ' + toast + ' »');

    const seats = await p.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      return (await r.json()).seats;
    });
    if (seats !== 5) throw new Error('la formule a bougé malgré le refus');
  });

  console.log('\n== Rattacher un navigateur à la ligne ==');

  /* La carte « La ligne réelle » porte deux champs et un bouton, sans
     formulaire autour : Entrée ne faisait rien, un champ vide partait quand
     même au serveur — qui répondait « adresse ou mot de passe incorrect »
     pour un champ simplement oublié — et deux clics enchaînés envoyaient deux
     tentatives, dont la seconde comptait dans la limite du serveur. */
  const vierge = await nav.newContext({ viewport: { width: 1440, height: 1100 } });
  const q = await vierge.newPage();
  q.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));

  const messageLive = () => q.evaluate(() => {
    const e = document.querySelector('[data-live-error]');
    return e && !e.hidden ? e.textContent.trim() : '';
  });

  await q.goto(BASE + '/dashboard.html');
  await q.waitForSelector('#tabpanel');
  await q.click('[data-tab="telephony"]');
  await q.waitForSelector('[data-live-login]', { timeout: 8000 });

  await step('un champ vide est nommé, sans passer par le serveur', async () => {
    await q.click('[data-live-login]');
    await q.waitForTimeout(400);
    const dit = await messageLive();
    if (!/adresse/i.test(dit)) throw new Error('message : « ' + dit + ' »');

    await q.fill('#live-email', 'pro@equipe.fr');
    await q.click('[data-live-login]');
    await q.waitForTimeout(400);
    if (!/mot de passe/i.test(await messageLive())) {
      throw new Error('message : « ' + await messageLive() + ' »');
    }
  });

  await step('un mauvais mot de passe est refusé, et le dit', async () => {
    await q.fill('#live-pass', 'PasLeBonMotDePasse42!');
    await q.click('[data-live-login]');
    await q.waitForFunction(() => {
      const e = document.querySelector('[data-live-error]');
      return e && !e.hidden && /incorrect|refus/i.test(e.textContent);
    }, null, { timeout: 8000 });

    if (await q.locator('[data-live-login]').isDisabled()) {
      throw new Error('le bouton reste bloqué après un refus');
    }
  });

  await step('Entrée connecte, comme le bouton', async () => {
    await q.fill('#live-pass', 'MotDePasse42!');
    await q.press('#live-pass', 'Enter');
    await q.waitForFunction(
      () => /connectée/.test(document.querySelector('[data-live]').textContent),
      null, { timeout: 10000 });
  });

  await vierge.close();

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await nav.close();
  server.kill();
  process.exit(bad.length ? 1 : 0);
})();
