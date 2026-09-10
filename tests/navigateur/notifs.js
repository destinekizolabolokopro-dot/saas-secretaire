/* La cloche : ce qu'elle promet, et ce qu'elle sait vraiment.

   Un indicateur de notifications a un seul devoir : ne jamais dire « rien »
   quand il y a quelque chose. La pastille ne regardait que les appels urgents
   alors que le panneau, lui, liste aussi les brouillons à valider et les
   rappels à programmer. Quatre emails en attente de signature, aucun appel
   urgent : l'en-tête affirmait qu'il n'y avait rien à faire.

   On vérifie donc les deux sens — que la pastille compte, et qu'elle se tait
   quand il n'y a réellement rien — puis ce qui n'existait pas du tout : la
   fermeture au clavier.

       python3 -m http.server 8123
       node tests/navigateur/notifs.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);

const bad = [];
let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await navigateur.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));

  const cloche = () => p.locator('#notif-btn');
  const panneau = () => p.locator('#notif-panel');
  const pastille = () => p.locator('#notif-badge');
  const ouvrir = async () => { await cloche().click(); await p.waitForTimeout(250); };

  /* Réécrit les données du compte puis recharge, pour poser une situation
     précise. La pastille se lit après le rendu de l'en-tête. */
  const poser = async (recette) => {
    await p.evaluate((r) => {
      const d = window.ALLY_STORE.data();
      if (r.calls !== undefined) d.calls = d.calls.filter((c) => r.calls.includes(c.kind));
      if (r.drafts !== undefined) d.drafts = d.drafts.slice(0, r.drafts);
      window.ALLY_STORE.save();
    }, recette);
    await p.reload();
    await p.waitForTimeout(1200);
  };

  await p.goto(BASE + '/dashboard.html');
  await p.waitForTimeout(1200);

  console.log('\n== La pastille dit ce que le panneau contient ==');

  await step('elle porte un nombre, pas un point muet', async () => {
    const texte = (await pastille().textContent()).trim();
    if (!/^\d+\+?$/.test(texte)) throw new Error('pastille : « ' + texte +' »');
  });

  await step('ce nombre est celui des lignes du panneau', async () => {
    const annonce = Number((await pastille().textContent()).trim());
    await ouvrir();
    const lignes = await panneau().locator('[data-notif]').count();
    if (lignes !== annonce) throw new Error(annonce + ' annoncé(s), ' + lignes + ' ligne(s) listée(s)');
    await p.keyboard.press('Escape');
  });

  await step('chaque ligne dit où elle mène', async () => {
    await ouvrir();
    const n = await panneau().locator('[data-notif]').count();
    const flechees = await panneau().locator('.notif-go').count();
    if (flechees !== n) throw new Error(n + ' ligne(s), ' + flechees + ' destination(s) affichée(s)');
    await p.keyboard.press('Escape');
  });

  await step('le nom accessible de la cloche porte le compte', async () => {
    const nom = await cloche().getAttribute('aria-label');
    const n = Number((await pastille().textContent()).trim());
    if (!nom.includes(String(n))) throw new Error('« ' + nom + ' » ne dit pas ' + n);
  });

  /* Le contrôle qui compte : c'est exactement la situation où la cloche
     mentait. Sans appel urgent, elle s'éteignait alors que des brouillons
     attendaient toujours une signature. */
  console.log('\n== Sans appel urgent, mais avec du travail en attente ==');

  await poser({ calls: ['pending'], drafts: 3 });

  await step('des brouillons à valider suffisent à allumer la cloche', async () => {
    if (await pastille().isHidden()) {
      throw new Error('éteinte alors que des brouillons attendent : la cloche ment');
    }
  });

  await step('et le panneau les liste bien', async () => {
    await ouvrir();
    const texte = await panneau().innerText();
    if (!/brouillon/i.test(texte)) throw new Error('panneau : « ' + texte.replace(/\n/g, ' | ') + ' »');
    await p.keyboard.press('Escape');
  });

  console.log('\n== Quand il n\'y a vraiment rien ==');

  await poser({ calls: [], drafts: 0 });

  await step('la pastille se tait', async () => {
    if (await pastille().isVisible()) throw new Error('elle signale un travail qui n\'existe pas');
  });

  await step('et le nom accessible le dit', async () => {
    const nom = await cloche().getAttribute('aria-label');
    if (!/rien/i.test(nom)) throw new Error('« ' + nom + ' »');
  });

  await step('le panneau explique au lieu de rester vide', async () => {
    await ouvrir();
    if (!await panneau().locator('.notif-empty').isVisible()) {
      throw new Error('aucun message d\'état vide');
    }
    await p.keyboard.press('Escape');
  });

  console.log('\n== Ce qui s\'ouvre doit pouvoir se fermer ==');

  await p.goto(BASE + '/dashboard.html');
  await p.evaluate(() => window.localStorage.clear());
  await p.reload();
  await p.waitForTimeout(1400);

  await step('la cloche annonce son état', async () => {
    if (await cloche().getAttribute('aria-expanded') !== 'false') {
      throw new Error('fermée, elle ne dit pas qu\'elle est fermée');
    }
    await ouvrir();
    if (await cloche().getAttribute('aria-expanded') !== 'true') {
      throw new Error('ouverte, aria-expanded reste à false');
    }
  });

  await step('Échap referme', async () => {
    if (await panneau().isHidden()) { await ouvrir(); }
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    if (await panneau().isVisible()) throw new Error('le panneau survit à Échap');
  });

  await step('et rend le focus à la cloche', async () => {
    await ouvrir();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const id = await p.evaluate(() => document.activeElement && document.activeElement.id);
    if (id !== 'notif-btn') throw new Error('focus reparti sur « ' + id + ' »');
  });

  await step('sortir au clavier referme derrière soi', async () => {
    await ouvrir();
    await p.evaluate(() => {
      const ailleurs = document.getElementById('dash-search') || document.querySelector('.nav-item');
      ailleurs.focus();
    });
    await p.waitForTimeout(250);
    if (await panneau().isVisible()) throw new Error('laissé ouvert alors que le focus est parti');
  });

  await step('un clic ailleurs referme aussi', async () => {
    await ouvrir();
    await p.locator('main').click({ position: { x: 5, y: 5 } });
    await p.waitForTimeout(250);
    if (await panneau().isVisible()) throw new Error('le clic dehors ne ferme plus');
  });

  console.log('\n== Cliquer sur une ligne mène quelque part ==');

  /* Suivre une notification doit poser les deux choses qu'elle annonce :
     l'onglet, et le filtre. Arriver sur « Conversations » toutes catégories
     confondues quand la ligne disait « brouillons à valider » oblige à
     rechercher à la main ce qu'on venait de cliquer. */
  await step('« brouillons à valider » ouvre les brouillons à valider', async () => {
    await ouvrir();
    const ligne = panneau().locator('[data-notif]', { hasText: 'brouillon' }).first();
    if (!await ligne.count()) throw new Error('aucune ligne « brouillon » dans le panneau');
    await ligne.click();
    await p.waitForTimeout(800);

    if (await panneau().isVisible()) throw new Error('le panneau reste ouvert après le clic');

    const onglet = await p.evaluate(() => {
      const n = document.querySelector('.nav-item[aria-current="page"]');
      return n ? n.getAttribute('data-tab') : null;
    });
    if (onglet !== 'conversations') throw new Error('arrivé sur « ' + onglet + ' »');

    const filtre = await p.evaluate(() => {
      const c = document.querySelector('.choice[aria-pressed="true"][data-filter]');
      return c ? c.getAttribute('data-filter') : null;
    });
    if (filtre !== 'validate') throw new Error('filtre posé : « ' + filtre + ' »');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
