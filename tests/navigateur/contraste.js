/* Ally se lit-elle ? Le contraste, mesuré et non estimé.

   Le WCAG demande 4,5:1 entre un texte et son fond, 3:1 pour les grands
   caractères. Sur fond sombre, l'œil se trompe : un gris qui « paraît »
   lisible sur un écran de bureau bien réglé disparaît sur un portable en
   plein jour. Seul le calcul tranche.

   Deux pièges, tous deux rencontrés en écrivant ce fichier :

   getComputedStyle rend ici de l'oklch, que rien dans le navigateur ne
   convertit directement en sRGB. On passe donc par un canvas : il sait
   composer n'importe quelle syntaxe de couleur sur un fond connu et rendre le
   pixel obtenu. C'est le seul convertisseur fiable qu'on ait sous la main, et
   il gère la transparence par la même occasion.

   Et un bouton peint par un dégradé a un background-color transparent. Sans
   précaution, on remonte alors jusqu'au fond de page — sombre — et l'on
   conclut que le texte foncé d'un bouton violet vif est illisible. On extrait
   donc les arrêts du dégradé, et l'on retient le moins favorable.

       python3 -m http.server 8123
       node tests/navigateur/contraste.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);

const AUDIT = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  const composer = (couches) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    couches.forEach((c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); });
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const transparent = (c) => !c || c === 'transparent' ||
    /rgba\(0,\s*0,\s*0,\s*0\)/.test(c) || /\/\s*0\s*\)/.test(c);

  const arrets = (img) => {
    if (!img || img === 'none' || !/gradient/.test(img)) return [];
    return (img.match(/(oklch|oklab|rgba?|hsla?|color)\([^()]*\)/g) || [])
      .filter((c) => !transparent(c));
  };

  const fonds = (el) => {
    const pile = [];
    let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      const stops = arrets(cs.backgroundImage);
      if (stops.length) pile.unshift(stops);
      else if (!transparent(cs.backgroundColor)) pile.unshift([cs.backgroundColor]);
      n = n.parentElement;
    }
    return pile;
  };

  /* Toutes les compositions possibles du fond, dégradés compris. Plafonnée :
     deux dégradés superposés suffisent à couvrir ce qui existe ici. */
  const variantes = (pile) => {
    let sorties = [[]];
    pile.forEach((couche) => {
      const suite = [];
      sorties.forEach((s) => couche.forEach((c) => suite.push(s.concat([c]))));
      sorties = suite.slice(0, 12);
    });
    return sorties;
  };

  const bas = [], tous = [], sansNom = [], vus = new Set();

  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    /* Le texte propre à l'élément, pas celui de ses enfants : sans cela, on
       mesurerait la couleur du parent contre le texte d'un descendant. */
    const propre = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(' ');

    if (propre) {
      const pile = fonds(el);
      let ratio = Infinity;
      variantes(pile).forEach((v) => {
        const r2 = contraste(composer(v.concat([cs.color])), composer(v));
        if (r2 < ratio) ratio = r2;
      });
      if (ratio === Infinity) ratio = 21;
      ratio = Math.round(ratio * 100) / 100;

      const px = parseFloat(cs.fontSize);
      const gras = parseInt(cs.fontWeight, 10) >= 700;
      const seuil = (px >= 24 || (px >= 18.66 && gras)) ? 3 : 4.5;
      const ligne = {
        sel: el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        texte: propre.slice(0, 40), ratio, seuil, px
      };
      tous.push(ligne);
      if (ratio < seuil) {
        const cle = ligne.sel + '|' + Math.round(ratio * 10);
        if (!vus.has(cle)) { vus.add(cle); bas.push(ligne); }
      }
    }

    /* Une commande sans nom accessible est muette pour un lecteur d'écran. */
    const role = el.getAttribute('role') || '';
    const interactif = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ||
      (el.tagName === 'A' && el.hasAttribute('href')) ||
      /^(button|switch|link|tab|checkbox)$/.test(role);
    if (interactif && el.type !== 'hidden') {
      const nom = (el.getAttribute('aria-label') || '').trim() ||
        (el.getAttribute('aria-labelledby') ? 'ref' : '') ||
        (el.textContent || '').trim() ||
        (el.getAttribute('title') || '').trim() ||
        (el.labels && el.labels.length ? 'label' : '') ||
        (el.getAttribute('placeholder') || '').trim();
      if (!nom) {
        sansNom.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
          (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/)[0] : ''));
      }
    }
  });

  tous.sort((a, b) => a.ratio - b.ratio);
  return {
    bas, nb: tous.length,
    faible: tous[0] ? tous[0].ratio : null,
    sansNom: Array.from(new Set(sansNom))
  };
};

const bad = [];
let checks = 0;

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await navigateur.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  const controle = async (nom) => {
    checks++;
    const r = await p.evaluate(AUDIT);
    const pb = r.bas.map((x) =>
      x.ratio + ':1 (< ' + x.seuil + ', ' + x.px + 'px) ' + x.sel + ' « ' + x.texte + ' »');
    if (r.sansNom.length) pb.push('sans nom accessible : ' + r.sansNom.join(', '));

    if (pb.length) {
      console.log('  ÉCHEC ' + nom);
      pb.forEach((l) => console.log('        ' + l));
      bad.push(nom + ' : ' + pb.length + ' problème(s)');
    } else {
      console.log('  ok  ' + nom + '  (' + r.nb + ' textes, plus faible ' + r.faible + ':1)');
    }
  };

  console.log('\n== Les pages ==');
  for (const page of ['index.html', 'login.html', 'abonnement.html', 'onboarding.html', 'dashboard.html']) {
    await p.goto(BASE + '/' + page);
    await p.waitForTimeout(800);
    await controle(page);
  }

  console.log('\n== Les onglets de l\'espace pro ==');
  await p.goto(BASE + '/dashboard.html');
  await p.waitForTimeout(900);
  const onglets = await p.locator('.nav-item').count();
  for (let i = 0; i < onglets; i++) {
    await p.locator('.nav-item').nth(i).click();
    await p.waitForTimeout(700);
    await controle('onglet ' + (await p.locator('#tab-title').innerText()));
  }

  console.log('\n== Les sections de Mon compte ==');
  await p.locator('.profile-card').click();
  await p.waitForTimeout(700);
  const sections = await p.locator('[data-account]').count();
  for (let i = 0; i < sections; i++) {
    const nom = await p.locator('[data-account]').nth(i).innerText();
    await p.locator('[data-account]').nth(i).click();
    await p.waitForTimeout(700);
    await controle('compte › ' + nom);
  }

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' écrans mesurés');
  console.log(bad.length ? bad.length + ' écran(s) en défaut :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
