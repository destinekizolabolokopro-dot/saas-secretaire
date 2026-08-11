/* Ally — la ligne réelle.

   Tout le reste de la maquette tourne dans le navigateur. Cette carte-ci est la
   seule qui parle au serveur : elle affiche les appels réellement reçus par
   l'API, c'est-à-dire ceux que l'agent vocal lui a transmis.

   Elle n'apparaît que si une API répond. Sans serveur — fichier ouvert par
   double-clic, page servie par un simple hébergeur statique — elle reste
   masquée : mieux vaut ne rien montrer qu'un panneau vide et inexplicable. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = { calls: [], error: null, busy: false, timer: null };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clock(at) {
    var d = new Date(at);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
      (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  /* ------------------------------------------------------------------ Vue */

  function view() {
    if (!api || !api.online()) return '';

    var connected = !!api.cabinetId();

    return '<div class="card live-card" data-live>' +
      '<div class="script-head">' +
        '<div>' +
          '<p class="card-title" style="margin-bottom:4px">La ligne réelle' +
            '<span class="live-badge' + (connected ? ' is-on' : '') + '">' +
            (connected ? 'connectée' : 'serveur détecté') + '</span></p>' +
          '<p class="note">Les appels transmis par l\'agent vocal arrivent ici. ' +
            'C\'est le seul endroit de la maquette qui lise de vraies données ' +
            'du serveur, et non celles du navigateur.</p>' +
        '</div>' +
      '</div>' +

      (connected ? liveList() : connectForm()) +
    '</div>';
  }

  function connectForm() {
    return '<div class="live-connect">' +
      '<p class="note" style="margin-bottom:14px">Ce navigateur n\'est rattaché à ' +
        'aucun cabinet du serveur. Connectez-vous pour voir la ligne.</p>' +
      '<div class="ob-grid-2">' +
        '<div class="ob-field">' +
          '<label class="ob-label" for="live-email">Email</label>' +
          '<input class="field" id="live-email" type="email" autocomplete="email"' +
            ' placeholder="vous@cabinet.fr"></div>' +
        '<div class="ob-field">' +
          '<label class="ob-label" for="live-pass">Mot de passe</label>' +
          '<input class="field" id="live-pass" type="password" autocomplete="current-password"></div>' +
      '</div>' +
      '<p class="auth-error" data-live-error hidden></p>' +
      '<div class="voice-try" style="margin-top:16px">' +
        '<button type="button" class="btn btn-primary btn-md" data-live-login>Connecter la ligne</button>' +
      '</div>' +
    '</div>';
  }

  function liveList() {
    if (state.error) {
      return '<p class="lock-note">' + esc(state.error) + '</p>';
    }
    if (!state.calls.length) {
      return '<div class="empty">Aucun appel reçu pour l\'instant. ' +
        'La liste se met à jour toute seule.</div>' + footer();
    }

    return '<div class="live-list">' + state.calls.slice().reverse().map(function (call) {
      var tone = call.outcome === 'transferred' ? 'badge-urgent'
        : call.outcome === 'noted' ? 'badge-pending' : 'badge-ok';
      var label = call.outcome === 'transferred' ? 'Transféré'
        : call.outcome === 'noted' ? 'Message pris' : 'Traité';

      return '<div class="row">' +
        '<div class="row-main">' +
          '<p class="row-name">' + esc(call.from || 'Numéro inconnu') + '</p>' +
          '<p class="row-meta">' + esc(call.summary || 'Sans résumé') + '</p>' +
        '</div>' +
        '<div class="row-side">' +
          '<span class="badge-status ' + tone + '">' + label + '</span>' +
          '<span class="row-meta">' + clock(call.at || call.createdAt) + '</span>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>' + footer();
  }

  function footer() {
    return '<p class="note note-sep" style="margin-top:16px">' +
      state.calls.length + ' appel' + (state.calls.length > 1 ? 's' : '') +
      ' sur cette ligne. Le résumé est chiffré en base : il n\'est lisible que ' +
      'par votre cabinet, jamais par l\'administrateur de la plateforme.' +
    '</p>';
  }

  /* -------------------------------------------------------------- Liaison */

  /* Empreinte de ce qui est affiché. Sans elle, chaque réponse du serveur
     provoquait un re-rendu, qui rebranchait la carte, qui relançait une
     requête : le navigateur interrogeait le serveur en boucle serrée — 524
     requêtes en 6 secondes au lieu de 2. On ne redessine que si quelque chose
     a changé, ce qui évite au passage de perdre le défilement à chaque appel. */
  function signature() {
    return (state.error || '') + '|' + state.calls.map(function (call) {
      return call.id + ':' + call.outcome;
    }).join(',');
  }

  function refresh(rerender) {
    if (!api.online() || !api.cabinetId() || state.busy) return;
    state.busy = true;
    var before = signature();

    api.calls().then(function (res) {
      state.busy = false;
      if (res.status === 401) {
        /* Session expirée côté serveur : on repasse au formulaire plutôt que
           de boucler sur des erreurs invisibles. */
        api.forget();
        state.calls = [];
        if (rerender) rerender();
        return;
      }
      if (!res.ok) { state.error = res.body.error || 'Le serveur a refusé la demande.'; }
      else { state.error = null; state.calls = res.body.calls || []; }
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
    var host = panel.querySelector('[data-live]');
    if (!host) return;

    var loginBtn = host.querySelector('[data-live-login]');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        var email = host.querySelector('#live-email').value;
        var pass = host.querySelector('#live-pass').value;
        var box = host.querySelector('[data-live-error]');

        api.login(email, pass).then(function (res) {
          if (!res.ok) {
            box.textContent = res.body.error === 'unverified'
              ? 'Ce compte n\'a pas encore vérifié son adresse.'
              : (res.body.error || 'Connexion refusée.');
            box.hidden = false;
            return;
          }
          api.remember(res.body);
          refresh(rerender);
          if (rerender) rerender();
          /* La barre latérale annonce où vivent les données : elle passe de
             « serveur détecté » à « ligne connectée ». */
          if (window.ALLY_CHROME_REFRESH) window.ALLY_CHROME_REFRESH();
        }).catch(function () {
          box.textContent = 'Serveur injoignable.';
          box.hidden = false;
        });
      });
    }

    /* Rafraîchissement pendant que l'onglet est affiché. Le minuteur est
       remplacé à chaque liaison : sans cela, changer d'onglet dix fois
       laisserait dix minuteurs actifs. */
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(function () {
      if (!document.body.contains(host)) {
        window.clearInterval(state.timer);
        state.timer = null;
        return;
      }
      refresh(rerender);
    }, 5000);

    refresh(rerender);
  }

  window.ALLY_LIVE = { view: view, bind: bind, refresh: refresh };
})();
