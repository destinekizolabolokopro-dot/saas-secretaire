/* Les chemins d'erreur de la connexion.

   Tout le monde finit par se tromper en se connectant, et c'est là qu'un
   produit se juge : un message juste fait recommencer, un message absent fait
   partir, un message trop précis fait fuiter.

   Ce dernier point n'est pas théorique. Distinguer « aucun compte à cette
   adresse » de « mot de passe incorrect » permet d'essayer des adresses une à
   une jusqu'à savoir lesquelles ont un compte. Chez un avocat, ce n'est pas
   une liste d'emails : c'est la liste de ses confrères clients d'Ally, et
   elle se constitue sans jamais deviner un mot de passe.

       python3 -m http.server 8123
       node tests/navigateur/connexion.js
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

  /* Une tentative de connexion, et ce que la page en dit. */
  const essai = async (mail, motDePasse) => {
    const ctx = await navigateur.newContext({ viewport: { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(e.message.split('\n')[0]));
    await p.goto(BASE + '/login.html');
    await p.waitForTimeout(500);
    await p.fill('#login-email', mail);
    await p.fill('#login-password', motDePasse);
    await p.click('#login-form button[type=submit]');
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const e = document.getElementById('login-error');
      return {
        message: e && !e.hidden ? e.textContent.trim() : '',
        marques: document.querySelectorAll('#login-form [aria-invalid="true"]').length,
        role: e ? e.getAttribute('role') : null,
        chemin: location.pathname
      };
    });
    return { ctx, p, r, erreurs };
  };

  console.log('\n== Chaque refus se dit ==');

  for (const [nom, mail, pass] of [
    ['adresse et mot de passe vides', '', ''],
    ['mot de passe manquant', 'admin@ally.fr', ''],
    ['adresse mal formée', 'pasunemail', 'MotDePasseTresLong2026'],
    ['mot de passe faux', 'admin@ally.fr', 'nimportequoi'],
    ['adresse inconnue', 'personne@nulle.part', 'MotDePasseTresLong2026']
  ]) {
    await step(nom, async () => {
      const { ctx, r, erreurs } = await essai(mail, pass);
      await ctx.close();
      if (erreurs.length) throw new Error(erreurs[0]);
      if (!r.message) throw new Error('aucun message : le focus bouge et rien ne l\'explique');
      if (!r.marques) throw new Error('aucun champ marqué aria-invalid');
      if (r.chemin !== '/login.html') throw new Error('la page a changé malgré l\'échec');
    });
  }

  console.log('\n== Et ne dit pas ce qu\'il ne doit pas dire ==');

  await step('un mot de passe faux et une adresse inconnue se ressemblent', async () => {
    const a = await essai('admin@ally.fr', 'nimportequoi');
    const b = await essai('personne@nulle.part', 'nimportequoi');
    const m1 = a.r.message, m2 = b.r.message;
    await a.ctx.close(); await b.ctx.close();
    if (m1 !== m2) {
      throw new Error('messages différents — les comptes existants se devinent :\n        « ' +
        m1 +' » / « ' + m2 + ' »');
    }
    if (/aucun compte|pas de compte|inconnu|incorrect\.$/i.test(m1) && /aucun compte|inconnu/i.test(m1)) {
      throw new Error('le message révèle l\'absence de compte : ' + m1);
    }
  });

  await step('le message d\'erreur est annoncé aux lecteurs d\'écran', async () => {
    const { ctx, r } = await essai('admin@ally.fr', 'nimportequoi');
    await ctx.close();
    if (r.role !== 'alert') throw new Error('role="alert" attendu, obtenu : ' + r.role);
  });

  console.log('\n== La marque s\'efface quand on corrige ==');

  await step('une frappe retire le marquage et le message', async () => {
    const { ctx, p } = await essai('', '');
    await p.type('#login-email', 'a');
    await p.waitForTimeout(300);
    const reste = await p.evaluate(() => ({
      marques: document.querySelectorAll('#login-form [aria-invalid="true"]').length,
      message: !document.getElementById('login-error').hidden
    }));
    await ctx.close();
    if (reste.marques) throw new Error('champ encore marqué après correction');
    if (reste.message) throw new Error('message encore affiché après correction');
  });

  console.log('\n== Et le bon couple passe toujours ==');

  await step('les identifiants valides mènent à l\'espace', async () => {
    const { ctx, p } = await essai('admin@ally.fr', 'ally-admin-2026');
    await p.waitForTimeout(900);
    const ou = p.url();
    await ctx.close();
    if (!/admin\.html|dashboard\.html/.test(ou)) throw new Error('resté sur ' + ou);
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
