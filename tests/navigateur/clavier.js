/* Ally au clavier : peut-on s'en servir sans souris ?

   Ce que ce fichier vérifie ne se voit pas à l'écran et ne se teste pas à la
   main sans y passer un quart d'heure : le focus. Une fenêtre modale qui ne
   le retient pas n'est modale que pour la souris — quelques tabulations
   suffisent à en sortir sans l'avoir fermée, et l'on se retrouve à parcourir
   une page qu'un voile recouvre, sans voir où l'on est.

   Les trois fenêtres d'Ally avaient ce défaut. La palette y échappait par
   hasard : elle contenait juste assez d'éléments pour que douze tabulations
   n'en fassent pas le tour.

       python3 -m http.server 8123
       node tests/navigateur/clavier.js
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

/* Le nom de ce qui a le focus, pour que l'échec dise où l'on a atterri. */
const actif = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'aucun';
  return a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') +
    (typeof a.className === 'string' && a.className.trim()
      ? '.' + a.className.trim().split(/\s+/)[0] : '');
});

const dans = (p, sel) => p.evaluate((s) => {
  const h = document.querySelector(s);
  return !!(h && document.activeElement && h.contains(document.activeElement));
}, sel);

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await navigateur.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  console.log('\n== Le lien d\'évitement ==');
  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(700);

  await step('la première tabulation l\'atteint', async () => {
    await p.keyboard.press('Tab');
    const a = await actif(p);
    if (!/skip/.test(a)) throw new Error('focus sur ' + a);
  });

  await step('il devient visible', async () => {
    /* Il glisse depuis le haut en 200 ms : mesuré tout de suite, il est
       encore hors écran, et le test accuse le produit d'un défaut qui est le
       sien. */
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const b = document.querySelector('.skip-link').getBoundingClientRect();
      return { top: b.top, left: b.left, w: b.width, h: b.height };
    });
    if (!(r.top >= 0 && r.left >= 0 && r.w > 0 && r.h > 0)) {
      throw new Error('reste hors écran : ' + JSON.stringify(r));
    }
  });

  console.log('\n== La palette de commandes ==');
  await p.goto(BASE + '/dashboard.html');
  await p.waitForTimeout(900);

  await step('elle prend le focus à l\'ouverture', async () => {
    await p.keyboard.press('Control+k');
    await p.waitForTimeout(500);
    if (!await dans(p, '.palette')) throw new Error('focus sur ' + await actif(p));
  });

  await step('le focus n\'en sort pas à la tabulation', async () => {
    for (let i = 0; i < 14; i++) {
      await p.keyboard.press('Tab');
      if (!await dans(p, '.palette-overlay')) {
        throw new Error('sorti après ' + (i + 1) + ' tabulations, sur ' + await actif(p));
      }
    }
  });

  await step('Échap la ferme sans perdre le focus', async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    if (await p.evaluate(() => !document.getElementById('palette-overlay').hidden)) {
      throw new Error('toujours ouverte');
    }
    /* Ouverte au clavier depuis nulle part, elle n'a rien à qui rendre le
       focus : il doit alors aller au contenu principal, et non retomber sur
       le document — sans quoi la tabulation suivante repart du premier lien
       de la page, et l'on a perdu sa place sans être prévenu. */
    const a = await actif(p);
    if (a === 'body' || a === 'aucun') throw new Error('focus retombé sur le document');
  });

  console.log('\n== La fenêtre vocale ==');

  await step('elle prend le focus à l\'ouverture', async () => {
    await p.click('#voice-fab');
    await p.waitForTimeout(600);
    if (!await dans(p, '.voice-overlay')) throw new Error('focus sur ' + await actif(p));
  });

  await step('le focus n\'en sort pas à la tabulation', async () => {
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press('Tab');
      if (!await dans(p, '.voice-overlay')) {
        throw new Error('sorti après ' + (i + 1) + ' tabulations, sur ' + await actif(p));
      }
    }
  });

  await step('Échap la ferme et rend le focus au bouton qui l\'a ouverte', async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    const a = await actif(p);
    if (!/voice-fab/.test(a)) throw new Error('focus sur ' + a);
  });

  console.log('\n== Le tiroir de téléphone ==');
  const m = await (await navigateur.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await m.goto(BASE + '/dashboard.html');
  await m.waitForTimeout(900);

  await step('ouvert, il prend le focus', async () => {
    await m.click('#menu-toggle');
    await m.waitForTimeout(500);
    if (!await dans(m, '.sidebar')) throw new Error('focus sur ' + await actif(m));
  });

  await step('le focus n\'en sort pas à la tabulation', async () => {
    for (let i = 0; i < 12; i++) {
      await m.keyboard.press('Tab');
      if (!await dans(m, '.sidebar')) {
        throw new Error('sorti après ' + (i + 1) + ' tabulations, sur ' + await actif(m));
      }
    }
  });

  await step('Échap le ferme et rend le focus au bouton de menu', async () => {
    await m.keyboard.press('Escape');
    await m.waitForTimeout(400);
    if (await m.evaluate(() => document.querySelector('.shell').classList.contains('drawer-open'))) {
      throw new Error('toujours ouvert');
    }
    const a = await actif(m);
    if (!/menu-toggle/.test(a)) throw new Error('focus sur ' + a);
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
