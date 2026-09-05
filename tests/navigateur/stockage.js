/* Quand le navigateur refuse d'enregistrer.

   Ally range tout dans localStorage. Trois choses peuvent l'en empêcher, et
   aucune ne se rencontre en développant : la navigation privée stricte et les
   politiques d'entreprise refusent l'accès, un quota atteint refuse
   l'écriture, et un JSON illisible laissé par une version précédente casse la
   lecture.

   Le produit y survivait déjà — il retombe sur les valeurs par défaut et tout
   s'affiche. C'était précisément le défaut : on pouvait régler ses horaires,
   écrire son script d'accueil et remplir sa fiche pendant dix minutes, tout
   perdre au rechargement, sans qu'une ligne l'ait prévenu.

       python3 -m http.server 8123
       node tests/navigateur/stockage.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);

/* On remplace localStorage avant le moindre script de la page. */
const REFUS = `
  const jeter = () => { const e = new Error('refusé'); e.name = 'SecurityError'; throw e; };
  Object.defineProperty(window, 'localStorage', { configurable: true,
    get() { return { getItem: jeter, setItem: jeter, removeItem: jeter,
                     clear: jeter, key: jeter, length: 0 }; } });`;

const QUOTA = `
  const vrai = window.localStorage;
  Object.defineProperty(window, 'localStorage', { configurable: true,
    get() { return {
      getItem: (k) => vrai.getItem(k), removeItem: (k) => vrai.removeItem(k),
      clear: () => vrai.clear(), key: (i) => vrai.key(i),
      get length() { return vrai.length; },
      setItem() { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    }; } });`;

const CORROMPU = `
  try { window.localStorage.setItem('ally.account.v1', '{ceci n est pas du JSON'); } catch (e) {}`;

const bad = [];
let checks = 0;
const step = async (label, fn) => {
  checks++;
  try { await fn(); console.log('  ok  ' + label); }
  catch (e) { console.log('  ÉCHEC ' + label + ' — ' + e.message); bad.push(label + ' : ' + e.message); }
};

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });

  /* Ouvre une page avec la panne demandée, en surveillant la console. */
  const avec = async (panne, page) => {
    const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push('JS : ' + e.message.split('\n')[0]));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) {
        erreurs.push('console : ' + m.text().slice(0, 100));
      }
    });
    if (panne) await p.addInitScript(panne);
    await p.goto(BASE + '/' + page);
    await p.waitForTimeout(1300);
    return { ctx, p, erreurs };
  };

  console.log('\n== Aucune page ne se brise ==');

  for (const [nom, panne] of [['refus d\'accès', REFUS], ['quota atteint', QUOTA],
                              ['données illisibles', CORROMPU]]) {
    for (const page of ['index.html', 'login.html', 'onboarding.html', 'dashboard.html']) {
      await step(nom + ' — ' + page, async () => {
        const { ctx, p, erreurs } = await avec(panne, page);
        const texte = await p.evaluate(() => (document.body.innerText || '').trim().length);
        const coque = await p.evaluate(
          () => !!document.querySelector('main, .shell, .auth-shell, .ob-shell'));
        await ctx.close();
        if (erreurs.length) throw new Error(erreurs.slice(0, 2).join(' | '));
        if (!coque || texte < 200) throw new Error('la page ne rend presque rien (' + texte + ' caractères)');
      });
    }
  }

  console.log('\n== Et le produit le dit ==');

  await step('le refus d\'enregistrer est annoncé, avec le geste qui répare', async () => {
    const { ctx, p } = await avec(REFUS, 'dashboard.html');
    const vu = await p.locator('.alert-warn').count();
    const texte = vu ? await p.locator('.alert-warn').innerText() : '';
    await ctx.close();
    if (!vu) throw new Error('aucun avertissement : la perte serait silencieuse');
    if (!/navigation privée|bloqu/i.test(texte)) throw new Error('la cause n\'est pas dite : ' + texte);
    if (!/ne sera retrouvé|perdu|pas retrouvé/i.test(texte)) {
      throw new Error('la conséquence n\'est pas dite : ' + texte);
    }
  });

  await step('le quota atteint dit autre chose que le refus', async () => {
    const { ctx, p } = await avec(QUOTA, 'dashboard.html');
    /* La lecture marche : la panne n'apparaît qu'à la première écriture. */
    await p.click('.nav-item:nth-child(2)').catch(() => {});
    await p.waitForTimeout(400);
    await p.click('.nav-item:nth-child(1)').catch(() => {});
    await p.waitForTimeout(800);
    const texte = await p.locator('.alert-warn').count()
      ? await p.locator('.alert-warn').innerText() : '';
    await ctx.close();
    if (!/mémoire|pleine/i.test(texte)) throw new Error('message attendu sur le quota : ' + texte);
  });

  await step('des données illisibles ne déclenchent aucune alerte', async () => {
    /* Un JSON cassé n'est pas une panne de stockage : écrire par-dessus le
       répare. S'en alarmer serait crier au loup. */
    const { ctx, p } = await avec(CORROMPU, 'dashboard.html');
    const vu = await p.locator('.alert-warn').count();
    await ctx.close();
    if (vu) throw new Error('avertissement affiché pour un simple reste de version précédente');
  });

  await step('sans panne, aucune bannière', async () => {
    const { ctx, p } = await avec(null, 'dashboard.html');
    const vu = await p.locator('.alert-warn').count();
    await ctx.close();
    if (vu) throw new Error('bannière affichée alors que tout va bien');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
