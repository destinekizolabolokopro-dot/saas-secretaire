/* La console de la plateforme, sur un vrai serveur.

   C'est l'écran depuis lequel on fait tourner le service : voir qui s'est
   inscrit, ouvrir une ligne, ajuster une formule, couper l'accès d'un cabinet
   qui ne paie plus, confirmer une adresse dont l'email n'est jamais arrivé,
   et tout effacer quand on le demande par courrier.

   Il n'existait pas. La console lisait l'annuaire de démonstration du
   navigateur — seize cabinets fictifs — et ne montrait du serveur qu'une
   carte de chiffres en lecture seule, avec une boîte window.prompt pour
   attribuer un numéro. On ne pouvait rien faire de ce qui compte.

   Cette suite démarre un vrai serveur, inscrit un vrai cabinet, et conduit
   la console à la souris. Chaque geste est ensuite vérifié auprès de l'API,
   pas à l'écran.

       node tests/navigateur/console-reelle.js
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
const PORT = 8831, BASE = 'http://127.0.0.1:' + PORT;
const DATA = path.join(os.tmpdir(), 'ally-console-' + process.pid);
const ADMIN = { email: 'patron@ally.fr', password: 'MotDePasseTresLong2026' };

const bad = [];
let checks = 0;
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
           ALLY_ADMIN_EMAIL: ADMIN.email, ALLY_ADMIN_PASSWORD: ADMIN.password },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => bad.push('SERVEUR : ' + String(d).trim()));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serveur trop lent')), 8000);
    server.stdout.on('data', (d) => { if (String(d).includes('écoute')) { clearTimeout(t); res(); } });
  });

  /* Un vrai client, inscrit et confirmé comme n'importe qui. */
  const cab = await post('/api/auth/signup',
    { email: 'maitre@cabinet-reel.fr', password: 'MotDePasse42!', org: 'Cabinet Réel' });
  await post('/api/auth/verify', { userId: cab.body.userId, code: cab.body.devCode });
  const CABINET = cab.body.cabinetId;

  const nav = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));
  /* Une boîte du navigateur ici serait exactement ce qu'on vient de retirer. */
  p.on('dialog', (d) => {
    bad.push('DIALOGUE NATIF : ' + d.message());
    d.dismiss().catch(() => {});
  });

  const carte = () => p.locator('[data-platform]');
  const ligne = () => carte().locator('[data-cabinet="' + CABINET + '"]');
  const message = () => p.evaluate(() => {
    const e = document.querySelector('[data-platform] .alert-warn');
    return e ? e.textContent.trim() : '';
  });

  /* Ce que le serveur dit, interrogé directement depuis la page connectée. */
  const fiche = () => p.evaluate(async (id) => {
    const r = await fetch('/api/admin/cabinets/' + id, { credentials: 'same-origin' });
    return r.ok ? r.json() : null;
  }, CABINET);

  const ouvrirConsole = async () => {
    await p.goto(BASE + '/admin.html');
    await p.waitForSelector('[data-platform]', { timeout: 10000 });
    await p.waitForFunction(
      () => !document.querySelector('[data-platform] .empty'), null, { timeout: 10000 });
  };

  const ouvrirFiche = async () => {
    await ouvrirConsole();
    if (!await carte().locator('[data-poser]').count()) {
      await ligne().click();
      await p.waitForSelector('[data-platform] [data-poser]', { timeout: 10000 });
    }
  };

  await p.goto(BASE + '/login.html');
  await p.fill('#login-email', ADMIN.email);
  await p.fill('#login-password', ADMIN.password);
  await p.click('#login-form button[type="submit"]');
  await p.waitForURL(/admin|dashboard|onboarding/, { timeout: 8000 });

  console.log('\n== Ce que la console montre ==');

  await step('le cabinet réellement inscrit est listé', async () => {
    await ouvrirConsole();
    if (!await ligne().count()) throw new Error('le cabinet inscrit n\'apparaît pas');
    const texte = await ligne().innerText();
    if (!/Cabinet Réel/.test(texte)) throw new Error('ligne : ' + texte.replace(/\n/g, ' | '));
    if (!/Sans ligne/.test(texte)) throw new Error('un numéro est annoncé sans en avoir');
  });

  await step('sa fiche s\'ouvre, et montre ses membres', async () => {
    await ouvrirFiche();
    const texte = await carte().innerText();
    if (!/maitre@cabinet-reel\.fr/.test(texte)) throw new Error('le membre n\'est pas listé');
    if (!/Responsable/.test(texte)) throw new Error('son rôle n\'est pas dit');
  });

  /* La règle du produit : des volumes et des statuts, jamais le fond. Un
     administrateur capable de lire les dossiers d'un cabinet d'avocats est un
     risque, pas une fonction. */
  await step('et aucun contenu de dossier', async () => {
    const f = await fiche();
    if (!f) throw new Error('fiche illisible');
    const brut = JSON.stringify(f);
    if (/transcript|resume|summary|preview/i.test(brut)) {
      throw new Error('la fiche laisse filtrer du contenu');
    }
    if (f.cabinet.config !== undefined) throw new Error('la configuration chiffrée est renvoyée');
  });

  console.log('\n== Mettre un cabinet en service ==');

  await step('attribuer un numéro ne passe par aucune boîte du navigateur', async () => {
    await ouvrirFiche();
    await p.fill('#plat-numero', '09 72 55 44 33');
    await p.fill('#plat-operateur', 'OVH Telecom');
    await carte().locator('[data-poser]').click();
    await p.waitForTimeout(1200);

    const f = await fiche();
    if (!f.cabinet.line) throw new Error('aucune ligne posée');
    if (f.cabinet.line.numero !== '0972554433') {
      throw new Error('numéro enregistré : ' + f.cabinet.line.numero);
    }
    if (f.cabinet.line.operateur !== 'OVH Telecom') throw new Error('opérateur perdu');
  });

  await step('un numéro vide est nommé, pas ignoré', async () => {
    await ouvrirFiche();
    await p.fill('#plat-numero', '');
    await carte().locator('[data-poser]').click();
    await p.waitForTimeout(600);
    const dit = await message();
    if (!/numéro/i.test(dit)) throw new Error('message : « ' + dit + ' »');
  });

  await step('un numéro étranger est refusé par le serveur, et l\'écran le dit', async () => {
    await ouvrirFiche();
    await p.fill('#plat-numero', '+441632960000');
    await carte().locator('[data-poser]').click();
    await p.waitForTimeout(1200);
    const dit = await message();
    if (!/français/i.test(dit)) throw new Error('message : « ' + dit + ' »');

    const f = await fiche();
    if (f.cabinet.line.numero !== '0972554433') throw new Error('la ligne a bougé malgré le refus');
  });

  await step('changer sa formule ouvre ses places', async () => {
    await ouvrirFiche();
    await carte().locator('[data-formule="expert"]').click();
    await p.waitForTimeout(1200);
    const f = await fiche();
    if (f.cabinet.plan !== 'expert') throw new Error('formule : ' + f.cabinet.plan);
    if (f.places !== 5) throw new Error('places : ' + f.places);
  });

  console.log('\n== Couper, et rouvrir ==');

  await step('le premier clic ne suspend personne', async () => {
    await ouvrirFiche();
    const bouton = carte().locator('[data-suspendre]');
    await bouton.click();
    await p.waitForTimeout(400);
    if (!/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton n\'annonce pas ce que fera le clic suivant');
    }
    if ((await fiche()).cabinet.suspended) throw new Error('suspendu dès le premier clic');
  });

  await step('un bouton armé se désarme seul', async () => {
    await p.waitForTimeout(5400);
    const bouton = carte().locator('[data-suspendre]');
    if (/Confirmer/.test(await bouton.textContent())) throw new Error('le bouton est resté chargé');
    if ((await fiche()).cabinet.suspended) throw new Error('suspendu sans second clic');
  });

  await step('le second coupe l\'accès de tout le cabinet', async () => {
    await p.fill('#plat-motif', 'Impayé — relance du 3 octobre');
    const bouton = carte().locator('[data-suspendre]');
    await bouton.click();
    await p.waitForTimeout(400);
    await bouton.click();
    await p.waitForTimeout(1400);

    const f = await fiche();
    if (!f.cabinet.suspended) throw new Error('le cabinet travaille toujours');
    if (!/Impayé/.test(f.cabinet.suspended.motif || '')) {
      throw new Error('motif perdu : ' + f.cabinet.suspended.motif);
    }
  });

  await step('et le client ne peut plus se connecter', async () => {
    const r = await post('/api/auth/login',
      { email: 'maitre@cabinet-reel.fr', password: 'MotDePasse42!' });
    if (r.status !== 401) throw new Error('statut ' + r.status);
    if (!/suspendu/i.test(r.body.error || '')) throw new Error('message : ' + r.body.error);
  });

  await step('rouvrir le laisse revenir', async () => {
    await ouvrirFiche();
    await carte().locator('[data-rouvrir]').click();
    await p.waitForTimeout(1400);
    if ((await fiche()).cabinet.suspended) throw new Error('toujours suspendu');

    const r = await post('/api/auth/login',
      { email: 'maitre@cabinet-reel.fr', password: 'MotDePasse42!' });
    if (r.status !== 200) throw new Error('il reste dehors : statut ' + r.status);
  });

  console.log('\n== Débloquer une adresse, puis tout effacer ==');

  await step('une adresse jamais confirmée se confirme à la main', async () => {
    /* Le cas d'assistance le plus courant : l'email n'est pas arrivé. Sans
       cette porte, la seule issue était de recréer le compte — donc de perdre
       sa configuration. */
    await post('/api/auth/signup',
      { email: 'bloque@cabinet-bloque.fr', password: 'MotDePasse42!', org: 'Cabinet Bloqué' });

    await ouvrirConsole();
    await carte().locator('[data-cabinet]', { hasText: 'Cabinet Bloqué' }).click();
    await p.waitForSelector('[data-platform] [data-verifier]', { timeout: 10000 });

    const texte = await carte().innerText();
    if (!/Adresse non confirmée/.test(texte)) throw new Error('l\'état n\'est pas dit');

    await carte().locator('[data-verifier]').first().click();
    await p.waitForTimeout(1400);

    const r = await post('/api/auth/login',
      { email: 'bloque@cabinet-bloque.fr', password: 'MotDePasse42!' });
    if (r.status !== 200) throw new Error('le compte reste bloqué : statut ' + r.status);
  });

  await step('supprimer demande deux clics, puis emporte tout', async () => {
    await ouvrirFiche();
    const bouton = carte().locator('[data-effacer]');
    await bouton.click();
    await p.waitForTimeout(400);
    if (!/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton ne dit rien de la conséquence');
    }
    if (!await fiche()) throw new Error('supprimé dès le premier clic');

    await bouton.click();
    await p.waitForTimeout(1600);
    if (await fiche()) throw new Error('le cabinet est toujours là');

    const r = await post('/api/auth/login',
      { email: 'maitre@cabinet-reel.fr', password: 'MotDePasse42!' });
    if (r.status === 200) throw new Error('le compte supprimé se connecte encore');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await nav.close();
  server.kill();
  process.exit(bad.length ? 1 : 0);
})();
