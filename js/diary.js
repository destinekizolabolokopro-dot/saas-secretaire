/* Ally — l'agenda réel.

   Troisième et dernière carte branchée sur le serveur, après la ligne et le
   courrier. Elle ferme la boucle du produit : Ally répond au téléphone, écrit
   les emails, et pose les rendez-vous — ceux-là même que l'agent vocal
   enregistre pendant l'appel, sans passer par cet écran.

   Le nom du client et la note sont chiffrés en base. La date et l'heure ne le
   sont pas : il faut bien pouvoir trier et repérer deux rendez-vous à la même
   heure sans tout déchiffrer. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = {
    rdv: [], error: null, busy: false, timer: null, loaded: false, notice: null,
    /* Le jour et l'heure saisis survivent au re-rendu. Sans cela, poser trois
       rendez-vous sur le même après-midi obligeait à ressaisir la date à
       chaque fois : le formulaire revenait à aujourd'hui. */
    form: { date: '', time: '09:00' }
  };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function today() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function dayLabel(iso) {
    var parts = String(iso).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (iso === today()) return "Aujourd'hui — " + label;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /* ------------------------------------------------------------------ Vue */

  function view() {
    if (!api || !api.online() || !api.cabinetId()) return '';

    return '<div class="card live-card" data-diary>' +
      '<div class="script-head">' +
        '<div>' +
          '<p class="card-title" style="margin-bottom:4px">L\'agenda réel' +
            '<span class="live-badge is-on">' + state.rdv.length + '</span></p>' +
          '<p class="note">Les rendez-vous du cabinet, partagés par tous ses ' +
            'membres. Ceux qu\'Ally pose pendant un appel arrivent ici sans que ' +
            'personne n\'ouvre l\'application.</p>' +
        '</div>' +
      '</div>' +
      (state.loaded ? body() : '<div class="empty">Lecture du serveur…</div>') +
      form() +
    '</div>';
  }

  function body() {
    if (state.error) return '<p class="lock-note">' + esc(state.error) + '</p>';
    if (!state.rdv.length) {
      return '<div class="empty">Aucun rendez-vous enregistré sur le serveur.</div>';
    }

    /* Groupés par jour : une liste plate de dates ISO ne se lit pas. */
    var days = [], byDay = {};
    state.rdv.forEach(function (r) {
      if (!byDay[r.date]) { byDay[r.date] = []; days.push(r.date); }
      byDay[r.date].push(r);
    });

    return days.map(function (date) {
      return '<p class="section-label" style="margin-top:14px">' + esc(dayLabel(date)) + '</p>' +
        '<div class="live-list">' + byDay[date].map(function (r) {
          return '<div class="row">' +
            '<div class="row-main">' +
              '<p class="row-name">' + esc(r.time) + ' — ' + esc(r.client) + '</p>' +
              '<p class="row-meta">' + esc(r.type) +
                (r.source === 'call' ? ' · pris par Ally au téléphone' : '') + '</p>' +
            '</div>' +
            '<div class="row-side">' +
              '<button type="button" class="btn btn-ghost btn-sm" data-rdv-drop="' +
                esc(r.id) + '">Annuler</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';
    }).join('');
  }

  function form() {
    return '<div class="live-connect" style="margin-top:18px">' +
      '<p class="note" style="margin-bottom:12px">Poser un rendez-vous sur la ligne réelle</p>' +
      '<div class="ob-grid-2">' +
        '<div class="ob-field"><label class="ob-label" for="diary-date">Jour</label>' +
          '<input class="field" id="diary-date" type="date" value="' +
            esc(state.form.date || today()) + '"></div>' +
        '<div class="ob-field"><label class="ob-label" for="diary-time">Heure</label>' +
          '<input class="field" id="diary-time" type="time" value="' +
            esc(state.form.time) + '"></div>' +
      '</div>' +
      '<div class="ob-grid-2">' +
        '<div class="ob-field"><label class="ob-label" for="diary-client">Client</label>' +
          '<input class="field" id="diary-client" type="text" placeholder="Mme Aubert"></div>' +
        '<div class="ob-field"><label class="ob-label" for="diary-type">Motif</label>' +
          '<input class="field" id="diary-type" type="text" placeholder="Consultation"></div>' +
      '</div>' +
      '<p class="auth-error" data-diary-error hidden>' + esc(state.notice || '') + '</p>' +
      '<div class="voice-try" style="margin-top:14px">' +
        '<button type="button" class="btn btn-primary btn-md" data-diary-add>Poser le rendez-vous</button>' +
      '</div>' +
    '</div>';
  }

  /* -------------------------------------------------------------- Liaison */

  function signature() {
    return (state.error || '') + '|' + state.rdv.map(function (r) {
      return r.id + ':' + r.date + r.time;
    }).join(',');
  }

  function refresh(rerender) {
    if (!api.online() || !api.cabinetId() || state.busy) return;
    state.busy = true;
    var before = signature();

    api.rdv().then(function (res) {
      state.busy = false;
      if (res.status === 401) { api.forget(); state.rdv = []; if (rerender) rerender(); return; }
      if (!res.ok) { state.error = res.body.error || 'Le serveur a refusé la demande.'; }
      else { state.error = null; state.rdv = res.body.rdv || []; }

      var first = !state.loaded;
      state.loaded = true;
      if (rerender && (first || signature() !== before)) rerender();
    }).catch(function () {
      state.busy = false;
      var was = state.error;
      state.error = 'Serveur injoignable.';
      if (rerender && was !== state.error) rerender();
    });
  }

  function bind(panel, rerender) {
    if (!api || !api.online()) return;
    var host = panel.querySelector('[data-diary]');
    if (!host) return;

    var box = host.querySelector('[data-diary-error]');
    if (state.notice) { box.textContent = state.notice; box.hidden = false; state.notice = null; }

    var add = host.querySelector('[data-diary-add]');
    if (add) {
      add.addEventListener('click', function () {
        add.disabled = true;
        var wanted = {
          date: host.querySelector('#diary-date').value,
          time: host.querySelector('#diary-time').value,
          client: host.querySelector('#diary-client').value,
          type: host.querySelector('#diary-type').value
        };
        /* On retient le créneau visé, y compris en cas de refus : c'est
           justement là qu'on veut le corriger d'une minute. */
        state.form = { date: wanted.date, time: wanted.time };

        api.addRdv(wanted).then(function (res) {
          add.disabled = false;
          if (!res.ok) {
            /* Le message est conservé pour survivre au re-rendu qui suit. */
            box.textContent = (res.body && res.body.error) || 'Rendez-vous refusé.';
            box.hidden = false;
            return;
          }
          refresh(rerender);
          if (rerender) rerender();
        }).catch(function () {
          add.disabled = false;
          box.textContent = 'Serveur injoignable.';
          box.hidden = false;
        });
      });
    }

    host.querySelectorAll('[data-rdv-drop]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        api.cancelRdv(button.getAttribute('data-rdv-drop')).then(function () {
          refresh(rerender);
          if (rerender) rerender();
        }).catch(function () { button.disabled = false; });
      });
    });

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

  window.ALLY_DIARY = { view: view, bind: bind, refresh: refresh };
})();
