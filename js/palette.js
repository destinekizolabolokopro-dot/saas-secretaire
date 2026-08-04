/* Ally — palette de commandes (⌘K).
   Un seul champ pour aller n'importe où, déclencher une action, ou poser une
   question à Ally. C'est ce qui rend un espace pro rapide une fois qu'on le
   connaît : plus besoin de chercher l'onglet, on tape ce qu'on veut. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var hooks = {};          // fournis par dashboard.js
  var items = [];
  var active = 0;
  var lastFocus = null;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(v) {
    return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  var el = {};

  /* Commandes disponibles, recalculées à chaque ouverture pour refléter la
     formule souscrite et les données du moment. */
  function build() {
    var list = [
      { kind: 'Aller à', label: "Aujourd'hui",    run: function () { hooks.goTab('today'); } },
      { kind: 'Aller à', label: 'Conversations',  run: function () { hooks.goTab('conversations'); } },
      { kind: 'Aller à', label: 'Agenda',         run: function () { hooks.goTab('agenda'); } },
      { kind: 'Aller à', label: 'Téléphonie',     run: function () { hooks.goTab('telephony'); } },
      { kind: 'Aller à', label: 'Ally',           run: function () { hooks.goTab('ally'); } },
      { kind: 'Aller à', label: 'Abonnement',     run: function () { hooks.goAccount('plan'); } },
      { kind: 'Aller à', label: 'Connexions',     run: function () { hooks.goAccount('links'); } },
      { kind: 'Aller à', label: 'Sécurité',       run: function () { hooks.goAccount('privacy'); } },

      { kind: 'Action', label: 'Valider les brouillons en attente',
        run: function () { hooks.goTab('conversations', 'validate'); } },
      { kind: 'Action', label: 'Exporter mes données',  run: function () { hooks.exportData(); } },
      { kind: 'Action', label: 'Lancer un appel de test',
        run: function () { hooks.goTab('telephony'); } }
    ];

    if (store.can('voiceCommand')) {
      list.splice(8, 0, { kind: 'Action', label: 'Parler à Ally', run: function () { hooks.openVoice(); } });
    }

    /* Les rendez-vous à venir deviennent des destinations. */
    var A = window.ALLY_AGENDA;
    store.data().rdv.filter(function (r) { return r.date >= A.TODAY; })
      .slice(0, 6).forEach(function (r) {
        list.push({
          kind: 'Agenda',
          label: r.client + ' — ' + A.shortLabel(r.date) + ' ' + r.time,
          run: function () { A.select(r.date); hooks.goTab('agenda'); }
        });
      });

    return list;
  }

  function render(query) {
    var q = norm(query || '').trim();
    var all = build();

    items = q
      ? all.filter(function (item) {
          return norm(item.label).indexOf(q) !== -1 || norm(item.kind).indexOf(q) !== -1;
        })
      : all;

    /* Rien ne correspond : la saisie devient une question posée à Ally. */
    if (q && !items.length) {
      items = [{
        kind: 'Demander', label: '« ' + query.trim() +' »',
        run: function () { hooks.ask(query.trim()); }
      }];
    }

    active = 0;
    if (!items.length) {
      el.list.innerHTML = '<p class="palette-empty">Aucune commande.</p>';
      return;
    }

    el.list.innerHTML = items.map(function (item, index) {
      return '<button type="button" class="palette-item' + (index === 0 ? ' is-active' : '') +
        '" data-index="' + index + '">' +
        '<span class="palette-kind">' + esc(item.kind) + '</span>' +
        '<span class="palette-label">' + esc(item.label) + '</span></button>';
    }).join('');

    el.list.querySelectorAll('[data-index]').forEach(function (button) {
      button.addEventListener('click', function () {
        run(Number(button.getAttribute('data-index')));
      });
    });
  }

  function highlight() {
    el.list.querySelectorAll('.palette-item').forEach(function (node, index) {
      node.classList.toggle('is-active', index === active);
      if (index === active && node.scrollIntoView) {
        node.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function run(index) {
    var item = items[index];
    close();
    if (item && item.run) item.run();
  }

  function open() {
    lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.input.value = '';
    render('');
    el.input.focus();
  }

  function close() {
    el.overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.ALLY_PALETTE = {
    init: function (providedHooks) {
      hooks = providedHooks;
      el.overlay = document.getElementById('palette-overlay');
      el.input = document.getElementById('palette-input');
      el.list = document.getElementById('palette-list');
      if (!el.overlay) return;

      el.input.addEventListener('input', function () { render(el.input.value); });

      el.input.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          active = Math.min(active + 1, items.length - 1);
          highlight();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          active = Math.max(active - 1, 0);
          highlight();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          run(active);
        }
      });

      el.overlay.addEventListener('click', function (event) {
        if (event.target === el.overlay) close();
      });

      /* ⌘K sur Mac, Ctrl+K ailleurs. */
      document.addEventListener('keydown', function (event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          if (el.overlay.hidden) open(); else close();
        } else if (event.key === 'Escape' && !el.overlay.hidden) {
          close();
        }
      });
    },
    open: open,
    close: close,
    isOpen: function () { return el.overlay && !el.overlay.hidden; }
  };
})();
