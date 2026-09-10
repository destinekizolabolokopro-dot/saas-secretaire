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
    /* Le message d'erreur vit au niveau de la carte, et non dans le bloc
       d'invitation : un retrait refusé par le serveur doit pouvoir se dire
       même quand toutes les places sont prises et que ce bloc a disparu. */
    return list() +
      '<p class="auth-error" id="team-error" role="alert" data-team-error hidden></p>' +
      (state.owner ? inviteBox() : notOwner());
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
              ' aria-describedby="team-error" placeholder="collegue@cabinet.fr">' +
          '</div>' +
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

      /* Le cartouche d'invitation restait affiché après coup : on retirait la
         personne, et l'écran continuait de proposer son lien et son code —
         qui ne menaient plus à rien. Il ne vaut que tant que l'invitation est
         en attente. */
      if (state.invited) {
        var toujours = state.members.filter(function (m) {
          return m.id === state.invited.userId && !m.verified;
        })[0];
        if (!toujours) state.invited = null;
      }

      var first = !state.loaded;
      state.loaded = true;
      if (rerender && (first || before !== after)) rerender();
    }).catch(function () { state.busy = false; });
  }

  function bind(panel, rerender) {
    if (!api || !api.online()) return;
    var host = panel.querySelector('[data-team]');
    if (!host) return;

    var champ = host.querySelector('#team-email');
    var boite = host.querySelector('[data-team-error]');

    function dire(message) {
      if (!boite) return;
      boite.textContent = message;
      boite.hidden = !message;
      if (champ) champ.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    /* Une adresse est refusée par le serveur, pas par une expression
       régulière : le seul examen qui vaille est de vérifier qu'elle a une
       forme plausible avant de partir, et de dire pourquoi sinon. Le champ
       se contentait de reprendre le focus, sans un mot — le responsable
       recliquait sur « Envoyer » en se demandant ce qui n'allait pas. */
    function plausible(valeur) {
      var v = String(valeur || '').trim();
      if (!v) return 'Indiquez l\'adresse email de votre collaborateur.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        return '« ' + v + ' » n\'est pas une adresse email.';
      }
      var deja = state.members.filter(function (m) {
        return String(m.email || '').toLowerCase() === v.toLowerCase();
      })[0];
      if (deja) {
        return deja.verified
          ? 'Cette personne fait déjà partie du cabinet.'
          : 'Cette personne a déjà été invitée ; elle n\'a pas encore rejoint.';
      }
      return null;
    }

    var invite = host.querySelector('[data-team-invite]');

    function envoyer() {
      var valeur = champ ? champ.value.trim() : '';
      var souci = plausible(valeur);
      if (souci) { dire(souci); if (champ) champ.focus(); return; }
      dire('');

      invite.disabled = true;
      invite.textContent = 'Envoi…';

      api.invite(valeur).then(function (res) {
        if (!res.ok) {
          dire((res.body && res.body.error) || 'Invitation refusée.');
          invite.disabled = false;
          invite.textContent = 'Envoyer l\'invitation';
          if (champ) champ.focus();
          return;
        }
        state.invited = {
          userId: res.body.userId, email: res.body.email, code: res.body.devCode
        };
        state.loaded = false;   /* force un rendu après la relecture */
        refresh(rerender);
        if (rerender) rerender();
      }).catch(function () {
        dire('Serveur injoignable. L\'invitation n\'est pas partie.');
        invite.disabled = false;
        invite.textContent = 'Envoyer l\'invitation';
      });
    }

    if (invite) invite.addEventListener('click', envoyer);
    /* Entrée dans un champ email doit envoyer : la carte n'est pas un
       formulaire, il faut donc le faire à la main. */
    if (champ) {
      champ.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); envoyer(); }
      });
      champ.addEventListener('input', function () { dire(''); });
    }

    /* Retirer quelqu'un lui coupe l'accès au cabinet — ses appels, ses
       emails, son agenda. C'était un clic, sans retour possible et sans que
       rien ne prévienne. Le premier clic arme et nomme la conséquence, le
       second exécute ; l'armement retombe seul au bout de cinq secondes pour
       qu'un bouton oublié ne reste pas chargé. */
    host.querySelectorAll('[data-team-remove]').forEach(function (button) {
      var libelle = button.textContent;
      var minuteur = null;

      function desarmer() {
        window.clearTimeout(minuteur);
        button.removeAttribute('data-armed');
        button.textContent = libelle;
      }

      button.addEventListener('click', function () {
        if (!button.getAttribute('data-armed')) {
          host.querySelectorAll('[data-team-remove][data-armed]').forEach(function (autre) {
            if (autre !== button) autre.dispatchEvent(new CustomEvent('team-desarme'));
          });
          button.setAttribute('data-armed', '1');
            button.textContent = 'Confirmer le retrait';
          minuteur = window.setTimeout(desarmer, 5000);
          return;
        }

        window.clearTimeout(minuteur);
        button.disabled = true;
        button.textContent = 'Retrait…';

        api.removeMember(button.getAttribute('data-team-remove')).then(function (res) {
          /* Un refus du serveur ressemblait à une réussite : on rafraîchissait
             la liste et la personne y était toujours, sans un mot. */
          if (res && res.ok === false) {
            dire((res.body && res.body.error) || 'Le serveur a refusé ce retrait.');
            button.disabled = false;
            desarmer();
            return;
          }
          state.loaded = false;
          refresh(rerender);
          if (rerender) rerender();
        }).catch(function () {
          dire('Serveur injoignable. Personne n\'a été retiré.');
          button.disabled = false;
          desarmer();
        });
      });

      button.addEventListener('team-desarme', desarmer);
    });

    refresh(rerender);
  }

  window.ALLY_TEAM = { view: view, bind: bind, refresh: refresh };
})();
