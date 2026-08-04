/* Ally — agenda : calendrier mensuel manipulable.
   Une grille du mois plutôt qu'une liste : le professionnel voit sa charge
   d'un coup d'œil, repère les journées pleines et les trous. Chaque case
   accepte les rendez-vous et les créneaux bloqués, et Ally écrit dedans quand
   on lui parle. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;

  /* La démonstration est figée au mardi 28 juillet 2026, comme le reste. */
  var TODAY = '2026-07-28';

  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var DOW = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  var DAY_WORDS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi',
    'vendredi', 'samedi'];

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Dates ---------- */
  function toISO(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function fromISO(iso) {
    var parts = String(iso).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  function addDays(iso, n) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  /* Étiquette courte : « Auj. », « Dem. », sinon « Jeu 30 ». */
  function shortLabel(iso) {
    if (iso === TODAY) return 'Auj.';
    if (iso === addDays(TODAY, 1)) return 'Dem.';
    var d = fromISO(iso);
    var name = DAY_WORDS[d.getDay()];
    return name.charAt(0).toUpperCase() + name.slice(1, 3) + ' ' + d.getDate();
  }

  function longLabel(iso) {
    var d = fromISO(iso);
    return DAY_WORDS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* Traduit « demain », « vendredi », « le 12 » en date réelle, toujours
     vers le futur : dire « vendredi » un mardi vise le vendredi qui vient. */
  function resolveDate(word, ref) {
    var base = ref || TODAY;
    if (!word) return base;
    var w = String(word).toLowerCase();

    if (w.indexOf('après-demain') !== -1 || w.indexOf('apres-demain') !== -1) return addDays(base, 2);
    if (w.indexOf('demain') !== -1) return addDays(base, 1);
    if (w.indexOf("aujourd") !== -1) return base;

    for (var i = 0; i < DAY_WORDS.length; i++) {
      if (w.indexOf(DAY_WORDS[i]) !== -1) {
        var current = fromISO(base).getDay();
        var delta = (i - current + 7) % 7;
        if (delta === 0) delta = 7;           // « mardi » un mardi = la semaine prochaine
        return addDays(base, delta);
      }
    }
    return base;
  }

  /* ---------- Contenu d'une journée ---------- */
  function rdvOn(iso) {
    return store.data().rdv.filter(function (r) { return r.date === iso; })
      .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function blockedOn(iso) {
    return store.data().blocked.filter(function (b) { return b.date === iso; });
  }

  var view = { month: '2026-07', selected: TODAY };

  function monthMatrix(ym) {
    var parts = ym.split('-');
    var first = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    var offset = (first.getDay() + 6) % 7;              // lundi en tête
    var start = addDays(toISO(first), -offset);
    var cells = [];
    for (var i = 0; i < 42; i++) cells.push(addDays(start, i));
    // On coupe la dernière semaine si elle déborde entièrement sur le mois suivant.
    if (cells[35].slice(0, 7) !== ym) cells = cells.slice(0, 35);
    return cells;
  }

  window.ALLY_AGENDA = {
    TODAY: TODAY,
    toISO: toISO, fromISO: fromISO, addDays: addDays,
    shortLabel: shortLabel, longLabel: longLabel, resolveDate: resolveDate,
    rdvOn: rdvOn,

    /* ---------------------------- VUE ---------------------------- */
    view: function () {
      var ym = view.month;
      var parts = ym.split('-');
      var title = MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
      var cells = monthMatrix(ym);
      var D = store.data();

      var grid = cells.map(function (iso) {
        var outside = iso.slice(0, 7) !== ym;
        var events = rdvOn(iso);
        var blocks = blockedOn(iso);
        var classes = ['cal-cell'];
        if (outside) classes.push('is-outside');
        if (iso === TODAY) classes.push('is-today');
        if (iso === view.selected) classes.push('is-selected');
        if (blocks.length) classes.push('is-blocked');

        return '<button type="button" class="' + classes.join(' ') + '" data-day="' + iso + '"' +
          ' aria-label="' + esc(longLabel(iso)) + ', ' + events.length + ' rendez-vous">' +
          '<span class="cal-num">' + fromISO(iso).getDate() + '</span>' +
          '<span class="cal-events">' +
            events.slice(0, 3).map(function (r) {
              return '<span class="cal-event"><b>' + esc(r.time) + '</b> ' + esc(r.client) + '</span>';
            }).join('') +
            (events.length > 3 ? '<span class="cal-more">+' + (events.length - 3) + '</span>' : '') +
            (blocks.length ? '<span class="cal-block">' + esc(blocks[0].half) + ' bloqué</span>' : '') +
          '</span></button>';
      }).join('');

      var dayRdv = rdvOn(view.selected);
      var dayBlocks = blockedOn(view.selected);

      return '<div class="stack">' +

        '<div class="card cal-card">' +
          '<div class="cal-head">' +
            '<div class="cal-nav">' +
              '<button type="button" class="cal-arrow" data-month="prev" aria-label="Mois précédent">←</button>' +
              '<p class="cal-title">' + esc(title) + '</p>' +
              '<button type="button" class="cal-arrow" data-month="next" aria-label="Mois suivant">→</button>' +
              '<button type="button" class="btn-link" data-month="today">Aujourd\'hui</button>' +
            '</div>' +
            '<p class="note">Dites à Ally « crée un rendez-vous vendredi à 10h », la case se remplit.</p>' +
          '</div>' +
          '<div class="cal-dow">' + DOW.map(function (d) {
            return '<span>' + d + '</span>';
          }).join('') + '</div>' +
          '<div class="cal-grid">' + grid + '</div>' +
        '</div>' +

        '<div class="cols cols-14">' +
          '<div class="card">' +
            '<div class="script-head">' +
              '<div><p class="card-title" style="margin-bottom:2px">' + esc(longLabel(view.selected)) + '</p>' +
              '<p class="note">' + dayRdv.length + ' rendez-vous' +
                (dayBlocks.length ? ' · ' + esc(dayBlocks[0].half) + ' bloqué' : '') + '</p></div>' +
              '<button type="button" class="btn btn-ghost btn-sm" id="cal-block">' +
                (dayBlocks.length ? 'Débloquer' : 'Bloquer la journée') + '</button>' +
            '</div>' +
            (dayRdv.length
              ? dayRdv.map(function (r) {
                  return '<div class="rdv">' +
                    '<span class="rdv-day">' + esc(r.time) + '</span>' +
                    '<div class="rdv-main"><p class="row-name">' + esc(r.client) + '</p>' +
                    '<p class="row-meta">' + esc(r.type) + '</p></div>' +
                    '<button type="button" class="btn-link" data-rdv-move="' + r.id + '">Reporter</button>' +
                    '<button type="button" class="btn-link danger" data-rdv-cancel="' + r.id + '">Annuler</button>' +
                    '</div>';
                }).join('')
              : '<div class="empty">Journée libre.</div>') +
            '<form class="block-form" id="cal-add" style="margin-top:16px">' +
              '<label class="sr-only" for="cal-client">Nom</label>' +
              '<input class="field" id="cal-client" placeholder="Nom du ' + esc(store.profile().clientWord) + '">' +
              '<label class="sr-only" for="cal-time">Heure</label>' +
              '<input class="field" id="cal-time" type="time" value="09:00" style="max-width:130px">' +
              '<button type="submit" class="btn btn-primary btn-sm">Ajouter</button>' +
            '</form>' +
          '</div>' +

          '<div class="stack">' +
            '<div class="card"><p class="card-title">Charge du mois</p>' +
              this.loadBars(ym) +
            '</div>' +
            '<div class="card"><p class="card-title">Synchronisation</p>' +
              '<div class="sync-row"><span>Google Calendar</span><span class="sync-dot" aria-hidden="true"></span></div>' +
              '<p class="note" style="margin-top:14px">' + esc(store.profile().agendaRules) + '</p>' +
            '</div>' +
            (D.blocked.length
              ? '<div class="card"><p class="card-title">Créneaux bloqués</p>' +
                D.blocked.map(function (b) {
                  return '<div class="row"><span style="font-size:14px">' + esc(shortLabel(b.date)) +
                    ' · ' + esc(b.half) + '</span>' +
                    '<button type="button" class="btn-link" data-unblock="' + b.id + '">Débloquer</button></div>';
                }).join('') + '</div>'
              : '') +
          '</div>' +
        '</div></div>';
    },

    /* Répartition hebdomadaire, en barres — on repère la semaine chargée. */
    loadBars: function (ym) {
      var weeks = {};
      store.data().rdv.forEach(function (r) {
        if (r.date.slice(0, 7) !== ym) return;
        var d = fromISO(r.date);
        var monday = addDays(r.date, -((d.getDay() + 6) % 7));
        weeks[monday] = (weeks[monday] || 0) + 1;
      });

      var keys = Object.keys(weeks).sort();
      if (!keys.length) return '<div class="empty">Aucun rendez-vous ce mois-ci.</div>';
      var max = Math.max.apply(null, keys.map(function (k) { return weeks[k]; }));

      return '<div class="bars">' + keys.map(function (k) {
        var d = fromISO(k);
        return '<div class="bar-row">' +
          '<span class="bar-label">sem. ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 4) + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' +
            Math.round((weeks[k] / max) * 100) + '%"></span></span>' +
          '<span class="bar-value">' + weeks[k] + '</span>' +
          '</div>';
      }).join('') + '</div>';
    },

    /* ---------------------------- LIAISONS ---------------------------- */
    bind: function (panel, refresh) {
      panel.querySelectorAll('[data-day]').forEach(function (cell) {
        cell.addEventListener('click', function () {
          view.selected = cell.getAttribute('data-day');
          view.month = view.selected.slice(0, 7);
          refresh();
        });
      });

      panel.querySelectorAll('[data-month]').forEach(function (button) {
        button.addEventListener('click', function () {
          var dir = button.getAttribute('data-month');
          if (dir === 'today') { view.month = TODAY.slice(0, 7); view.selected = TODAY; }
          else {
            var parts = view.month.split('-');
            var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + (dir === 'next' ? 1 : -1), 1);
            view.month = toISO(d).slice(0, 7);
          }
          refresh();
        });
      });

      var addForm = panel.querySelector('#cal-add');
      if (addForm) {
        addForm.addEventListener('submit', function (event) {
          event.preventDefault();
          var client = document.getElementById('cal-client').value.trim();
          var time = document.getElementById('cal-time').value;
          if (!time) return;
          store.data().rdv.push({
            id: Date.now(), date: view.selected,
            client: client || 'Nouveau ' + store.profile().clientWord,
            type: 'Rendez-vous', time: time
          });
          store.log('Rendez-vous ajouté depuis le calendrier',
            (client || 'Nouveau client') + ' — ' + longLabel(view.selected) + ' ' + time);
          store.save();
          refresh();
        });
      }

      var blockBtn = panel.querySelector('#cal-block');
      if (blockBtn) {
        blockBtn.addEventListener('click', function () {
          var D = store.data();
          var existing = blockedOn(view.selected);
          if (existing.length) {
            D.blocked = D.blocked.filter(function (b) { return b.date !== view.selected; });
          } else {
            D.blocked.push({ id: Date.now(), date: view.selected, half: 'toute la journée' });
            store.log('Blocage de journée', longLabel(view.selected));
          }
          store.save();
          refresh();
        });
      }

      /* Reporter d'un jour : le geste le plus fréquent sur un agenda. */
      panel.querySelectorAll('[data-rdv-move]').forEach(function (button) {
        button.addEventListener('click', function () {
          var id = Number(button.getAttribute('data-rdv-move'));
          var r = store.data().rdv.filter(function (x) { return x.id === id; })[0];
          if (!r) return;
          r.date = addDays(r.date, 1);
          store.log('Report de ' + r.client, 'Déplacé au ' + longLabel(r.date));
          store.save();
          refresh();
        });
      });
    },

    /* Permet au reste de l'application de sélectionner un jour. */
    select: function (iso) {
      view.selected = iso;
      view.month = iso.slice(0, 7);
    }
  };
})();
