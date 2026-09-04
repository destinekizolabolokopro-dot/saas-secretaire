/* Ally dans un vrai navigateur : est-ce que ça tient debout ?

   Les tests de tests/ interrogent le moteur sans DOM, en une seconde. Celui-ci
   ouvre les pages pour de bon : il attrape ce que l'autre ne peut pas voir —
   une erreur JavaScript au chargement, un onglet qui ne rend rien, une voix
   qu'on ne peut pas choisir, un débordement horizontal sur téléphone.

   Il demande Playwright et un Chromium. Le chemin se règle par les variables
   ALLY_PLAYWRIGHT et ALLY_CHROMIUM si l'installation diffère.

       python3 -m http.server 8123
       node tests/navigateur/ecran.js
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
  const mk = async (viewport) => {
    const ctx = await navigateur.newContext({ viewport: viewport || { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) bad.push('CONSOLE : ' + m.text());
    });
    return { ctx, page };
  };

  console.log('\n== Les pages se chargent ==');

  const A = await mk();
  for (const page of ['index.html', 'login.html', 'abonnement.html', 'onboarding.html', 'dashboard.html']) {
    await step(page + ' s\'affiche sans erreur', async () => {
      const res = await A.page.goto(BASE + '/' + page);
      if (res.status() !== 200) throw new Error('statut ' + res.status());
      await A.page.waitForTimeout(400);
    });
  }

  console.log('\n== L\'espace pro répond ==');

  await step('les cinq onglets rendent quelque chose', async () => {
    await A.page.goto(BASE + '/dashboard.html');
    await A.page.waitForSelector('#tabpanel');
    for (const onglet of ['today', 'conversations', 'agenda', 'telephony', 'ally']) {
      await A.page.click('[data-tab="' + onglet + '"]');
      await A.page.waitForTimeout(350);
      const texte = (await A.page.textContent('#tabpanel')).trim();
      if (texte.length < 40) throw new Error('onglet ' + onglet + ' presque vide');
    }
  });

  await step('Ally répond dans le chat, à la même question qu\'au moteur', async () => {
    /* Le chat écrit vit dans Mon compte → Support : même moteur que la voix. */
    await A.page.click('#profile-card');
    await A.page.waitForSelector('[data-account="help"]');
    await A.page.click('[data-account="help"]');
    await A.page.waitForSelector('#chat-form');
    await A.page.fill('#chat-input', 'quels sont mes créneaux libres ?');
    await A.page.press('#chat-input', 'Enter');
    await A.page.waitForFunction(
      () => /Créneaux libres|Rien de libre/.test(document.getElementById('tabpanel').textContent),
      null, { timeout: 6000 }
    );
  });

  console.log('\n== La voix ==');

  await step('la prononciation est branchée sur la synthèse', async () => {
    const dit = await A.page.evaluate(() => {
      /* On intercepte ce qui part réellement au moteur vocal. */
      const vus = [];
      const vraiSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (u) => { vus.push(u.text); };
      window.ALLY_VOICE.speak('Rendez-vous à 14:00 avec Mme Aubert.', {});
      window.speechSynthesis.speak = vraiSpeak;
      return vus;
    });
    if (!dit.length) throw new Error('rien n\'a été prononcé');
    if (!/quatorze heures/.test(dit[0])) throw new Error('texte envoyé : ' + dit[0]);
    if (!/Madame/.test(dit[0])) throw new Error('titre non développé : ' + dit[0]);
  });

  await step('le choix de la voix s\'affiche, même sans voix installée', async () => {
    await A.page.click('[data-tab="telephony"]');
    await A.page.waitForSelector('[data-voice-picker]', { timeout: 6000 });
    await A.page.waitForTimeout(1800);
    const texte = await A.page.textContent('[data-voice-picker]');
    if (texte.trim().length < 20) throw new Error('sélecteur vide');
  });

  console.log('\n== La barre de navigation ==');

  const N = await mk();
  await N.page.goto(BASE + '/index.html');
  await N.page.waitForTimeout(600);

  await step('chaque ancre dépose son titre sous la barre, pas dessous', async () => {
    /* Une barre collante mange le haut de tout ce vers quoi on saute. Cliquer
       « Solution » amenait bien à la bonne section, mais son intitulé se
       retrouvait quarante pixels sous la barre : on arrivait au bon endroit
       sans le voir, ce qui donne l'impression que le lien n'a rien fait. */
    const hauteur = await N.page.evaluate(
      () => document.querySelector('.nav').getBoundingClientRect().height);
    const caches = [];
    for (const id of ['solution', 'demo', 'how', 'focus', 'pricing', 'trust']) {
      await N.page.evaluate(() => window.scrollTo(0, 0));
      await N.page.waitForTimeout(150);
      await N.page.click('.nav-links a[href="#' + id + '"]');
      await N.page.waitForTimeout(1100);
      const haut = await N.page.evaluate((i) => {
        const s = document.getElementById(i);
        const titre = s.querySelector('.kicker') || s.querySelector('h2');
        return titre.getBoundingClientRect().top;
      }, id);
      if (haut < hauteur) caches.push('#' + id + ' à ' + Math.round(haut) + 'px');
    }
    if (caches.length) throw new Error('sous la barre de ' + Math.round(hauteur) + 'px : ' + caches.join(', '));
  });

  await step('elle tient sur une ligne à toutes les largeurs', async () => {
    /* Entre 900 et 1200 px, les entrées ne tenaient plus et la barre montait
       à trois rangées — cent vingt-cinq pixels empilés. Le jeton --nav-h, qui
       sert à réserver la place des ancres, mentait alors sur sa hauteur. */
    const fautes = [];
    for (const largeur of [1600, 1440, 1280, 1200, 1150, 1101, 1100, 1024, 900, 560, 390]) {
      const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE + '/index.html');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({
        h: document.querySelector('.nav').getBoundingClientRect().height,
        jeton: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'))
      }));
      if (Math.abs(r.h - r.jeton) > 4) {
        fautes.push(largeur + 'px : barre ' + Math.round(r.h) + ', jeton ' + r.jeton);
      }
      await ctx.close();
    }
    if (fautes.length) throw new Error(fautes.join(' | '));
  });

  console.log('\n== Sur un téléphone ==');

  await step('aucun débordement horizontal à 390 px', async () => {
    const M = await mk({ width: 390, height: 844 });
    await M.page.goto(BASE + '/dashboard.html');
    await M.page.waitForSelector('#tabpanel');
    const over = await M.page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) throw new Error('déborde de ' + over + ' px');
    await M.ctx.close();
  });

  await navigateur.close();

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  if (bad.length) {
    console.log(bad.length + ' problème(s) :');
    bad.forEach((e) => console.log(' - ' + e));
    process.exit(1);
  }
  console.log('Aucun problème.');
})();
