/* Ally — la plateforme réelle.

   Pendant administrateur de js/live.js. La console d'administration montre par
   défaut l'annuaire de démonstration du navigateur : seize cabinets fictifs,
   des revenus inventés, un journal simulé. C'est ce qu'il faut pour concevoir
   l'écran, et c'est faux.

   Cette carte-ci montre l'autre chose : ce que le serveur sait vraiment. Le
   nombre de cabinets réellement inscrits, les sessions ouvertes en ce moment,
   le journal des événements — et rien d'autre. Pas un résumé d'appel, pas une
   ligne d'email : l'API d'administration n'en renvoie pas, par conception.

   Sans serveur, ou sans session administrateur sur ce serveur, elle ne
   s'affiche pas. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = {
    stats: null, cabinets: [], events: [], error: null, busy: false, timer: null,
    /* Le cabinet dont la fiche est ouverte, et ce que le serveur en dit. */
    ouvert: null, fiche: null, ficheErreur: null, ficheBusy: false,
    /* Message de la dernière action — un refus du serveur ne doit pas se
       perdre dans une boîte du navigateur. */
    dit: null
  };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Le journal du serveur n'est pas écrit pour être lu par un humain : il porte
     des identifiants et des noms d'action. On traduit, sans rien inventer. */
  var ACTIONS = {
    signup: 'Inscription', verified: 'Adresse confirmée', login: 'Connexion',
    'login-failed': 'Échec de connexion', logout: 'Déconnexion',
    'code-issued': 'Code envoyé', 'password-reset': 'Mot de passe réinitialisé',
    'call-received': 'Appel reçu', 'message-sent': 'Email parti',
    'webhook-rejected': 'Webhook refusé', 'admin-created': 'Administrateur créé',
    'admin-promoted': 'Rôle administrateur accordé'
  };

  function clock(at) {
    var d = new Date(at);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
      (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  /* ------------------------------------------------------------------ Vue */

  function view() {
    if (!api || !api.online() || api.role() !== 'admin') return '';

    return '<div class="card live-card" data-platform>' +
      '<div class="script-head">' +
        '<div>' +
          '<p class="card-title" style="margin-bottom:4px">La plateforme réelle' +
            '<span class="live-badge is-on">serveur</span></p>' +
          '<p class="note">Les cabinets qui existent vraiment, et ce qu\'on peut ' +
            'leur faire : ouvrir une ligne, ajuster une formule, couper un accès, ' +
            'confirmer une adresse bloquée, tout effacer. Le reste de cette console ' +
            'lit l\'annuaire de démonstration du navigateur.</p>' +
        '</div>' +
      '</div>' +
      (state.dit ? '<p class="alert-warn" style="margin-top:4px">' + esc(state.dit) + '</p>' : '') +
      body() +
    '</div>';
  }

  function body() {
    if (state.error) return '<p class="lock-note">' + esc(state.error) + '</p>';
    if (!state.stats) return '<div class="empty">Lecture du serveur…</div>';

    var s = state.stats;
    return '' +
      '<div class="stat-grid stat-grid-4" style="margin-top:4px">' +
        stat('Cabinets inscrits', s.cabinets, s.users + ' compte' + (s.users > 1 ? 's' : '')) +
        stat('Sessions ouvertes', s.sessions, 'jetons encore valables', 'cyan') +
        stat('Appels reçus', s.calls, 'transmis par l\'agent vocal') +
        stat('Emails en base', s.messages, 'file d\'envoi comprise') +
      '</div>' +
      cabinets() +
      events() +
      '<p class="note note-sep" style="margin-top:16px">Aucun résumé d\'appel ni ' +
        'corps d\'email n\'apparaît ici : l\'API d\'administration n\'en renvoie pas. ' +
        'Un administrateur capable de lire les dossiers de ses clients avocats ' +
        'serait un risque, pas une fonction.</p>';
  }

  function stat(label, value, foot, tone) {
    return '<div class="stat"><p class="stat-label">' + esc(label) + '</p>' +
      '<p class="stat-value' + (tone ? ' ' + tone : '') + '">' + esc(value) + '</p>' +
      '<p class="stat-foot">' + esc(foot) + '</p></div>';
  }

  /* La liste n'en montrait que huit, sans moyen d'en voir un de près : on
     savait qu'un cabinet existait, pas ce qui lui arrivait. Chaque ligne
     s'ouvre maintenant sur sa fiche. */
  function cabinets() {
    if (!state.cabinets.length) {
      return '<div class="empty" style="margin-top:16px">Aucun cabinet inscrit sur ce ' +
        'serveur pour l\'instant.</div>';
    }

    return '<p class="card-title" style="margin-top:22px">Cabinets</p>' +
      '<div class="live-list">' +
      state.cabinets.slice().reverse().map(function (c) {
        var ouvert = state.ouvert === c.id;
        return '<div class="conv' + (c.suspended ? ' is-urgent' : '') + '">' +
          '<button type="button" class="conv-head" data-cabinet="' + esc(c.id) + '"' +
            ' aria-expanded="' + ouvert + '">' +
            '<span class="conv-main">' +
              '<span class="conv-who">' + esc(c.org || 'Cabinet') + '</span>' +
              '<span class="conv-sub">' + esc(c.members) + ' membre' + (c.members > 1 ? 's' : '') +
                ' · ' + esc(c.calls) + ' appel' + (c.calls > 1 ? 's' : '') +
                ' · ' + esc(c.messages) + ' email' + (c.messages > 1 ? 's' : '') +
                ' · inscrit le ' + window.ALLY_DATE(c.createdAt) + '</span>' +
            '</span>' +
            '<span class="conv-right">' +
              (c.suspended
                ? '<span class="badge-status badge-urgent">Suspendu</span>'
                : '') +
              '<span class="badge-status ' + (c.line && c.line.numero ? 'badge-ok' : 'badge-pending') + '">' +
                esc(c.line && c.line.numero ? c.line.numero : 'Sans ligne') + '</span>' +
              '<span class="tag">' + esc(c.plan || 'cabinet') + '</span>' +
            '</span>' +
          '</button>' +
          (ouvert ? '<div class="conv-body">' + fiche(c) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
  }

  /* La fiche : ce que le serveur sait, et les gestes qui engagent. */
  function fiche(c) {
    if (state.ficheErreur) return '<p class="lock-note">' + esc(state.ficheErreur) + '</p>';
    if (!state.fiche || state.fiche.cabinet.id !== c.id) {
      return '<div class="empty">Lecture de la fiche…</div>';
    }

    var f = state.fiche;
    var suspendu = !!f.cabinet.suspended;

    return '<div class="tri-row"><span>Métier</span><span>' + esc(f.cabinet.trade) +
        '</span><span>' + (f.configuree ? 'configuré' : 'questionnaire non terminé') + '</span></div>' +
      '<div class="tri-row"><span>Sessions ouvertes</span><span>' + esc(f.sessions) +
        '</span><span>' + esc(f.volumes.rendezVous) + ' rendez-vous</span></div>' +

      '<p class="sub-label" style="margin-top:18px">Membres</p>' +
      '<div class="live-list">' + f.membres.map(function (m) {
        return '<div class="row">' +
          '<div class="row-main">' +
            '<p class="row-name">' + esc(m.email) + '</p>' +
            '<p class="row-meta">' + (m.owner ? 'Responsable' : 'Collaborateur') +
              (m.role === 'admin' ? ' · plateforme' : '') + '</p>' +
          '</div>' +
          '<div class="row-side">' +
            (m.verified
              ? '<span class="badge-status badge-ok">Confirmé</span>'
              : '<span class="badge-status badge-pending">' +
                (m.enAttente ? 'Invitation en attente' : 'Adresse non confirmée') + '</span>') +
            (m.verified ? ''
              : '<button type="button" class="btn btn-ghost btn-sm" data-verifier="' +
                esc(m.id) + '">Confirmer à la main</button>') +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +

      '<p class="sub-label" style="margin-top:18px">Formule — ' + esc(f.places) +
        ' place' + (f.places > 1 ? 's' : '') + '</p>' +
      '<div class="choice-row" role="group" aria-label="Formule du cabinet">' +
        ['permanence', 'cabinet', 'expert'].map(function (id) {
          return '<button type="button" class="choice" data-formule="' + id + '"' +
            ' aria-pressed="' + (f.cabinet.plan === id) + '">' + id + '</button>';
        }).join('') +
      '</div>' +

      '<p class="sub-label" style="margin-top:18px">Ligne téléphonique</p>' +
      '<div class="block-form">' +
        '<label class="sr-only" for="plat-numero">Numéro attribué</label>' +
        '<input class="field" id="plat-numero" type="tel" placeholder="0X XX XX XX XX"' +
          ' value="' + esc(f.cabinet.line && f.cabinet.line.numero ? f.cabinet.line.numero : '') + '">' +
        '<label class="sr-only" for="plat-operateur">Opérateur</label>' +
        '<input class="field" id="plat-operateur" placeholder="Opérateur"' +
          ' style="max-width:180px" value="' +
          esc(f.cabinet.line && f.cabinet.line.operateur ? f.cabinet.line.operateur : '') + '">' +
        '<button type="button" class="btn btn-primary btn-sm" data-poser>Attribuer</button>' +
        (f.cabinet.line ? '<button type="button" class="btn btn-ghost btn-sm" data-liberer>' +
          'Libérer</button>' : '') +
      '</div>' +
      '<p class="note" style="margin-top:10px">C\'est le numéro sur lequel Ally décroche ' +
        'pour ce cabinet, et celui qui apparaît dans ses codes de renvoi. Tant qu\'il ' +
        'n\'est pas posé, le professionnel n\'a rien à composer.</p>' +

      '<p class="sub-label" style="margin-top:18px">Accès</p>' +
      (suspendu
        ? '<p class="note" style="margin-bottom:12px">Suspendu le ' +
            window.ALLY_DATE(f.cabinet.suspended.at) +
            (f.cabinet.suspended.motif ? ' — ' + esc(f.cabinet.suspended.motif) : '') +
            '. Personne de ce cabinet ne peut se connecter.</p>' +
          '<div class="voice-try"><button type="button" class="btn btn-primary btn-md" ' +
            'data-rouvrir>Rouvrir l\'accès</button></div>'
        : '<div class="block-form">' +
            '<label class="sr-only" for="plat-motif">Motif</label>' +
            '<input class="field" id="plat-motif" placeholder="Motif — impayé, demande du client…">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-suspendre>' +
              'Suspendre l\'accès</button>' +
          '</div>' +
          '<p class="note" style="margin-top:10px">La suspension coupe l\'accès de tout ' +
            'le cabinet et ferme ses sessions ouvertes. Elle se rouvre.</p>') +

      '<p class="sub-label" style="margin-top:18px">Effacement</p>' +
      '<div class="voice-try">' +
        '<button type="button" class="btn btn-danger btn-md" data-effacer>' +
          'Supprimer ce cabinet</button>' +
      '</div>' +
      '<p class="note" style="margin-top:10px">Comptes, appels, emails, rendez-vous : tout ' +
        'part, sans corbeille. C\'est ce qu\'exige le droit à l\'effacement quand la ' +
        'demande arrive par courrier plutôt que par l\'écran du client.</p>';
  }

  /* Le journal ne porte que des identifiants. Un identifiant de cabinet, on
     sait le traduire ; un identifiant de compte, non — l'API d'administration
     ne renvoie ni les adresses ni les noms, et c'est très bien ainsi. */
  function who(detail) {
    if (!detail || !detail.cabinetId) return 'plateforme';
    var found = null;
    state.cabinets.forEach(function (c) { if (c.id === detail.cabinetId) found = c; });
    return found ? found.org : detail.cabinetId;
  }

  function events() {
    if (!state.events.length) return '';
    return '<p class="card-title" style="margin-top:22px">Journal du serveur</p>' +
      '<div class="live-list">' + state.events.slice(0, 8).map(function (e) {
        return '<div class="row">' +
          '<div class="row-main">' +
            '<p class="row-name">' + esc(ACTIONS[e.action] || e.action) + '</p>' +
            '<p class="row-meta">' + esc(who(e.detail)) + '</p>' +
          '</div>' +
          '<div class="row-side"><span class="row-meta">' + clock(e.at) + '</span></div>' +
        '</div>';
      }).join('') + '</div>';
  }

  /* -------------------------------------------------------------- Liaison */

  /* Empreinte de ce qui est affiché : on ne redessine que si elle change. Un
     re-rendu systématique rebrancherait la carte, qui relancerait une requête,
     qui redessinerait — le serveur serait interrogé en boucle serrée. */
  function signature() {
    return (state.error || '') + '|' + JSON.stringify(state.stats) + '|' +
      state.cabinets.length + '|' + (state.events[0] ? state.events[0].at : '') + '|' +
      (state.ouvert || '') + '|' + JSON.stringify(state.fiche) + '|' +
      (state.ficheErreur || '') + '|' + (state.dit || '');
  }

  /* Lecture d'une fiche. Elle ne passe pas par le rafraîchissement périodique :
     on la demande quand on ouvre, et après chaque geste qui la change. */
  function lireFiche(cabinetId, rerender) {
    state.ficheBusy = true;
    state.ficheErreur = null;
    api.adminCabinet(cabinetId).then(function (res) {
      state.ficheBusy = false;
      if (!res.ok) {
        state.fiche = null;
        state.ficheErreur = (res.body && res.body.error) || 'Fiche illisible.';
      } else {
        state.fiche = res.body;
      }
      if (rerender) rerender();
    }).catch(function () {
      state.ficheBusy = false;
      state.fiche = null;
      state.ficheErreur = 'Serveur injoignable.';
      if (rerender) rerender();
    });
  }

  function refresh(rerender) {
    if (!api.online() || api.role() !== 'admin' || state.busy) return;
    state.busy = true;
    var before = signature();

    Promise.all([api.adminStats(), api.adminEvents()]).then(function (results) {
      state.busy = false;
      var stats = results[0], events = results[1];

      if (stats.status === 401 || stats.status === 403) {
        /* Session tombée, ou rôle retiré : on cesse d'afficher plutôt que de
           boucler sur des refus invisibles. */
        api.forget();
        state.stats = null;
        if (rerender && signature() !== before) rerender();
        return;
      }
      if (!stats.ok) { state.error = stats.body.error || 'Le serveur a refusé la demande.'; }
      else {
        state.error = null;
        state.stats = stats.body.stats;
        state.cabinets = stats.body.cabinets || [];
        state.events = (events.ok && events.body.events) || [];
      }
      if (rerender && signature() !== before) rerender();
    }).catch(function () {
      state.busy = false;
      var was = state.error;
      state.error = 'Serveur injoignable.';
      if (rerender && was !== state.error) rerender();
    });
  }

  function bind(panel, rerender) {
    if (!api || !api.online()) return;
    var host = panel.querySelector('[data-platform]');
    if (!host) return;

    var id = state.ouvert;

    /* Un geste, et ce que le serveur en dit. Les refus passaient par
       window.alert — une boîte du navigateur, étrangère au produit, que
       certains contextes bloquent purement et simplement : le clic ne faisait
       alors rien du tout. */
    function agir(promesse, bouton, libelleEnCours) {
      var libelle = bouton ? bouton.textContent : '';
      if (bouton) { bouton.disabled = true; bouton.textContent = libelleEnCours || 'En cours…'; }
      state.dit = null;

      return promesse.then(function (res) {
        if (!res.ok) {
          state.dit = (res.body && res.body.error) || 'Le serveur a refusé ce geste.';
          if (bouton) { bouton.disabled = false; bouton.textContent = libelle; }
          if (rerender) rerender();
          return false;
        }
        /* La liste et la fiche changent toutes les deux : on relit les deux. */
        state.stats = null;
        refresh(rerender);
        if (state.ouvert) lireFiche(state.ouvert, rerender);
        else if (rerender) rerender();
        return true;
      }).catch(function () {
        state.dit = 'Serveur injoignable — rien n\'a été fait.';
        if (bouton) { bouton.disabled = false; bouton.textContent = libelle; }
        if (rerender) rerender();
        return false;
      });
    }

    /* Deux temps avant ce qui coupe ou détruit — le geste déjà employé
       partout ailleurs dans le produit. */
    function deuxTemps(bouton, libelleArme, faire) {
      if (!bouton) return;
      var libelle = bouton.textContent;
      var minuteur = null;

      function desarmer() {
        window.clearTimeout(minuteur);
        bouton.removeAttribute('data-armed');
        bouton.textContent = libelle;
      }

      bouton.addEventListener('click', function () {
        if (!bouton.getAttribute('data-armed')) {
          bouton.setAttribute('data-armed', '1');
          bouton.textContent = libelleArme;
          minuteur = window.setTimeout(desarmer, 5000);
          return;
        }
        window.clearTimeout(minuteur);
        faire();
      });
    }

    host.querySelectorAll('[data-cabinet]').forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        var cible = bouton.getAttribute('data-cabinet');
        state.dit = null;
        if (state.ouvert === cible) {
          state.ouvert = null;
          state.fiche = null;
          if (rerender) rerender();
          return;
        }
        state.ouvert = cible;
        state.fiche = null;
        state.ficheErreur = null;
        if (rerender) rerender();
        lireFiche(cible, rerender);
      });
    });

    host.querySelectorAll('[data-verifier]').forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        agir(api.adminVerify(bouton.getAttribute('data-verifier')), bouton, 'Confirmation…');
      });
    });

    host.querySelectorAll('[data-formule]').forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        agir(api.adminPlan(id, bouton.getAttribute('data-formule')), bouton, '…');
      });
    });

    var poser = host.querySelector('[data-poser]');
    if (poser) {
      poser.addEventListener('click', function () {
        var numero = host.querySelector('#plat-numero').value.trim();
        var operateur = host.querySelector('#plat-operateur').value.trim();
        if (!numero) {
          state.dit = 'Indiquez le numéro sur lequel Ally doit décrocher.';
          if (rerender) rerender();
          return;
        }
        agir(api.assignLine(id, numero, operateur), poser, 'Attribution…');
      });
    }

    deuxTemps(host.querySelector('[data-liberer]'),
      'Confirmer — ce cabinet n\'aura plus de ligne',
      function () { agir(api.assignLine(id, null), null); });

    deuxTemps(host.querySelector('[data-suspendre]'),
      'Confirmer — personne de ce cabinet ne pourra plus se connecter',
      function () {
        var champ = host.querySelector('#plat-motif');
        agir(api.adminSuspend(id, champ ? champ.value.trim() : ''), null);
      });

    var rouvrir = host.querySelector('[data-rouvrir]');
    if (rouvrir) {
      rouvrir.addEventListener('click', function () {
        agir(api.adminReactivate(id), rouvrir, 'Réouverture…');
      });
    }

    deuxTemps(host.querySelector('[data-effacer]'),
      'Confirmer la suppression définitive',
      function () {
        var parti = id;
        agir(api.adminDelete(parti), null).then(function (ok) {
          if (!ok) return;
          state.ouvert = null;
          state.fiche = null;
          state.dit = 'Cabinet supprimé — comptes, appels, emails et rendez-vous compris.';
          if (rerender) rerender();
        });
      });

    /* Un seul minuteur : sans ce remplacement, changer d'onglet dix fois en
       laisserait dix qui interrogent le serveur en parallèle. */
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(function () {
      if (!document.body.contains(host)) {
        window.clearInterval(state.timer);
        state.timer = null;
        return;
      }
      refresh(rerender);
    }, 10000);

    refresh(rerender);
  }

  window.ALLY_PLATFORM = { view: view, bind: bind, refresh: refresh };
})();
