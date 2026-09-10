/* La console d'administration : ce qui coupe l'accès de quelqu'un.

   Deux gestes de cet écran touchent un client qui n'est pas là pour se
   défendre. « Suspendre » se faisait d'un clic, dans une liste, et refuse
   ensuite la connexion à tout le cabinet — du point de vue du client, c'est
   aussi brutal qu'une suppression et bien plus facile à déclencher par
   erreur. « Supprimer » passait par une boîte du navigateur, étrangère au
   produit, que certains contextes bloquent purement et simplement : le clic
   ne faisait alors rien du tout.

   Cette suite refuse d'accepter un « ça a marché » : elle relit l'annuaire.

       python3 -m http.server 8123
       node tests/navigateur/console.js
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
  const p = await (await navigateur.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  p.on('pageerror', (e) => bad.push('ERREUR JS : ' + e.message.split('\n')[0]));
  /* Une boîte du navigateur qui s'ouvrirait ici serait précisément ce qu'on
     vient de retirer : on la refuse, pour que le contrôle échoue au lieu de
     rester suspendu. */
  p.on('dialog', (d) => {
    bad.push('DIALOGUE NATIF : ' + d.message());
    d.dismiss().catch(() => {});
  });

  await p.goto(BASE + '/login.html');
  await p.fill('#login-email', 'admin@ally.fr');
  await p.fill('#login-password', 'ally-admin-2026');
  await p.click('#login-form button[type="submit"]');
  await p.waitForURL(/admin/, { timeout: 8000 });
  await p.waitForTimeout(900);

  /* L'annuaire, tel que la console l'a écrit. */
  const compte = (email) => p.evaluate((mail) => {
    const u = window.ALLY_ACCOUNTS.byEmail(mail);
    return u ? { id: u.id, status: u.status } : null;
  }, email);

  const ouvrirFiche = async (email) => {
    const id = (await compte(email)).id;
    await p.click('[data-tab="accounts"]').catch(() => {});
    await p.waitForTimeout(500);
    await p.evaluate((userId) => {
      const b = document.querySelector('[data-open="' + userId + '"]');
      if (b) b.click();
    }, id);
    await p.waitForSelector('#drawer-body [data-act]', { timeout: 8000 });
  };

  /* Un compte de la démonstration, qui n'est pas l'administrateur. */
  const CIBLE = await p.evaluate(() => {
    const u = window.ALLY_ACCOUNTS.all().filter(
      (x) => x.role !== 'admin' && x.status !== 'suspended')[0];
    return u ? u.email : null;
  });

  console.log('\n== Suspendre un cabinet ==');

  await step('l\'annuaire de démonstration a bien un compte à suspendre', async () => {
    if (!CIBLE) throw new Error('aucun compte non suspendu : les contrôles suivants ne prouveraient rien');
  });

  await step('le premier clic ne suspend personne', async () => {
    await ouvrirFiche(CIBLE);
    const bouton = p.locator('#drawer-body [data-act="suspend"]');
    await bouton.click();
    await p.waitForTimeout(400);

    if (!/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton n\'annonce pas ce que fera le clic suivant');
    }
    if ((await compte(CIBLE)).status === 'suspended') {
      throw new Error('le compte est suspendu dès le premier clic');
    }
  });

  await step('un bouton armé se désarme seul', async () => {
    await p.waitForTimeout(5400);
    const bouton = p.locator('#drawer-body [data-act="suspend"]');
    if (/Confirmer/.test(await bouton.textContent())) throw new Error('le bouton est resté chargé');
    if ((await compte(CIBLE)).status === 'suspended') {
      throw new Error('suspendu sans second clic');
    }
  });

  await step('le second clic suspend pour de bon', async () => {
    const bouton = p.locator('#drawer-body [data-act="suspend"]');
    await bouton.click();
    await p.waitForTimeout(300);
    await bouton.click();
    await p.waitForTimeout(700);
    if ((await compte(CIBLE)).status !== 'suspended') {
      throw new Error('statut : ' + (await compte(CIBLE)).status);
    }
  });

  await step('et la fiche propose alors de réactiver', async () => {
    if (!await p.locator('#drawer-body [data-act="activate"]').count()) {
      throw new Error('aucune sortie de la suspension');
    }
  });

  console.log('\n== Supprimer un compte ==');

  const VICTIME = await p.evaluate(() => {
    const u = window.ALLY_ACCOUNTS.all().filter((x) => x.role !== 'admin')[1];
    return u ? u.email : null;
  });

  await step('un second compte est disponible pour ce contrôle', async () => {
    if (!VICTIME || VICTIME === CIBLE) throw new Error('pas de second compte distinct');
  });

  await step('le premier clic ne supprime rien, et aucune boîte ne s\'ouvre', async () => {
    await ouvrirFiche(VICTIME);
    const bouton = p.locator('#drawer-body [data-act="delete"]');
    await bouton.click();
    await p.waitForTimeout(400);
    if (!/Confirmer/.test(await bouton.textContent())) {
      throw new Error('le bouton ne dit rien de la conséquence');
    }
    if (!await compte(VICTIME)) throw new Error('supprimé dès le premier clic');
  });

  await step('le second clic supprime vraiment', async () => {
    const bouton = p.locator('#drawer-body [data-act="delete"]');
    await bouton.click();
    await p.waitForTimeout(800);
    if (await compte(VICTIME)) throw new Error('le compte est toujours dans l\'annuaire');
  });

  await step('et le journal en garde la trace, une seule fois', async () => {
    const lignes = await p.evaluate((mail) =>
      window.ALLY_ACCOUNTS.events().filter((e) => e.action === 'deleted' && e.detail === mail).length,
    VICTIME);
    if (lignes === 0) throw new Error('aucune trace de la suppression');
    if (lignes > 1) throw new Error(lignes + ' lignes pour une seule suppression');
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
