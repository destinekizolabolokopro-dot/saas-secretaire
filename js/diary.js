/* Ally — l'agenda réel.

   Troisième et dernière carte branchée sur le serveur, après la ligne et le
   courrier. Elle ferme la boucle du produit : Ally répond au téléphone, écrit
   les emails, et pose les rendez-vous — ceux-là même que l'agent vocal
   enregistre pendant l'appel, sans passer par cet écran.

   Le nom du client et la note sont chiffrés en base. La date et l'heure ne le
   sont pas : il faut bien pouvoir trier et repérer deux rendez-vous à la même
   heure sans tout déchiffrer.

   Elle ne liste pas les rendez-vous : le calendrier juste en dessous le fait
   déjà, alimenté par les mêmes données, et les afficher deux fois sur le même
   écran avec deux jeux de boutons n'aidait personne. */
(function () {
  'use strict';

  var api = window.ALLY_API;

  var state = { rdv: [], error: null, busy: false, timer: null, loaded: false };

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
    '</div>';
  }

  /* La liste détaillée a disparu d'ici. Le calendrier, juste en dessous, la
     donne déjà — synchronisée avec le serveur — et les mêmes rendez-vous
     s'affichaient deux fois sur le même écran, avec deux jeux de boutons.
     Cette carte dit désormais d'où viennent les données ; le calendrier les
     montre et permet d'agir. */
  function body() {
    if (state.error) return '<p class="lock-note">' + esc(state.error) + '</p>';
    if (!state.rdv.length) {
      return '<div class="empty">Aucun rendez-vous enregistré sur le serveur. ' +
        'Ceux que vous ajoutez au calendrier ci-dessous y arriveront.</div>';
    }

    var parAlly = state.rdv.filter(function (r) { return r.source === 'call'; }).length;
    var prochain = state.rdv.filter(function (r) { return r.date >= today(); })[0];

    return '<div class="recap-row" style="margin-top:4px"><span>Rendez-vous enregistrés</span>' +
        '<span>' + state.rdv.length + '</span></div>' +
      '<div class="recap-row"><span>Pris par Ally au téléphone</span>' +
        '<span>' + parAlly + '</span></div>' +
      (prochain
        ? '<div class="recap-row total"><span>Prochain</span><span>' +
          esc(dayLabel(prochain.date)) + ' · ' + esc(prochain.time) + ' — ' +
          esc(prochain.client) + '</span></div>'
        : '') +
      '<p class="note note-sep" style="margin-top:14px">Le calendrier ci-dessous ' +
        'montre ces rendez-vous et sert à les modifier : ajouter, reporter, annuler. ' +
        'Tout y passe par le serveur, donc tout le cabinet le voit.</p>';
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
