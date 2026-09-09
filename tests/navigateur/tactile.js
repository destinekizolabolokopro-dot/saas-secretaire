/* Ce qui se touche est-il assez grand pour être touché ?

   Le WCAG 2.2 demande vingt-quatre pixels sur vingt-quatre (SC 2.5.8, niveau
   AA). Plusieurs boutons-liens tombaient à seize ou vingt : « Mot de passe
   oublié », « Masquer », « Passer cette étape », le retour au site. Ce sont
   des liens de texte — leur zone de contact vaut la hauteur de leur ligne,
   confortable à la souris, difficile au pouce.

   Deux pièges de mesure, tous deux rencontrés en écrivant ce fichier :

   getBoundingClientRect ne voit pas la zone étendue par un pseudo-élément.
   Mesurée ainsi, une cible corrigée paraît toujours trop petite. On interroge
   donc le point — elementFromPoint — en s'écartant du centre jusqu'à sortir.

   Et il faut compter comme atteint l'élément lui-même et ses descendants,
   pas ses ancêtres : accepter aussi le parent faisait tout passer, puisque
   s'écarter d'un lien tombe sur le paragraphe qui le contient. Un libellé
   compte en revanche pour sa case à cocher — toucher l'un active l'autre.

       python3 -m http.server 8123
       node tests/navigateur/tactile.js
*/
'use strict';

const CHEMIN_PW = process.env.ALLY_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.ALLY_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.ALLY_BASE || 'http://127.0.0.1:8123';

const { chromium } = require(CHEMIN_PW);

const AUDIT = () => {
  const MINI = 24;
  const cibles = [];

  const atteint = (el, x, y) => {
    const t = document.elementFromPoint(x, y);
    if (!t) return false;
    if (t === el || el.contains(t)) return true;
    const lab = t.closest ? t.closest('label') : null;
    return !!(lab && (lab.control === el || (lab.htmlFor && lab.htmlFor === el.id)));
  };

  document.querySelectorAll('button, a[href], input:not([type=hidden]), [role="switch"]').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (b.top < 0 || b.bottom > window.innerHeight) return;   /* hors écran : non mesurable */
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    if (!atteint(el, cx, cy)) return;                         /* recouvert : autre sujet */

    const porte = (dx, dy) => {
      let d = 0;
      while (d < 30 && atteint(el, cx + dx * (d + 1), cy + dy * (d + 1))) d++;
      return d;
    };
    const largeur = porte(-1, 0) + porte(1, 0) + 1;
    const hauteur = porte(0, -1) + porte(0, 1) + 1;

    if (largeur < MINI || hauteur < MINI) {
      cibles.push({
        quoi: (el.id || (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '')
               || el.tagName).slice(0, 24),
        texte: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
        zone: largeur + '×' + hauteur
      });
    }
  });

  const vus = new Set();
  return cibles.filter((c) => { const k = c.quoi + c.zone; if (vus.has(k)) return false; vus.add(k); return true; });
};

const bad = [];
let checks = 0;

(async () => {
  const navigateur = await chromium.launch({ executablePath: CHROMIUM });

  /* 320 px : l'iPhone SE de première génération, et surtout la largeur
     qu'obtient n'importe quel téléphone dont on grossit la police système. */
  for (const largeur of [320, 390]) {
    console.log('\n== ' + largeur + ' px ==');
    const ctx = await navigateur.newContext({
      viewport: { width: largeur, height: 900 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();

    for (const page of ['index.html', 'login.html', 'abonnement.html',
                        'onboarding.html', 'dashboard.html', 'admin.html']) {
      checks++;
      await p.goto(BASE + '/' + page);
      await p.waitForTimeout(900);

      /* Aucune page ne doit déborder en largeur : c'est le défaut qui rend un
         site inutilisable au pouce, avant même la taille des cibles. */
      const deborde = await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth);
      const petites = await p.evaluate(AUDIT);

      if (deborde > 0 || petites.length) {
        const dit = (deborde > 0 ? 'déborde de ' + deborde + 'px' : '') +
          (petites.length ? (deborde > 0 ? ' ; ' : '') +
            petites.map((c) => c.zone + ' ' + c.quoi + (c.texte ? ' « ' + c.texte + ' »' : '')).join(', ') : '');
        console.log('  ÉCHEC ' + page + ' — ' + dit);
        bad.push(largeur + 'px ' + page + ' : ' + dit);
      } else {
        console.log('  ok  ' + page);
      }
    }
    await ctx.close();
  }

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' écrans mesurés');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
