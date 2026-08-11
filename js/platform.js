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

  var state = { stats: null, cabinets: [], events: [], error: null, busy: false, timer: null };

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
          '<p class="note">Tout le reste de cette console lit l\'annuaire de ' +
            'démonstration du navigateur. Ces chiffres-ci viennent du serveur : ' +
            'ce sont les comptes qui existent vraiment.</p>' +
        '</div>' +
      '</div>' +
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

  function cabinets() {
    if (!state.cabinets.length) {
      return '<div class="empty" style="margin-top:16px">Aucun cabinet inscrit sur ce ' +
        'serveur pour l\'instant.</div>';
    }
    return '<div class="live-list" style="margin-top:16px">' +
      state.cabinets.slice().reverse().slice(0, 8).map(function (c) {
        return '<div class="row">' +
          '<div class="row-main">' +
            '<p class="row-name">' + esc(c.org || 'Cabinet') + '</p>' +
            '<p class="row-meta">' + esc(c.members) + ' membre' + (c.members > 1 ? 's' : '') +
              ' · ' + esc(c.calls) + ' appel' + (c.calls > 1 ? 's' : '') +
              ' · ' + esc(c.messages) + ' email' + (c.messages > 1 ? 's' : '') + '</p>' +
          '</div>' +
          '<div class="row-side">' +
            '<span class="badge-status badge-ok">' + esc(c.plan || 'cabinet') + '</span>' +
            '<span class="row-meta">' + window.ALLY_DATE(c.createdAt) + '</span>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
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
      state.cabinets.length + '|' + (state.events[0] ? state.events[0].at : '');
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
