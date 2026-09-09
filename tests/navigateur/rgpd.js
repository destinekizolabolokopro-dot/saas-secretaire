/* Le droit d'accès et le droit à l'effacement, côté navigateur.

   Le serveur a déjà les siens dans server/test.js : l'export est en clair
   pour le responsable et pour lui seul, il ne contient aucune empreinte de
   mot de passe, il est cloisonné par cabinet, et la suppression exige le mot
   de passe. Ce fichier-ci couvre l'autre moitié — celle qui tourne quand
   aucun serveur ne répond, et qui promet exactement la même chose à l'écran.

   C'est là qu'était le défaut : « Supprimer toutes mes données » vidait les
   données de travail et laissait le compte dans l'annuaire du navigateur,
   avec son adresse et son mot de passe haché. L'identité revenait même au
   rechargement, puisque c'est l'annuaire qui en fait autorité. Le droit à
   l'effacement porte sur le compte, pas seulement sur son contenu.

       python3 -m http.server 8123
       node tests/navigateur/rgpd.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);
const fs = require('node:fs');

const bad = [];
let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await navigateur.newContext({
    viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));
  p.on('dialog', (d) => d.accept().catch(() => {}));

  const MAIL = 'effacement@cabinet-berger.fr';

  /* Un compte réel, avec une donnée reconnaissable dedans. Le compte de
     démonstration anonyme ne conviendrait pas : il n'a rien à supprimer et
     repart de toute façon sur son jeu d'exemple. */
  await p.goto(BASE + '/abonnement.html');
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/abonnement.html');
  await p.waitForTimeout(700);
  await p.locator('.plan.is-popular .btn').click();
  await p.waitForTimeout(500);
  await p.fill('#sub-first', 'Camille');
  await p.fill('#sub-last', 'Berger');
  await p.fill('#sub-email', MAIL);
  await p.fill('#sub-pass', 'MotDePasseTresLong2026');
  await p.check('#sub-cgv');
  await p.click('#sub-submit');
  await p.waitForTimeout(1100);
  const code = await p.evaluate(() => document.querySelector('.code-sent code').textContent.trim());
  const cases = await p.locator('.code-box').count();
  for (let i = 0; i < cases; i++) await p.locator('.code-box').nth(i).fill(code[i]);
  await p.click('#ver-submit');
  await p.waitForTimeout(1400);
  for (let i = 1; i <= 12 && /onboarding/.test(p.url()); i++) {
    if (i === 2) await p.fill('#org', 'Cabinet Berger');
    await p.locator('.ob-nav .btn-primary').click();
    await p.waitForTimeout(650);
  }
  await p.waitForTimeout(1200);

  await p.locator('.nav-item').nth(2).click();
  await p.waitForTimeout(700);
  await p.fill('#cal-client', 'M. Preuve');
  await p.click('#cal-add button[type=submit]');
  await p.waitForTimeout(700);

  await p.locator('.profile-card').click();
  await p.waitForTimeout(600);
  await p.locator('[data-account="privacy"]').click();
  await p.waitForTimeout(700);

  console.log('\n== Le droit d\'accès ==');

  let contenu = null;

  await step('l\'export télécharge un fichier lisible', async () => {
    const [dl] = await Promise.all([
      p.waitForEvent('download', { timeout: 8000 }),
      p.locator('#export-data').click()
    ]);
    contenu = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    if (!contenu || typeof contenu !== 'object') throw new Error('fichier illisible');
  });

  await step('il contient tout ce qui décrit le compte', async () => {
    const attendus = ['exporte_le', 'identite', 'metier', 'horaires',
                      'regles', 'autonomie', 'script', 'donnees'];
    const manquants = attendus.filter((k) => contenu[k] === undefined);
    if (manquants.length) throw new Error('absents de l\'export : ' + manquants.join(', '));
    if (!Array.isArray(contenu.donnees.rdv)) throw new Error('les rendez-vous manquent');
  });

  await step('il contient les données réellement saisies', async () => {
    /* Un export qui ne contiendrait que les valeurs par défaut serait un
       droit d'accès mal rendu, et rien à l'écran ne le dirait. */
    if (!JSON.stringify(contenu).includes('M. Preuve')) {
      throw new Error('le rendez-vous posé juste avant n\'y est pas');
    }
    if (contenu.identite.lastName !== 'Berger') {
      throw new Error('identité absente ou fausse : ' + JSON.stringify(contenu.identite));
    }
  });

  await step('il ne contient aucune empreinte de mot de passe', async () => {
    const brut = JSON.stringify(contenu);
    if (/"pass"|passwordHash|motDePasse/i.test(brut)) {
      throw new Error('un champ de mot de passe part dans l\'export');
    }
  });

  await step('il porte sa date', async () => {
    if (isNaN(Date.parse(contenu.exporte_le))) {
      throw new Error('date absente ou invalide : ' + contenu.exporte_le);
    }
  });

  console.log('\n== Le droit à l\'effacement ==');

  await step('un seul clic ne supprime rien', async () => {
    const avant = await p.evaluate(() => window.ALLY_STORE.data().rdv.length);
    await p.locator('#wipe-data').click();
    await p.waitForTimeout(400);
    const apres = await p.evaluate(() => window.ALLY_STORE.data().rdv.length);
    if (apres !== avant) throw new Error('supprimé dès le premier clic');
    const texte = await p.locator('#wipe-data').innerText();
    if (!/confirmer/i.test(texte)) throw new Error('le bouton ne demande pas confirmation : ' + texte);
  });

  await step('le bouton dit que le compte y passe aussi', async () => {
    const texte = await p.locator('#wipe-data').innerText();
    if (!/compte/i.test(texte)) {
      throw new Error('la confirmation ne mentionne pas le compte : ' + texte);
    }
  });

  await step('l\'armement retombe tout seul', async () => {
    await p.waitForTimeout(5600);
    const texte = await p.locator('#wipe-data').innerText();
    if (/confirmer/i.test(texte)) throw new Error('reste armé au-delà du délai');
  });

  await step('confirmer efface le compte, pas seulement ses données', async () => {
    await p.locator('#wipe-data').click();
    await p.waitForTimeout(300);
    await p.locator('#wipe-data').click();
    await p.waitForTimeout(2400);

    const reste = await p.evaluate((mail) => ({
      compte: window.ALLY_ACCOUNTS.all().some((u) => u.email === mail),
      session: !!window.ALLY_ACCOUNTS.currentId(),
      cles: Object.keys(localStorage).filter((k) => /^ally\.account\.v1:/.test(k))
    }), MAIL);

    if (reste.compte) throw new Error('le compte est toujours dans l\'annuaire');
    if (reste.session) throw new Error('la session reste ouverte après suppression');
    if (reste.cles.length) {
      throw new Error('clés de stockage nominatives restantes : ' + reste.cles.join(', '));
    }
  });

  await step('et l\'on ne peut plus s\'y reconnecter', async () => {
    const refus = await p.evaluate((mail) =>
      window.ALLY_ACCOUNTS.login(mail, 'MotDePasseTresLong2026'), MAIL);
    if (refus && refus.ok) throw new Error('la connexion au compte supprimé fonctionne encore');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
