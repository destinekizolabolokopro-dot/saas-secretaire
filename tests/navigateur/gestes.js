/* Les gestes tiennent-ils leur promesse ?

   Cliquer sans casser ne prouve rien : un bouton peut afficher « c'est fait »
   sans que rien ne bouge. Cette suite fait les gestes qui engagent — poser un
   rendez-vous, l'annuler, fermer une journée, envoyer un email — et va
   regarder ce que le produit a réellement écrit, pas ce qu'il affiche.

   Le cas de l'email mérite son détail. « Envoyer » ne fait pas partir l'email :
   il ouvre une fenêtre de dix secondes pendant laquelle on peut encore
   revenir. C'est un choix produit — Ally dicte les emails à la voix, et une
   erreur de transcription doit rester rattrapable — et c'est précisément le
   genre de promesse qu'il faut vérifier, parce qu'elle ne se voit pas.

       python3 -m http.server 8123
       node tests/navigateur/gestes.js
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
  p.on('dialog', (d) => d.accept().catch(() => {}));

  /* Les données du compte, telles que le produit les a écrites. */
  const donnees = () => p.evaluate(() => JSON.parse(JSON.stringify(window.ALLY_STORE.data())));

  /* Déplier un brouillon, quel que soit son état de départ. Un clic sur
     l'en-tête bascule : appliqué à une ligne déjà ouverte, il la referme et
     cache le bouton qu'on venait chercher. */
  const deplierBrouillon = async () => {
    /* Tous les corps sont dans le DOM, dépliés ou non : c'est la visibilité
       qu'il faut regarder, pas la présence. Compter les nœuds faisait croire
       que tout était déjà ouvert, et l'on cliquait sur un bouton caché. */
    const bouton = p.locator('.conv.is-draft [data-send]').first();
    const barre = p.locator('.conv.is-draft .sending-bar').first();
    const visible = await bouton.isVisible().catch(() => false)
      || await barre.isVisible().catch(() => false);
    if (!visible) {
      await p.locator('.conv.is-draft .conv-head').first().click();
      await p.waitForTimeout(500);
    }
  };

  await p.goto(BASE + '/dashboard.html');
  await p.waitForTimeout(1200);

  console.log('\n== L\'agenda ==');
  await p.locator('.nav-item').nth(2).click();
  await p.waitForTimeout(800);

  await step('poser un rendez-vous l\'écrit vraiment', async () => {
    const avant = (await donnees()).rdv.length;
    await p.fill('#cal-client', 'M. Testeur');
    await p.click('#cal-add button[type=submit]');
    await p.waitForTimeout(700);
    const rdv = (await donnees()).rdv;
    if (rdv.length !== avant + 1) throw new Error(avant + ' → ' + rdv.length);
    if (!rdv.some((r) => /Testeur/.test(r.client))) throw new Error('le nom écrit n\'est pas celui saisi');
  });

  await step('et il s\'affiche', async () => {
    if (!await p.evaluate(() => document.body.innerText.includes('M. Testeur'))) {
      throw new Error('écrit en base mais absent de l\'écran');
    }
  });

  await step('l\'annuler le retire vraiment', async () => {
    const avant = (await donnees()).rdv.length;
    await p.locator('[data-rdv-cancel]').last().click();
    await p.waitForTimeout(700);
    const apres = (await donnees()).rdv.length;
    if (apres !== avant - 1) throw new Error(avant + ' → ' + apres);
  });

  await step('fermer la journée la marque fermée', async () => {
    const avant = ((await donnees()).blocked || []).length;
    await p.locator('button', { hasText: 'Bloquer la journée' }).first().click();
    await p.waitForTimeout(700);
    const apres = ((await donnees()).blocked || []).length;
    if (apres !== avant + 1) throw new Error(avant + ' → ' + apres);
  });

  console.log('\n== L\'email, et sa fenêtre de rétractation ==');
  await p.locator('.nav-item').nth(1).click();
  await p.waitForTimeout(800);

  let idEnvoye = null;

  await step('« Envoyer » ne fait pas partir l\'email tout de suite', async () => {
    const avant = await donnees();
    if (!avant.drafts.length) throw new Error('aucun brouillon dans le jeu de données');

    await deplierBrouillon();
    await p.locator('[data-send]').first().click();
    await p.waitForTimeout(600);

    const apres = await donnees();
    const enVol = apres.drafts.filter((m) => m.sending);
    if (!enVol.length) throw new Error('aucun email marqué en cours d\'envoi');
    if (apres.sent.length !== avant.sent.length) {
      throw new Error('parti immédiatement : la fenêtre de rétractation ne sert à rien');
    }
    idEnvoye = enVol[0].id;
  });

  await step('et le compte à rebours est là, avec de quoi l\'arrêter', async () => {
    /* On vise le bouton par ce qu'il fait — data-undo — et non par son
       libellé : il porte son compte à rebours et change de texte chaque
       seconde. Chercher « Annuler » attrapait aussi celui d'un rendez-vous. */
    if (!await p.locator('.sending-bar [data-undo]').count()) {
      throw new Error('aucun moyen d\'arrêter l\'envoi pendant la fenêtre');
    }
    if (!await p.locator('.sending-bar [data-undo]').first().isVisible()) {
      throw new Error('le bouton existe mais n\'est pas visible');
    }
  });

  await step('annuler dans la fenêtre le remet en brouillon', async () => {
    /* Sans délai d'attente long : la fenêtre ne dure que dix secondes, et un
       test qui patiente trente secondes la manque à tous les coups — c'est ce
       qui m'a fait croire un instant à un défaut du produit. */
    await p.locator('.sending-bar [data-undo]').first().click({ timeout: 4000 });
    await p.waitForTimeout(700);

    const apres = await donnees();
    const encore = apres.drafts.filter((m) => m.id === idEnvoye)[0];
    if (!encore) throw new Error('le brouillon a disparu au lieu de revenir');
    if (encore.sending) throw new Error('toujours marqué en cours d\'envoi');
    if (apres.sent.some((m) => m.subject === encore.subject)) {
      throw new Error('parti quand même');
    }
  });

  await step('laissé faire, il part pour de bon', async () => {
    /* La fenêtre dure dix secondes. On la laisse s'écouler et on vérifie que
       l'email a bien quitté les brouillons pour les envoyés. */
    const avant = await donnees();
    await deplierBrouillon();
    await p.locator('[data-send]').first().click({ timeout: 5000 });

    const fenetre = await p.evaluate(() => window.ALLY_STORE.UNDO_MS || 10000);
    await p.waitForTimeout(fenetre + 2500);

    const apres = await donnees();
    if (apres.drafts.length !== avant.drafts.length - 1) {
      throw new Error('brouillons ' + avant.drafts.length + ' → ' + apres.drafts.length);
    }
    if (apres.sent.length !== avant.sent.length + 1) {
      throw new Error('envoyés ' + avant.sent.length + ' → ' + apres.sent.length);
    }
  });

  console.log('\n== Ce qui est écrit reste écrit ==');

  await step('un rechargement retrouve tout', async () => {
    const avant = await donnees();
    await p.reload();
    await p.waitForTimeout(1500);
    const apres = await donnees();
    const memes = ['rdv', 'drafts', 'sent', 'blocked'].filter(
      (k) => (apres[k] || []).length !== (avant[k] || []).length);
    if (memes.length) throw new Error('perdu au rechargement : ' + memes.join(', '));
  });

  console.log('\n================ RÉSULTAT ================');
  console.log(checks + ' contrôles');
  console.log(bad.length ? bad.length + ' problème(s) :\n - ' + bad.join('\n - ') : 'Aucun problème.');

  await navigateur.close();
  process.exit(bad.length ? 1 : 0);
})();
