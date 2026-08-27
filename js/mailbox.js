/* Ally — les emails réellement en file.

   Pendant de js/live.js pour le courrier. Quand une ligne réelle est connectée,
   valider un brouillon ne fait plus semblant : l'email entre dans la file du
   serveur, où il attend les mêmes dix secondes avant de partir. Cette carte
   montre cette file — en attente, parti, annulé — et permet de rattraper un
   envoi depuis n'importe quel appareil, pas seulement celui qui l'a lancé.

   Le corps du message est chiffré en base. Il n'est lisible que par le cabinet
   qui l'a écrit, jamais par l'administrateur de la plateforme. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = { messages: [], error: null, busy: false, timer: null };

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

  var STATES = {
    queued:    { label: 'En attente', css: 'badge-pending' },
    sent:      { label: 'Parti',      css: 'badge-ok' },
    cancelled: { label: 'Annulé',     css: 'badge-urgent' }
  };

  /* ------------------------------------------------------------------ Vue */

  function view() {
    if (!api || !api.online() || !api.cabinetId()) return '';

    return '<div class="card live-card" data-mailbox>' +
      '<div class="script-head">' +
        '<div>' +
          '<p class="card-title" style="margin-bottom:4px">La file d\'envoi' +
            '<span class="live-badge is-on">connecté</span></p>' +
          '<p class="note">Les emails validés ici entrent dans la file du serveur. ' +
            'Ils y attendent dix secondes : tant qu\'ils sont en attente, on peut ' +
            'les rattraper depuis n\'importe quel appareil. Une fois partis, ils ' +
            'rejoignent la liste des envois, plus bas.</p>' +
        '</div>' +
      '</div>' +
      body() +
    '</div>';
  }

  /* Ce qui est encore en vol, et rien d'autre. La carte listait aussi les
     emails déjà partis, que la liste « Envoyés par Ally » affiche déjà juste
     en dessous : le même message apparaissait deux fois sur le même écran.
     On garde les envois récents quelques minutes, le temps de voir la
     transition « en attente » → « parti ». */
  var VU_PENDANT = 3 * 60 * 1000;

  function enVol() {
    return state.messages.filter(function (m) {
      if (m.state === 'queued') return true;
      var quand = m.sentAt || m.createdAt || 0;
      return Date.now() - quand < VU_PENDANT;
    });
  }

  function body() {
    if (state.error) return '<p class="lock-note">' + esc(state.error) + '</p>';

    var liste = enVol();
    if (!liste.length) {
      return '<div class="empty">' + (state.messages.length
        ? 'Rien en attente. Les ' + state.messages.length + ' email' +
          (state.messages.length > 1 ? 's' : '') + ' déjà partis sont dans la liste des envois.'
        : 'Aucun email encore passé par le serveur. Validez un brouillon : il apparaîtra ici.') +
      '</div>';
    }

    return '<div class="live-list">' + liste.slice().reverse().map(function (m) {
      var tone = STATES[m.state] || STATES.queued;
      var left = m.state === 'queued'
        ? Math.max(0, Math.ceil((m.sendAfter - Date.now()) / 1000)) : 0;

      return '<div class="row">' +
        '<div class="row-main">' +
          '<p class="row-name">' + esc(m.subject || 'Sans objet') + '</p>' +
          '<p class="row-meta">À : ' + esc(m.to || '—') + '</p>' +
        '</div>' +
        '<div class="row-side">' +
          (left
            ? '<button type="button" class="btn btn-ghost btn-sm" data-mail-cancel="' +
              esc(m.id) + '">Annuler (' + left + ' s)</button>'
            : '<span class="badge-status ' + tone.css + '">' + tone.label + '</span>') +
          '<span class="row-meta">' + clock(m.sentAt || m.createdAt) + '</span>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>' +
    '<p class="note note-sep" style="margin-top:16px">Le corps de chaque message ' +
      'est chiffré en base : il n\'est lisible que par votre cabinet.</p>';
  }

  /* -------------------------------------------------------------- Liaison */

  /* On ne redessine que si quelque chose a changé. Un re-rendu systématique
     rebrancherait la carte, qui relancerait une requête : le serveur serait
     interrogé en boucle serrée. */
  function signature() {
    return (state.error || '') + '|' + state.messages.map(function (m) {
      return m.id + ':' + m.state;
    }).join(',');
  }

  function refresh(rerender) {
    if (!api.online() || !api.cabinetId() || state.busy) return;
    state.busy = true;
    var before = signature();

    api.messages().then(function (res) {
      state.busy = false;
      if (res.status === 401) { api.forget(); state.messages = []; if (rerender) rerender(); return; }
      if (!res.ok) { state.error = res.body.error || 'Le serveur a refusé la demande.'; }
      else { state.error = null; state.messages = res.body.messages || []; }
      if (rerender && signature() !== before) rerender();
    }).catch(function () {
      state.busy = false;
      var was = state.error;
      state.error = 'Serveur injoignable.';
      if (rerender && was !== state.error) rerender();
    });
  }

  /* Le décompte s'écrit dans le bouton, sans redessiner la carte.

     Redessiner chaque seconde remplaçait le bouton « Annuler » sous le doigt
     de la personne : au moment du clic, l'élément visé n'était plus dans la
     page. Rattraper un envoi est précisément le geste qui ne doit jamais
     rater. On ne touche donc qu'au texte, et le bouton reste le même objet
     pendant toute la fenêtre de dix secondes. */
  function tick(host) {
    var expired = false;

    host.querySelectorAll('[data-mail-cancel]').forEach(function (button) {
      var id = button.getAttribute('data-mail-cancel');
      var mail = null;
      state.messages.forEach(function (m) { if (m.id === id) mail = m; });
      if (!mail) return;

      var left = Math.max(0, Math.ceil((mail.sendAfter - Date.now()) / 1000));
      if (left) button.textContent = 'Annuler (' + left + ' s)';
      else expired = true;
    });

    return expired;
  }

  function bind(panel, rerender) {
    if (!api || !api.online()) return;
    var host = panel.querySelector('[data-mailbox]');
    if (!host) return;

    host.querySelectorAll('[data-mail-cancel]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        api.cancel(button.getAttribute('data-mail-cancel')).then(function () {
          refresh(rerender);
        }).catch(function () { button.disabled = false; });
      });
    });

    /* Un battement par seconde pour le décompte, une interrogation du serveur
       toutes les cinq — sauf à la fin d'une fenêtre de rétractation, où l'on
       veut savoir tout de suite si l'email est parti. */
    var beats = 0;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(function () {
      if (!document.body.contains(host)) {
        window.clearInterval(state.timer);
        state.timer = null;
        return;
      }
      beats += 1;
      var expired = tick(host);
      if (expired || beats % 5 === 0) refresh(rerender);
    }, 1000);

    refresh(rerender);
  }

  window.ALLY_MAILBOX = { view: view, bind: bind, refresh: refresh };
})();
