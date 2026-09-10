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

  console.log('\n== La base de connaissances ==');
  /* C'est elle qui parle aux clients du cabinet : une fiche fausse ou en
     double s'entend au téléphone, pas à l'écran. */
  await p.locator('.nav-item').nth(4).click();
  await p.waitForTimeout(800);
  await p.locator('#faq-open').scrollIntoViewIfNeeded();

  const fiches = () => p.evaluate(() => window.ALLY_STORE.data().faq.length);
  const messageFaq = () => p.evaluate(() => {
    const e = document.getElementById('faq-error');
    return e && !e.hidden ? e.textContent.trim() : '';
  });

  await step('un formulaire incomplet dit ce qui manque', async () => {
    /* Il refusait en silence : on tapait la question, on cliquait
       « Ajouter », rien ne se passait et rien ne disait pourquoi. */
    const avant = await fiches();
    await p.locator('#faq-open').click();
    await p.waitForTimeout(300);
    await p.locator('#faq-form button[type=submit]').click();
    await p.waitForTimeout(400);
    if (await fiches() !== avant) throw new Error('une fiche vide a été ajoutée');
    if (!await messageFaq()) throw new Error('aucun message sur le champ manquant');

    await p.fill('#faq-q', 'Acceptez-vous la carte bleue ?');
    await p.locator('#faq-form button[type=submit]').click();
    await p.waitForTimeout(400);
    if (await fiches() !== avant) throw new Error('une fiche sans réponse a été ajoutée');
    const dit = await messageFaq();
    if (!/répondra|réponse/i.test(dit)) throw new Error('le message ne parle pas de la réponse : ' + dit);
  });

  await step('une fiche complète est ajoutée', async () => {
    const avant = await fiches();
    await p.fill('#faq-a', 'Oui, carte bleue et virement.');
    await p.locator('#faq-form button[type=submit]').click();
    await p.waitForTimeout(600);
    if (await fiches() !== avant + 1) throw new Error('fiches ' + avant + ' → ' + await fiches());
  });

  await step('une question déjà connue est refusée', async () => {
    /* Deux fiches à la même question, c'est deux réponses possibles à un
       client, et le moteur en choisit une. La comparaison ignore la casse et
       les accents : « acceptez vous la CARTE BLEUE » est la même question. */
    const avant = await fiches();
    await p.locator('#faq-open').click();
    await p.waitForTimeout(300);
    await p.fill('#faq-q', 'acceptez vous la CARTE BLEUE');
    await p.fill('#faq-a', 'Une autre réponse.');
    await p.locator('#faq-form button[type=submit]').click();
    await p.waitForTimeout(500);
    if (await fiches() !== avant) throw new Error('le doublon a été accepté');
    const dit = await messageFaq();
    if (!/déjà/i.test(dit)) throw new Error('le refus ne dit pas que la question existe : ' + dit);
    await p.locator('#faq-cancel').click();
    await p.waitForTimeout(300);
  });

  await step('supprimer une fiche demande confirmation', async () => {
    /* Retirer une réponse change ce qu'Ally dit au public. Annuler un
       rendez-vous en demande confirmation ; ceci le mérite autant. */
    const avant = await fiches();
    await p.locator('[data-faq-del]').first().click();
    await p.waitForTimeout(400);
    if (await fiches() !== avant) throw new Error('supprimée dès le premier clic');
    const texte = await p.locator('[data-faq-del]').first().innerText();
    if (!/confirmer/i.test(texte)) throw new Error('le bouton ne demande pas confirmation : ' + texte);

    await p.locator('[data-faq-del]').first().click();
    await p.waitForTimeout(600);
    if (await fiches() !== avant - 1) throw new Error('fiches ' + avant + ' → ' + await fiches());
  });

  console.log('\n== Changer de formule change la formule ==');

  await step('les choix proposés sont ceux du catalogue', async () => {
    /* Ils étaient trois noms hérités d'un prototype — « Essai gratuit », le
       libellé du profil métier, « Cabinet illimité » — dont aucun n'existait
       au catalogue. */
    await p.locator('.profile-card').click();
    await p.waitForTimeout(600);
    await p.locator('[data-account="plan"]').click();
    await p.waitForTimeout(600);
    await p.locator('#plan-open').click();
    await p.waitForTimeout(400);

    const proposes = await p.evaluate(
      () => Array.from(document.querySelectorAll('[data-plan]')).map((b) => b.getAttribute('data-plan')));
    const catalogue = await p.evaluate(() => window.ALLY_PLANS.map((f) => f.id));
    const inconnus = proposes.filter((id) => catalogue.indexOf(id) === -1);
    if (inconnus.length) throw new Error('formules absentes du catalogue : ' + inconnus.join(', '));
    if (!proposes.length) throw new Error('aucune formule proposée');
  });

  await step('en choisir une change le quota, le prix et le nom ensemble', async () => {
    /* Le défaut : seul le libellé changeait. L'identifiant de formule ne
       bougeait pas, donc ni le quota ni le prix — quelqu'un se croyait passé
       en « illimité » pendant qu'Ally lui appliquait les quatre cents appels
       de la formule d'en dessous. */
    const lire = () => p.evaluate(() => ({
      nom: window.ALLY_STORE.plan(),
      id: window.ALLY_STORE.state.planId,
      appels: window.ALLY_STORE.planData().quota.calls,
      prix: window.ALLY_STORE.planData().price
    }));

    const avant = await lire();
    const autre = await p.evaluate((actuel) => {
      const f = window.ALLY_PLANS.filter((x) => x.id !== actuel)[0];
      return { id: f.id, nom: f.name, appels: f.quota.calls, prix: f.price };
    }, avant.id);

    await p.locator('[data-plan="' + autre.id + '"]').click();
    await p.waitForTimeout(900);
    const apres = await lire();

    if (apres.id !== autre.id) throw new Error('l\'identifiant n\'a pas suivi : ' + apres.id);
    if (apres.nom !== autre.nom) throw new Error('le nom affiché ne suit pas : ' + apres.nom);
    if (apres.appels !== autre.appels) {
      throw new Error('le quota est resté à ' + apres.appels + ' au lieu de ' + autre.appels);
    }
    if (apres.prix !== autre.prix) {
      throw new Error('le prix est resté à ' + apres.prix + ' au lieu de ' + autre.prix);
    }
  });

  await step('redescendre retire vraiment les capacités', async () => {
    /* Permanence est un standard sans IA : la commande vocale et la base de
       connaissances doivent disparaître, pas être désactivées en silence. */
    await p.locator('#plan-open').click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('[data-plan="permanence"]').click();
    await p.waitForTimeout(900);

    const r = await p.evaluate(() => ({
      vocal: window.ALLY_STORE.can('voiceCommand'),
      ia: window.ALLY_STORE.can('aiCalls'),
      fab: !document.getElementById('voice-fab').hidden
    }));
    if (r.vocal || r.ia) throw new Error('les capacités de la formule supérieure sont restées');
    if (r.fab) throw new Error('le bouton « Parler à Ally » reste visible sans la capacité');
  });

  console.log('\n== Écrire à Ally, et que ce soit fait ==');

  /* La carte annonce « même moteur que la commande vocale : elle répond
     pareil ». C'était vrai des mots et faux des actes : le chat écrit ne
     rappelait jamais apply(). « Bloque mon agenda » répondait « c'est
     bloqué » et l'agenda restait libre. Un produit qui annonce une action
     qu'il ne fait pas est pire qu'un produit qui refuse. */
  const ouvrirSupport = async () => {
    await p.locator('#profile-card').click();
    await p.waitForTimeout(500);
    await p.locator('[data-account="help"]').click();
    await p.waitForSelector('#chat-form');
  };
  const ecrire = async (phrase) => {
    await p.fill('#chat-input', phrase);
    await p.locator('#chat-form button[type=submit]').click();
    await p.waitForTimeout(900);
  };

  await ouvrirSupport();

  await step('un ordre écrit change vraiment les données', async () => {
    const avant = ((await donnees()).blocked || []).length;
    await ecrire('bloque mon agenda demain après-midi');
    const apres = ((await donnees()).blocked || []).length;
    if (apres !== avant + 1) {
      throw new Error('Ally a répondu « c\'est bloqué » et rien n\'a bougé : ' + avant + ' → ' + apres);
    }
  });

  await step('et il en reste une trace', async () => {
    const journal = (await donnees()).voiceLog || [];
    if (!journal.some((e) => /bloque mon agenda/i.test(e.order))) {
      throw new Error('l\'ordre écrit n\'apparaît nulle part dans l\'historique');
    }
  });

  /* En confirmation systématique, la question s'affichait sans aucun moyen
     de répondre oui : l'ordre restait en suspens pour toujours. */
  await step('en confirmation systématique, rien ne part sans un oui', async () => {
    await p.evaluate(() => {
      window.ALLY_STORE.state.confirmLevel = 'always';
      window.ALLY_STORE.state.rules.transfer = false;
      window.ALLY_STORE.save();
    });
    await p.reload();
    await p.waitForTimeout(1400);
    await ouvrirSupport();

    await ecrire('transfère les urgences sur mon portable');

    const pose = await p.evaluate(() => window.ALLY_STORE.state.rules.transfer);
    if (pose) throw new Error('exécuté sans attendre la confirmation demandée');

    const boutons = await p.locator('.chat-follow .voice-chip-sm').allTextContents();
    if (!boutons.some((b) => /oui/i.test(b))) {
      throw new Error('la question est posée sans moyen d\'y répondre : ' + JSON.stringify(boutons));
    }
  });

  await step('et le oui exécute pour de bon', async () => {
    await p.locator('.chat-follow .voice-chip-sm', { hasText: 'Oui' }).first().click();
    await p.waitForTimeout(700);
    if (!await p.evaluate(() => window.ALLY_STORE.state.rules.transfer)) {
      throw new Error('« Oui » n\'a rien exécuté');
    }
  });

  await step('« Non » n\'exécute rien, et le dit', async () => {
    await p.evaluate(() => {
      window.ALLY_STORE.state.rules.transfer = false;
      window.ALLY_STORE.save();
    });
    await ecrire('transfère les urgences sur mon portable');
    await p.locator('.chat-follow .voice-chip-sm', { hasText: 'Non' }).first().click();
    await p.waitForTimeout(600);
    if (await p.evaluate(() => window.ALLY_STORE.state.rules.transfer)) {
      throw new Error('« Non » a exécuté quand même');
    }
    if (!/ne fais rien/i.test(await p.locator('#chat-log').innerText())) {
      throw new Error('l\'abandon ne se dit pas');
    }
  });

  /* On repose le réglage : la suite de la suite ne parle pas de confirmation. */
  await p.evaluate(() => {
    window.ALLY_STORE.state.confirmLevel = 'none';
    window.ALLY_STORE.save();
  });

  console.log('\n== Ce que le produit promet d\'envoyer ==');

  /* « Résumé envoyé à votre adresse » : rien ne partait. Aucun service
     d'envoi n'est branché, et l'affirmer donne au professionnel une confiance
     qu'il paiera le jour où il comptera sur un résumé jamais reçu. Le produit
     nomme ailleurs ses limites — il doit les nommer ici aussi. */
  await step('le résumé du jour ne se dit pas envoyé', async () => {
    await p.locator('.nav-item').nth(0).click();
    await p.waitForTimeout(700);
    await p.locator('.act-link, .btn', { hasText: 'résumé du jour' }).first().click();
    await p.waitForSelector('.flash', { timeout: 5000 });
    const dit = await p.locator('.flash').first().textContent();
    if (/envoyé/i.test(dit)) throw new Error('affirme un envoi qui n\'a pas lieu : « ' + dit + ' »');
    if (!/pas encore branché|prêt/i.test(dit)) throw new Error('message : « ' + dit + ' »');
  });

  await step('et les canaux d\'alerte disent lesquels fonctionnent', async () => {
    await p.locator('#profile-card').click();
    await p.waitForTimeout(500);
    await p.locator('[data-account="alerts"]').click();
    await p.waitForTimeout(600);
    const texte = await p.locator('#tabpanel').innerText();
    if (!/pas encore actifs/.test(texte)) {
      throw new Error('trois interrupteurs sans effet sont présentés comme des canaux qui marchent');
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
