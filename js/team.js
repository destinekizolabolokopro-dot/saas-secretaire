/* Ally — le cabinet à plusieurs.

   La formule Expert promet cinq collaborateurs. Jusqu'ici c'était une ligne
   dans une grille de tarifs : le compte était seul, et rien ne permettait d'en
   ajouter un second. Cette carte le fait pour de bon — inviter, retirer, voir
   qui a déjà rejoint.

   Le nombre de places vient de la formule, et il est compté côté serveur : un
   contrôle fait ici se contourne avec deux lignes dans la console du
   navigateur. Ce qui est affiché n'est qu'une politesse. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = {
    members: [], seats: 1, owner: false, meId: null, org: '',
    invited: null, error: null, busy: false, loaded: false
  };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ Vue */

  function view() {
    if (!api || !api.online() || !api.cabinetId()) return '';

    return '<div class="card live-card" data-team>' +
      '<div class="script-head">' +
        '<div>' +
          '<p class="card-title" style="margin-bottom:4px">Le cabinet' +
            '<span class="live-badge is-on">' + state.members.length + ' / ' + state.seats + '</span></p>' +
          '<p class="note">Les personnes qui partagent cette ligne. Chacune a son ' +
            'mot de passe et sa session ; toutes voient les mêmes appels et les ' +
            'mêmes emails, puisque c\'est le même cabinet.</p>' +
        '</div>' +
      '</div>' +
      (state.loaded ? body() : '<div class="empty">Lecture du serveur…</div>') +
    '</div>';
  }

  function body() {
    return list() + (state.owner ? inviteBox() : notOwner());
  }

  function list() {
    if (!state.members.length) return '';
    return '<div class="live-list">' + state.members.map(function (m) {
      var waiting = !m.verified;
      return '<div class="row">' +
        '<div class="row-main">' +
          '<p class="row-name">' + esc(m.email) +
            (m.id === state.meId ? ' <span class="chip-mini">vous</span>' : '') + '</p>' +
          '<p class="row-meta">' + (m.owner ? 'Responsable du cabinet'
            : waiting ? 'Invitation en attente' : 'Collaborateur') + '</p>' +
        '</div>' +
        '<div class="row-side">' +
          '<span class="badge-status ' + (waiting ? 'badge-pending' : 'badge-ok') + '">' +
            (waiting ? 'En attente' : 'Actif') + '</span>' +
          (state.owner && m.id !== state.meId
            ? '<button type="button" class="btn btn-ghost btn-sm" data-team-remove="' +
              esc(m.id) + '">Retirer</button>'
            : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function notOwner() {
    return '<p class="note note-sep" style="margin-top:16px">Seul le responsable ' +
      'du cabinet peut inviter ou retirer quelqu\'un. C\'est celui qui a créé le ' +
      'compte.</p>';
  }

  function inviteBox() {
    var full = state.members.length >= state.seats;

    return '<div class="live-connect" style="margin-top:18px">' +
      (full
        ? '<p class="note">Toutes les places de votre formule sont prises. La ' +
          'formule Expert en ouvre cinq.</p>'
        : '<div class="ob-field">' +
            '<label class="ob-label" for="team-email">Inviter un collaborateur</label>' +
            '<input class="field" id="team-email" type="email" autocomplete="off"' +
              ' placeholder="collegue@cabinet.fr">' +
          '</div>' +
          '<p class="auth-error" data-team-error hidden></p>' +
          '<div class="voice-try" style="margin-top:14px">' +
            '<button type="button" class="btn btn-primary btn-md" data-team-invite>' +
              'Envoyer l\'invitation</button>' +
          '</div>') +
      (state.invited ? invitation() : '') +
    '</div>';
  }

  /* Faute de serveur d'envoi, le lien et le code s'affichent : c'est au
     responsable de les transmettre. Le jour où l'envoi d'emails est branché,
     ce bloc disparaît — l'invité recevra le lien directement. */
  function invitation() {
    var link = window.location.origin + '/login.html?invite=' + state.invited.userId;
    return '<div class="code-sent" style="margin-top:16px">' +
      '<span>Invitation pour <strong>' + esc(state.invited.email) + '</strong> — code&nbsp;:</span> ' +
      '<code>' + esc(state.invited.code || '——————') + '</code>' +
      '<em>Transmettez ce lien et ce code : <br>' + esc(link) + '</em>' +
    '</div>';
  }

  /* -------------------------------------------------------------- Liaison */

  function refresh(rerender) {
    if (!api.online() || !api.cabinetId() || state.busy) return;
    state.busy = true;

    api.me().then(function (res) {
      state.busy = false;
      if (!res.ok || !res.body.authenticated) { api.forget(); if (rerender) rerender(); return; }

      var before = state.members.map(function (m) { return m.id + ':' + m.verified; }).join(',');
      state.members = res.body.members || [];
      state.seats = res.body.seats || 1;
      state.owner = !!res.body.owner;
      state.meId = res.body.userId;
      state.org = (res.body.cabinet && res.body.cabinet.org) || '';
      var after = state.members.map(function (m) { return m.id + ':' + m.verified; }).join(',');

      var first = !state.loaded;
      state.loaded = true;
      if (rerender && (first || before !== after)) rerender();
    }).catch(function () { state.busy = false; });
  }

  function bind(panel, rerender) {
    if (!api || !api.online()) return;
    var host = panel.querySelector('[data-team]');
    if (!host) return;

    var invite = host.querySelector('[data-team-invite]');
    if (invite) {
      invite.addEventListener('click', function () {
        var field = host.querySelector('#team-email');
        var box = host.querySelector('[data-team-error]');
        if (!field.value || field.value.indexOf('@') < 1) { field.focus(); return; }

        invite.disabled = true;
        invite.textContent = 'Envoi…';

        api.invite(field.value).then(function (res) {
          if (!res.ok) {
            box.textContent = (res.body && res.body.error) || 'Invitation refusée.';
            box.hidden = false;
            invite.disabled = false;
            invite.textContent = 'Envoyer l\'invitation';
            return;
          }
          state.invited = {
            userId: res.body.userId, email: res.body.email, code: res.body.devCode
          };
          state.loaded = false;   /* force un rendu après la relecture */
          refresh(rerender);
          if (rerender) rerender();
        }).catch(function () {
          box.textContent = 'Serveur injoignable.';
          box.hidden = false;
          invite.disabled = false;
          invite.textContent = 'Envoyer l\'invitation';
        });
      });
    }

    host.querySelectorAll('[data-team-remove]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        api.removeMember(button.getAttribute('data-team-remove')).then(function () {
          state.loaded = false;
          refresh(rerender);
          if (rerender) rerender();
        }).catch(function () { button.disabled = false; });
      });
    });

    refresh(rerender);
  }

  window.ALLY_TEAM = { view: view, bind: bind, refresh: refresh };
})();
