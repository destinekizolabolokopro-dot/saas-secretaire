/* Ally — espace pro.
   4 onglets de travail dans la barre latérale, les réglages froids regroupés
   dans un espace Compte ouvert depuis la carte profil. Tout le contenu vient
   du profil métier et de l'identité saisie à l'onboarding. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var S = store.state;

  var TABS = [
    { id: 'today',         label: "Aujourd'hui" },
    { id: 'conversations', label: 'Conversations' },
    { id: 'agenda',        label: 'Agenda' },
    { id: 'telephony',     label: 'Téléphonie' },
    { id: 'ally',          label: 'Ally' }
  ];

  var ACCOUNT_SECTIONS = [
    { id: 'plan',   label: 'Abonnement' },
    { id: 'links',  label: 'Connexions' },
    { id: 'privacy', label: 'Sécurité' },
    { id: 'alerts', label: 'Notifications' },
    { id: 'help',   label: 'Support' }
  ];

  var ui = { tab: 'today', account: 'plan', filter: 'all', expanded: null };

  var el = {
    shell: document.getElementById('shell'),
    navList: document.getElementById('nav-list'),
    panel: document.getElementById('tabpanel'),
    title: document.getElementById('tab-title'),
    sub: document.getElementById('tab-sub'),
    scrim: document.getElementById('scrim'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebarClose: document.getElementById('sidebar-close'),
    searchToggle: document.getElementById('search-toggle'),
    search: document.getElementById('search'),
    profileCard: document.getElementById('profile-card'),
    profileName: document.getElementById('profile-name'),
    profileOrg: document.getElementById('profile-org'),
    avatar: document.getElementById('avatar'),
    badgePlan: document.getElementById('badge-plan'),
    notifBadge: document.getElementById('notif-badge'),
    fab: document.getElementById('voice-fab'),
    overlay: document.getElementById('voice-overlay'),
    heard: document.getElementById('voice-heard'),
    confirm: document.getElementById('voice-confirm'),
    voiceOk: document.getElementById('voice-ok'),
    voiceCancel: document.getElementById('voice-cancel'),
    voiceTitle: document.getElementById('voice-title')
  };

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function P() { return store.profile(); }
  function D() { return store.data(); }
  function name() { return store.displayName(); }

  var AUTONOMY = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(v) { return v < 34 ? AUTONOMY[0] : v < 67 ? AUTONOMY[1] : AUTONOMY[2]; }

  /* ---- Contexte réel : l'heure, le jour, et l'état de la ligne ----
     L'écran affichait « Bonjour » à toute heure et une date en dur. Un
     tableau de bord qui ne sait pas quel jour on est ne peut pas prétendre
     tenir un agenda. */
  var WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function dateLabel() {
    var d = new Date();
    var label = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
      + ' ' + d.getFullYear();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function salutation() {
    var h = new Date().getHours();
    return (h < 6 || h >= 18) ? 'Bonsoir' : 'Bonjour';
  }

  /* Créneau d'ouverture du jour, d'après les horaires déclarés. */
  function todayHours() {
    var index = (new Date().getDay() + 6) % 7;   // lundi en tête, comme S.hours
    return S.hours[index];
  }

  function minutesNow() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function toMinutes(hhmm) {
    var parts = String(hhmm || '00:00').split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function nextOpening() {
    for (var i = 1; i <= 7; i++) {
      var day = S.hours[(((new Date().getDay() + 6) % 7) + i) % 7];
      if (day.on) {
        return (i === 1 ? 'demain' : day.label.toLowerCase()) + ' à ' + day.from;
      }
    }
    return null;
  }

  /* Une phrase qui dit ce qui se passe maintenant, pas un libellé figé. */
  function lineStatus() {
    var day = todayHours();
    var now = minutesNow();

    if (!day.on) {
      var when = nextOpening();
      return { open: false,
        text: 'Vous êtes fermé aujourd\'hui — Ally prend tous les appels'
          + (when ? ' jusqu\'à ' + when : '') + '.' };
    }
    if (now < toMinutes(day.from)) {
      return { open: false,
        text: 'Vous ouvrez à ' + day.from + ' — Ally répond d\'ici là.' };
    }
    if (now >= toMinutes(day.to)) {
      var later = nextOpening();
      return { open: false,
        text: 'Vous avez fermé à ' + day.to + ' — Ally prend le relais'
          + (later ? ' jusqu\'à ' + later : '') + '.' };
    }
    return { open: true,
      text: 'Cabinet ouvert jusqu\'à ' + day.to + ' — Ally ne prend que ce que vous manquez.' };
  }

  /* ---------- Dérivés du profil ---------- */
  function drafts()   { return D().drafts; }
  function calls()    { return D().calls; }
  function todayRdv() { return window.ALLY_AGENDA.rdvOn(window.ALLY_AGENDA.TODAY); }
  function urgentCall() {
    return calls().filter(function (c) { return c.kind === 'urgent'; })[0] || null;
  }
  function pendingCall() {
    return calls().filter(function (c) { return c.kind === 'pending'; })[0] || null;
  }
  function todoCount() { return drafts().length + (urgentCall() ? 1 : 0) + (pendingCall() ? 1 : 0); }

  function signature() {
    return name() + (S.identity.org ? ' — ' + S.identity.org : '');
  }

  /* Actions du haut de page, propres à chaque onglet — comme les liens
     d'export et les boutons de l'espace pro de référence. */
  var ACTIONS = {
    today: [
      { label: '↓ Exporter le récapitulatif', act: function () { exportJSON('recapitulatif', {
          date: dateLabel(), actions: todoItems(), usage: store.usage() }); } },
      { label: '✉ Envoyer le résumé du jour', act: function () {
          store.log('Résumé du jour envoyé', S.identity.email || 'adresse professionnelle');
          flash('Résumé envoyé à ' + (S.identity.email || 'votre adresse')); } },
      { primary: true, label: '+ Rendez-vous', act: function () { setTab('agenda'); } }
    ],
    conversations: [
      { label: '↓ Export CSV des appels', act: function () { exportCSV(); } },
      { primary: true, label: '+ Valider les brouillons', act: function () {
          ui.filter = 'validate'; renderPanel(); } }
    ],
    agenda: [
      { label: '↓ Exporter l\'agenda', act: function () { exportJSON('agenda', D().rdv); } },
      { primary: true, label: '+ Rendez-vous', act: function () {
          var input = document.getElementById('cal-client'); if (input) input.focus(); } }
    ],
    telephony: [
      { label: '▶ Essayer la voix', act: function () {
          var button = document.getElementById('try-voice'); if (button) button.click(); } },
      { primary: true, label: 'Lancer un appel test', act: function () {
          var button = document.getElementById('start-call'); if (button) button.click(); } }
    ],
    ally: [
      { label: '↓ Exporter la configuration', act: function () { exportJSON('configuration', {
          regles: S.rules, autonomie: S.autonomy, script: store.script(), faq: D().faq }); } },
      { primary: true, label: '+ Connaissance', act: function () {
          var button = document.getElementById('faq-open'); if (button) button.click(); } }
    ],
    account: []
  };

  function exportJSON(name, payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ally-' + name + '.json';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    flash('Fichier téléchargé');
  }

  function exportCSV() {
    var rows = [['Heure', 'Appelant', 'Motif', 'Statut']].concat(
      calls().map(function (c) { return [c.time, c.caller, c.subject, c.status]; }));
    var csv = rows.map(function (r) {
      return r.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ally-appels.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    flash('Export CSV téléchargé');
  }

  /* Retour discret après une action, en haut à droite. */
  function flash(text) {
    var node = document.createElement('div');
    node.className = 'flash';
    node.textContent = text;
    document.body.appendChild(node);
    window.setTimeout(function () { node.classList.add('is-out'); }, 2200);
    window.setTimeout(function () { node.remove(); }, 2600);
  }

  /* Message éphémère assorti d'un bouton : c'est le seul endroit où
     l'annulation d'un envoi est réellement à portée de clic. */
  function flashUndo(text, onUndo) {
    var node = document.createElement('div');
    node.className = 'flash flash-undo';
    var label = document.createElement('span');
    label.textContent = text;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost btn-sm';
    button.textContent = 'Annuler';
    node.appendChild(label);
    node.appendChild(button);
    document.body.appendChild(node);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      node.classList.add('is-out');
      window.setTimeout(function () { node.remove(); }, 400);
    }
    button.addEventListener('click', function () { close(); onUndo(); });
    window.setTimeout(close, store.UNDO_MS);
  }

  /* Décompte affiché sur les brouillons en cours d'envoi. */
  var undoTicker = null;

  function startUndoTicker() {
    if (undoTicker) return;
    undoTicker = window.setInterval(function () {
      var pending = store.sending();
      if (!pending.length) { stopUndoTicker(); return; }
      pending.forEach(function (mail) {
        var node = document.querySelector('[data-countdown="' + mail.id + '"]');
        if (node) node.textContent = store.secondsLeft(mail);
      });
    }, 500);
  }

  function stopUndoTicker() {
    if (!undoTicker) return;
    window.clearInterval(undoTicker);
    undoTicker = null;
  }

  function renderActions() {
    var box = document.getElementById('topbar-actions');
    var list = ACTIONS[ui.tab] || [];
    box.innerHTML = list.map(function (a, i) {
      return a.primary
        ? '<button type="button" class="btn btn-primary" data-act="' + i + '">' + esc(a.label) + '</button>'
        : '<button type="button" class="act-link" data-act="' + i + '">' + esc(a.label) + '</button>';
    }).join('');
    box.querySelectorAll('[data-act]').forEach(function (button) {
      button.addEventListener('click', function () {
        list[Number(button.getAttribute('data-act'))].act();
      });
    });
  }

  /* ---------- En-tête et barre latérale ---------- */
  function renderChrome() {
    var p = P();
    el.profileName.textContent = name();
    el.profileOrg.textContent = S.identity.org || p.orgLabel;
    el.avatar.textContent = ((S.identity.firstName || '?')[0] + (S.identity.lastName || '?')[0]).toUpperCase();
    el.badgePlan.textContent = store.plan();
    el.notifBadge.hidden = !urgentCall();
    el.fab.hidden = !S.voiceEnabled || !store.can('voiceCommand');
    document.title = 'Espace pro — ' + name() + ' — Ally';

    document.getElementById('foot-email').textContent = S.identity.email || store.fullName();

    /* Le raccourci vers la console n'apparaît que pour le rôle admin. */
    var adminItem = document.getElementById('foot-admin-item');
    if (adminItem) {
      adminItem.hidden = !(window.ALLY_ACCOUNTS && window.ALLY_ACCOUNTS.isAdmin());
    }
    document.getElementById('foot-transfer').setAttribute('aria-checked', String(!!S.rules.transfer));
    document.getElementById('foot-digest').setAttribute('aria-checked', String(S.notif.email));
    /* Dire où vivent réellement les données. Tant qu'aucune API ne répond,
       tout est dans le navigateur, et le prétendre autrement serait mentir. */
    var api = window.ALLY_API;
    document.getElementById('foot-storage').textContent =
      (api && api.online())
        ? (api.cabinetId() ? 'serveur Ally (ligne connectée)' : 'serveur Ally détecté')
        : (S.subscription ? 'navigateur (compte actif)' : 'navigateur (démonstration)');
    var v = window.ALLY_VOICE.resolveVoice(S.voice.uri);
    document.getElementById('foot-voice-name').textContent =
      v ? v.name.replace(/\s*\(.*\)\s*/, '') : 'par défaut';
  }

  function renderNav() {
    var counts = { conversations: todoCount(), agenda: todayRdv().length };

    el.navList.innerHTML = TABS.map(function (tab) {
      var current = tab.id === ui.tab;
      var count = counts[tab.id];
      return '<button type="button" class="nav-item" data-tab="' + tab.id + '"' +
        (current ? ' aria-current="page"' : '') + '>' +
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="nav-label">' + esc(tab.label) + '</span>' +
        (count ? '<span class="nav-count' + (tab.id === 'conversations' ? ' urgent' : '') + '">' + count + '</span>' : '') +
        '</button>';
    }).join('');

    el.navList.querySelectorAll('.nav-item').forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.getAttribute('data-tab'));
        closeDrawer();
      });
    });

    el.profileCard.setAttribute('aria-current', ui.tab === 'account' ? 'page' : 'false');
  }

  var SUBS = {
    /* On compte les actions regroupées, comme la carte « Actions requises » —
       la pastille de la barre latérale, elle, compte les conversations. */
    today: function () {
      var n = todoItems().length;
      return dateLabel() + ' · ' + lineStatus().text
        + (n ? ' · ' + n + ' action' + (n > 1 ? 's' : '') + ' à traiter' : '');
    },
    conversations: function () {
      return calls().length + ' appels aujourd\'hui · ' + drafts().length + ' brouillons à valider';
    },
    agenda: function () { return todayRdv().length + ' rendez-vous aujourd\'hui · synchronisé avec Google Calendar'; },
    telephony: function () {
      return window.ALLY_VOICE.canListen()
        ? 'Voix, script d\'appel et simulation — micro disponible'
        : 'Voix, script d\'appel et simulation d\'appel entrant';
    },
    ally: function () { return 'Comportement, autonomie et connaissances de votre assistante'; },
    account: function () { return S.identity.email || P().plan; }
  };

  function setTab(id) {
    ui.tab = id;
    ui.expanded = null;
    var tab = TABS.filter(function (t) { return t.id === id; })[0];

    el.title.textContent = (id === 'today') ? salutation() + ' ' + name()
      : (id === 'account') ? 'Mon compte' : tab.label;
    el.sub.textContent = SUBS[id]();

    renderNav();
    renderActions();
    renderPanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Tiroir mobile ---------- */
  function openDrawer() {
    el.shell.classList.add('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'true');
    el.sidebarClose.focus();
  }
  function closeDrawer() {
    el.shell.classList.remove('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'false');
  }

  var mqMobile = window.matchMedia('(max-width: 900px)');
  function syncMobile(event) {
    el.menuToggle.hidden = !event.matches;
    if (!event.matches) closeDrawer();
  }
  syncMobile(mqMobile);
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncMobile);
  else mqMobile.addListener(syncMobile);

  el.menuToggle.addEventListener('click', openDrawer);
  el.sidebarClose.addEventListener('click', function () { closeDrawer(); el.menuToggle.focus(); });
  el.scrim.addEventListener('click', closeDrawer);
  el.profileCard.addEventListener('click', function () { setTab('account'); closeDrawer(); });
  el.searchToggle.addEventListener('click', function () {
    var open = el.search.classList.toggle('is-open');
    el.searchToggle.setAttribute('aria-expanded', String(open));
    if (open) el.search.focus();
  });
  /* Bloc utilitaire du pied de barre latérale. */
  document.getElementById('foot-transfer').addEventListener('click', function () {
    S.rules.transfer = !S.rules.transfer; store.save(); renderChrome();
    flash(S.rules.transfer ? 'Urgences transférées sur votre portable' : 'Transfert des urgences désactivé');
  });
  document.getElementById('foot-digest').addEventListener('click', function () {
    S.notif.email = !S.notif.email; store.save(); renderChrome();
    flash(S.notif.email ? 'Résumé quotidien activé' : 'Résumé quotidien désactivé');
  });
  document.getElementById('foot-logout').addEventListener('click', function () {
    /* Se déconnecter doit fermer la session partout où elle est ouverte : dans
       le navigateur, et sur le serveur quand il en tient une. Attendre sa
       réponse évite de laisser un cookie valide derrière soi. */
    var done = window.ALLY_GATE
      ? window.ALLY_GATE.logout()
      : Promise.resolve(window.ALLY_ACCOUNTS && window.ALLY_ACCOUNTS.logout());

    done.then(function () {
      store.reload();
      window.location.href = 'login.html';
    });
  });

  /* Présence : c'est ce battement qui alimente le « en ligne » de la console
     d'administration. Sans lui, un professionnel actif y paraîtrait absent. */
  if (window.ALLY_ACCOUNTS && window.ALLY_ACCOUNTS.currentId()) {
    window.ALLY_ACCOUNTS.touch();
    window.setInterval(function () { window.ALLY_ACCOUNTS.touch(); }, 60000);
  }
  document.getElementById('foot-palette').addEventListener('click', function () {
    window.ALLY_PALETTE.open();
  });
  document.getElementById('foot-invite').addEventListener('click', function () {
    flash('Invitation en lecture seule envoyée (démonstration)');
  });
  /* Le raccourci « Voix » mène désormais à l'onglet Ally, où le sélecteur
     voisine avec le registre de parole et le script d'accueil. */
  document.getElementById('foot-voice').addEventListener('click', function () {
    setTab('ally');
  });

  /* ---------- Recherche transversale ---------- */
  /* Cherche dans les appels, les emails, les rendez-vous et la base de
     connaissances, et emmène directement sur le bon onglet. */
  function search(query) {
    var q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    var hits = [];
    function match(text) { return String(text).toLowerCase().indexOf(q) !== -1; }

    calls().forEach(function (c) {
      if (match(c.caller) || match(c.subject) || match(c.transcript)) {
        hits.push({ tab: 'conversations', filter: 'calls', label: c.caller, sub: c.subject, kind: 'Appel' });
      }
    });
    drafts().forEach(function (m) {
      if (match(m.subject) || match(m.to) || match(m.preview)) {
        hits.push({ tab: 'conversations', filter: 'validate', label: m.subject, sub: 'À : ' + m.to, kind: 'Brouillon' });
      }
    });
    D().sent.forEach(function (m) {
      if (match(m.subject) || match(m.to)) {
        hits.push({ tab: 'conversations', filter: 'emails', label: m.subject, sub: m.time, kind: 'Envoyé' });
      }
    });
    D().rdv.forEach(function (r) {
      if (match(r.client) || match(r.type)) {
        hits.push({ tab: 'agenda', filter: 'all', label: r.client,
          sub: window.ALLY_AGENDA.shortLabel(r.date) + ' · ' + r.time, kind: 'RDV' });
      }
    });
    /* La fiche du cabinet fait partie de ce qu'Ally sait : la recherche doit
       la trouver aussi, sinon « parking » ne renvoie rien alors qu'Ally
       répond à la question au téléphone. */
    store.knowledge().forEach(function (f) {
      if (match(f.q) || match(f.a)) {
        hits.push({ tab: 'ally', filter: 'all', label: f.q, sub: f.a, kind: 'Connaissance' });
      }
    });
    return hits.slice(0, 8);
  }

  var results = document.getElementById('search-results');

  function renderResults(hits, query) {
    if (!query || query.trim().length < 2) { results.hidden = true; return; }
    results.hidden = false;
    if (!hits.length) {
      results.innerHTML = '<p class="search-empty">Aucun résultat pour « ' + esc(query) + ' ».</p>';
      return;
    }
    results.innerHTML = hits.map(function (hit, index) {
      return '<button type="button" class="search-hit" data-hit="' + index + '">' +
        '<span class="search-kind">' + esc(hit.kind) + '</span>' +
        '<span class="search-main"><strong>' + esc(hit.label) + '</strong>' +
        '<span>' + esc(hit.sub) + '</span></span></button>';
    }).join('');
    results.querySelectorAll('[data-hit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var hit = hits[Number(button.getAttribute('data-hit'))];
        ui.filter = hit.filter;
        results.hidden = true;
        el.search.value = '';
        setTab(hit.tab);
      });
    });
  }

  el.search.addEventListener('input', function () {
    renderResults(search(el.search.value), el.search.value);
  });
  el.search.addEventListener('blur', function () {
    window.setTimeout(function () { results.hidden = true; }, 180);
  });
  el.search.addEventListener('focus', function () {
    if (el.search.value.trim().length >= 2) renderResults(search(el.search.value), el.search.value);
  });

  /* ---------- Notifications ---------- */
  var notifPanel = document.getElementById('notif-panel');

  function renderNotifications() {
    var items = todoItems();
    notifPanel.innerHTML = '<p class="notif-title">Notifications</p>' +
      (items.length
        ? items.map(function (item, index) {
            return '<button type="button" class="notif-item" data-notif="' + index + '">' +
              '<span class="todo-dot ' + item.kind + '" aria-hidden="true"></span>' +
              '<span>' + esc(item.text) + '</span></button>';
          }).join('')
        : '<p class="notif-empty">Rien à signaler. Ally a tout traité.</p>');

    notifPanel.querySelectorAll('[data-notif]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items[Number(button.getAttribute('data-notif'))];
        notifPanel.hidden = true;
        ui.filter = item.filter;
        setTab(item.tab);
      });
    });
  }

  document.getElementById('notif-btn').addEventListener('click', function (event) {
    event.stopPropagation();
    if (notifPanel.hidden) { renderNotifications(); notifPanel.hidden = false; }
    else notifPanel.hidden = true;
  });
  document.addEventListener('click', function (event) {
    if (!notifPanel.hidden && !notifPanel.contains(event.target)) notifPanel.hidden = true;
  });

  /* ---------- Fragments ---------- */
  function badge(call) {
    return '<span class="badge-status badge-' + call.kind + '">' + esc(call.status) + '</span>';
  }

  function slider(key, label) {
    var value = S.autonomy[key];
    return '<div class="slider-block">' +
      '<div class="slider-head"><label for="au-' + key + '">' + esc(label) + '</label>' +
      '<output id="out-' + key + '" for="au-' + key + '">' + esc(autonomyLabel(value)) + '</output></div>' +
      '<input type="range" id="au-' + key + '" min="0" max="100" value="' + value + '" data-autonomy="' + key + '">' +
      '</div>';
  }

  /* group === 'flat' cible une clé à la racine de l'état (voiceEnabled),
     sinon on descend dans un sous-objet (notif.sms…). */
  function switchRow(group, key, label, hint) {
    var checked = (group === 'flat') ? S[key] : S[group][key];
    var id = group + '-' + key;
    return '<div class="switch-row"><span class="switch-text" id="lbl-' + id + '">' +
      '<strong>' + esc(label) + '</strong>' + (hint ? '<span>' + esc(hint) + '</span>' : '') + '</span>' +
      '<button type="button" class="toggle" role="switch" data-switch="' + group + '.' + key + '"' +
      ' aria-checked="' + checked + '" aria-labelledby="lbl-' + id + '"></button></div>';
  }

  /* Une capacité absente de la formule se dit, avec la marche à suivre. */
  function upsell(what, why) {
    return '<div class="upsell">' +
      '<p class="upsell-title">' + esc(what) + ' n\'est pas dans votre formule</p>' +
      '<p class="upsell-why">' + esc(why) + '</p>' +
      '<button type="button" class="btn btn-primary btn-sm" data-upgrade>Voir les formules</button>' +
      '</div>';
  }

  function emptyState(text) {
    return '<div class="empty">' + esc(text) + '</div>';
  }

  /* Répartition des appels par motif, en barres horizontales. */
  function motifBars() {
    var counts = {};
    calls().forEach(function (c) {
      var key = c.kind === 'urgent' ? 'Urgences'
        : c.kind === 'pending' ? 'À rappeler'
        : c.subject.indexOf('endez') !== -1 || c.subject.indexOf('evis') !== -1
          ? 'Rendez-vous et devis' : 'Renseignements';
      counts[key] = (counts[key] || 0) + 1;
    });
    var keys = Object.keys(counts);
    if (!keys.length) return '<div class="empty">Aucun appel aujourd\'hui.</div>';
    var total = calls().length;

    return '<div class="bars">' + keys.map(function (k) {
      return '<div class="bar-row">' +
        '<span class="bar-label">' + esc(k) + '</span>' +
        '<span class="bar-track"><span class="bar-fill' +
          (k === 'Urgences' ? ' danger' : k === 'À rappeler' ? ' warn' : '') +
          '" style="width:' + Math.round((counts[k] / total) * 100) + '%"></span></span>' +
        '<span class="bar-value">' + counts[k] + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* Points d'attention : des signaux calculés, pas une liste décorative. */
  function watchPoints() {
    var points = [];
    var p = P();
    var A = window.ALLY_AGENDA;

    var pending = pendingCall();
    if (pending) {
      points.push({ level: 'warn', text: pending.caller + ' attend un rappel depuis ' + pending.time + '.' });
    }

    var todays = todayRdv();
    if (todays.length >= 4) {
      points.push({ level: 'warn', text: 'Journée chargée : ' + todays.length + ' rendez-vous aujourd\'hui.' });
    }

    // Deux rendez-vous à moins d'une heure d'intervalle.
    for (var i = 1; i < todays.length; i++) {
      var a = Number(todays[i - 1].time.split(':')[0]) * 60 + Number(todays[i - 1].time.split(':')[1]);
      var b = Number(todays[i].time.split(':')[0]) * 60 + Number(todays[i].time.split(':')[1]);
      if (b - a < 60) {
        points.push({ level: 'warn', text: 'Créneaux serrés : ' + todays[i - 1].client +
          ' et ' + todays[i].client + ' à moins d\'une heure d\'écart.' });
        break;
      }
    }

    /* Le forfait d'appels a désormais son propre bandeau, avec le surcoût réel
       et la montée en gamme : le répéter ici serait redondant. Seuls les
       emails restent signalés à cet endroit. */
    var mails = store.usage().emails;
    if (mails.used / mails.limit > 0.8) {
      points.push({ level: 'danger', text: 'Forfait emails à ' +
        Math.round((mails.used / mails.limit) * 100) + ' % : ' + mails.used +
        ' sur ' + mails.limit + '.' });
    }

    if (!S.links.gcal) {
      points.push({ level: 'info', text: 'Google Calendar n\'est pas connecté : Ally ne voit pas vos vraies disponibilités.' });
    }

    if (!points.length) {
      return '<div class="empty">Aucun point de vigilance détecté pour l\'instant.</div>';
    }

    return '<div class="watch">' + points.map(function (pt) {
      return '<div class="watch-item ' + pt.level + '">' +
        '<span class="watch-dot" aria-hidden="true"></span>' +
        '<span>' + esc(pt.text) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ============================ AUJOURD'HUI ============================ */
  function todoItems() {
    var items = [];
    var urgent = urgentCall();
    var pending = pendingCall();

    if (urgent) {
      items.push({
        kind: 'urgent',
        text: 'Appel urgent de ' + urgent.caller + ' à ' + urgent.time + ' — transféré sur votre portable',
        action: 'Voir l\'appel', tab: 'conversations', filter: 'calls'
      });
    }
    if (drafts().length) {
      items.push({
        kind: 'draft',
        text: drafts().length + ' brouillon' + (drafts().length > 1 ? 's' : '') + ' attend'
          + (drafts().length > 1 ? 'ent' : '') + ' votre validation avant envoi',
        action: 'Valider', tab: 'conversations', filter: 'validate'
      });
    }
    if (pending) {
      items.push({
        kind: 'pending',
        text: 'Rappel à programmer — ' + pending.caller + ' à ' + pending.time,
        action: 'Voir', tab: 'conversations', filter: 'calls'
      });
    }
    return items;
  }

  /* ---- Premiers pas ----
     Sans renvoi d'appel posé, la ligne ne sonne jamais et le professionnel
     conclut que le produit ne marche pas. Ces trois gestes sont donc mis en
     tête de page tant qu'ils ne sont pas faits, et la carte disparaît d'
     elle-même ensuite. */
  var FIRST_STEPS = [
    { id: 'heard', label: 'Écouter ce qu\'entendront vos appelants',
      hint: 'Trente secondes, et vous saurez si le ton vous convient.',
      action: 'Écouter', tab: 'telephony' },
    { id: 'forward', label: 'Poser le renvoi d\'appel sur votre ligne',
      hint: 'Trois codes à composer. Sans eux, Ally ne recevra jamais d\'appel.',
      action: 'Voir les codes', tab: 'telephony' },
    { id: 'calendar', label: 'Connecter votre agenda',
      hint: 'Ally ne proposera un créneau que s\'il est réellement libre.',
      action: 'Connecter', tab: 'account' },
    { id: 'sheet', label: 'Remplir la fiche du cabinet',
      hint: 'Adresse, parking, tarif : autant d\'appels qui ne vous reviennent plus.',
      action: 'Remplir', tab: 'ally' }
  ];

  function syncSteps() {
    /* Certaines étapes se déduisent de l'état, sans clic sur « c'est fait ». */
    if (S.links.gcal || S.links.outlook) S.steps.calendar = true;
    if (store.sheetFilled() >= 3) S.steps.sheet = true;
  }

  function viewFirstSteps() {
    syncSteps();
    if (S.steps.dismissed) return '';
    var left = FIRST_STEPS.filter(function (item) { return !S.steps[item.id]; });
    if (!left.length) return '';

    return '<section class="setup-card">' +
      '<div class="setup-head">' +
        '<div>' +
          '<p class="card-title" style="margin:0">Mise en service</p>' +
          '<p class="row-meta">' + (FIRST_STEPS.length - left.length) + ' sur ' +
            FIRST_STEPS.length + ' — il reste ' + left.length + ' geste' +
            (left.length > 1 ? 's' : '') + '</p>' +
        '</div>' +
        '<button type="button" class="btn-link" data-steps="dismiss">Masquer</button>' +
      '</div>' +
      '<ul class="setup-list">' + FIRST_STEPS.map(function (item) {
        var done = !!S.steps[item.id];
        return '<li class="setup-item' + (done ? ' is-done' : '') + '">' +
          '<span class="check-mark" aria-hidden="true"></span>' +
          '<div class="setup-text"><strong>' + esc(item.label) + '</strong>' +
          '<span>' + esc(item.hint) + '</span></div>' +
          (done ? '<span class="badge-status badge-ok">Fait</span>'
                : '<button type="button" class="btn btn-ghost btn-sm" data-step-go="' +
                  item.id + '" data-step-tab="' + item.tab + '">' + esc(item.action) + '</button>') +
        '</li>';
      }).join('') + '</ul>' +
    '</section>';
  }

  /* ---- Forfait ----
     On ne coupe jamais la ligne : les appels continuent d'être pris et sont
     facturés au détail. Le professionnel est prévenu à 80 %, puis informé du
     surcoût réel, avec la formule supérieure à portée de clic. */
  function viewQuota() {
    var q = store.quotaState();
    if (q.level === 'ok') return '';

    var plans = window.ALLY_PLANS;
    var current = store.planData();
    var better = plans[plans.indexOf(current) + 1];

    if (q.level === 'warn') {
      return '<div class="alert"><span class="dot"></span><div>' +
        '<strong>Forfait bientôt atteint</strong>' +
        '<p class="row-meta">' + q.used + ' appels sur ' + q.limit + '. Au-delà, ' +
          'Ally continue de décrocher : les appels supplémentaires sont facturés ' +
          current.overage.toFixed(2).replace('.', ',') + ' € pièce.' +
          (better ? ' La formule ' + better.name + ' en inclut ' + better.quota.calls + '.' : '') +
        '</p></div>' +
        (better ? '<button type="button" class="btn btn-ghost btn-sm" data-upgrade="' +
          better.id + '">Passer à ' + better.name + '</button>' : '') +
      '</div>';
    }

    return '<div class="alert alert-over"><span class="dot"></span><div>' +
      '<strong>Forfait dépassé de ' + q.over + ' appel' + (q.over > 1 ? 's' : '') + '</strong>' +
      '<p class="row-meta">Votre ligne n\'a pas été coupée — un appel refusé vous coûterait ' +
        'plus cher qu\'un appel facturé. Supplément en cours : ' +
        q.cost.toFixed(2).replace('.', ',') + ' €' +
        (better ? '. La formule ' + better.name + ' (' + better.price + ' €) inclut ' +
          better.quota.calls + ' appels.' : '.') +
      '</p></div>' +
      (better ? '<button type="button" class="btn btn-primary btn-sm" data-upgrade="' +
        better.id + '">Passer à ' + better.name + '</button>' : '') +
    '</div>';
  }

  /* ---- Ce qu'Ally a remarqué ----
     Une seule suggestion à la fois, appuyée sur des gestes réellement comptés,
     et refusable définitivement. Une IA qui propose au hasard use la patience
     plus vite qu'elle ne rend service. */
  function viewInsight() {
    var insight = store.insight();
    if (!insight) return '';

    return '<section class="insight-card">' +
      '<p class="insight-kicker">Ally a remarqué</p>' +
      '<p class="insight-text">' + esc(insight.text()) + '</p>' +
      '<div class="insight-actions">' +
        '<button type="button" class="btn btn-primary btn-md" data-insight-yes="' +
          insight.id + '">' + esc(insight.action) + '</button>' +
        '<button type="button" class="btn btn-ghost btn-md" data-insight-no="' +
          insight.id + '">Non, ne me le repropose plus</button>' +
      '</div>' +
    '</section>';
  }

  /* Un compte neuf n'a pas d'historique : on décrit ce qui va se passer plutôt
     que d'afficher les chiffres d'un autre cabinet. */
  function viewEmptyToday() {
    var status = lineStatus();
    return viewFirstSteps() + viewQuota() + viewInsight() +
      '<section class="card blank-card">' +
        '<p class="blank-kicker">Votre ligne n\'a pas encore sonné</p>' +
        '<h2 class="blank-title">Tout est prêt, ' + esc(name()) + '.</h2>' +
        '<p class="blank-text">' + esc(status.text) + ' Au premier appel, vous trouverez ' +
          'ici la transcription, le motif, et ce qu\'Ally a répondu. Rien n\'est ' +
          'inventé d\'ici là : ce tableau de bord ne montrera que vos données.</p>' +
        '<div class="blank-actions">' +
          '<button type="button" class="btn btn-primary btn-md" data-jump="telephony" data-filter="all">' +
            'Brancher ma ligne</button>' +
          '<button type="button" class="btn btn-ghost btn-md" data-sample="load">' +
            'Voir avec des données d\'exemple</button>' +
        '</div>' +
      '</section>' +

      '<div class="stat-grid">' +
        '<div class="stat"><p class="stat-label">Appels reçus</p><p class="stat-value">0</p></div>' +
        '<div class="stat"><p class="stat-label">RDV du jour</p><p class="stat-value">0</p></div>' +
        '<div class="stat"><p class="stat-label">Mails à valider</p><p class="stat-value accent">0</p></div>' +
        '<div class="stat"><p class="stat-label">Forfait</p><p class="stat-value cyan">' +
          store.usage().calls.limit + '</p></div>' +
      '</div>' +

      '<div class="cols cols-11">' +
        '<div class="card"><p class="card-title">Ce qu\'Ally sait déjà répondre</p>' +
          (store.knowledge().length
            ? store.knowledge().slice(0, 5).map(function (item) {
                return '<div class="row"><div><p class="row-name">' + esc(item.q) + '</p>' +
                  '<p class="row-meta">' + esc(item.a) + '</p></div></div>';
              }).join('')
            : emptyState('Aucune fiche pour l\'instant.')) +
        '</div>' +
        '<div class="card"><p class="card-title">Points d\'attention</p>' +
          watchPoints() +
        '</div>' +
      '</div>';
  }

  function viewToday() {
    if (store.isNew()) return viewEmptyToday();
    var p = P();
    var items = todoItems();

    return viewFirstSteps() + viewQuota() + viewInsight() +
      '<section class="todo-card">' +
        '<div class="todo-head">' +
          '<p class="card-title" style="margin:0">Actions requises</p>' +
          '<span class="todo-count">' + items.length + '</span>' +
        '</div>' +
        (items.length ? '<ul class="todo-list">' + items.map(function (item) {
          return '<li class="todo-item">' +
            '<span class="todo-dot ' + item.kind + '" aria-hidden="true"></span>' +
            '<span class="todo-text">' + esc(item.text) + '</span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-jump="' + item.tab +
              '" data-filter="' + item.filter + '">' + esc(item.action) + '</button>' +
          '</li>';
        }).join('') + '</ul>'
          : emptyState('Rien ne vous attend. Ally a tout traité.')) +
      '</section>' +

      '<div class="stat-grid">' +
        '<div class="stat"><p class="stat-label">Appels reçus</p><p class="stat-value">' + calls().length + '</p></div>' +
        '<div class="stat"><p class="stat-label">RDV du jour</p><p class="stat-value">' + todayRdv().length + '</p></div>' +
        '<div class="stat"><p class="stat-label">Mails à valider</p><p class="stat-value accent">' + drafts().length + '</p></div>' +
        '<div class="stat"><p class="stat-label">Temps gagné (semaine)</p><p class="stat-value cyan">' + esc(p.stats.saved) + '</p></div>' +
      '</div>' +

      '<div class="cols cols-11" style="margin-bottom:20px">' +
        '<div class="card"><p class="card-title">Répartition des appels</p>' +
          motifBars() +
        '</div>' +
        '<div class="card"><p class="card-title">Points d\'attention</p>' +
          watchPoints() +
        '</div>' +
      '</div>' +

      '<div class="cols cols-13">' +
        '<div class="card"><p class="card-title">Derniers appels</p>' +
          calls().slice(0, 4).map(function (c) {
            return '<div class="row">' +
              '<div><p class="row-name">' + esc(c.caller) + '</p>' +
              '<p class="row-meta">' + esc(c.time) + ' · ' + esc(c.subject) + '</p></div>' +
              badge(c) + '</div>';
          }).join('') +
        '</div>' +
        '<div class="card"><p class="card-title">Cette semaine</p>' +
          '<div class="mini-stat"><p class="mini-stat-label">Appels manqués évités</p>' +
            '<p class="mini-stat-value">' + p.stats.avoided + ' <small>appels</small></p></div>' +
          '<div class="mini-stat"><p class="mini-stat-label">Brouillons validés</p>' +
            '<p class="mini-stat-value">' + p.stats.validated + ' <small>emails</small></p></div>' +
          '<div class="mini-stat"><p class="mini-stat-label">Prochain rendez-vous</p>' +
            '<p class="mini-stat-value" style="font-size:17px">' +
            (todayRdv()[0] ? esc(todayRdv()[0].time + ' · ' + todayRdv()[0].client) : 'Aucun aujourd\'hui') +
            '</p></div>' +
        '</div>' +
      '</div>';
  }

  /* =========================== CONVERSATIONS =========================== */
  var FILTERS = [
    { id: 'all',      label: 'Tout' },
    { id: 'validate', label: 'À valider' },
    { id: 'calls',    label: 'Appels' },
    { id: 'emails',   label: 'Emails' }
  ];

  function callItem(c) {
    var open = ui.expanded === 'call-' + c.id;
    return '<div class="conv' + (c.kind === 'urgent' ? ' is-urgent' : '') + '">' +
      '<button type="button" class="conv-head" data-expand="call-' + c.id + '"' +
        ' aria-expanded="' + open + '" aria-controls="body-call-' + c.id + '">' +
        '<span class="conv-chan chan-call" aria-hidden="true"></span>' +
        '<span class="conv-main">' +
          '<span class="conv-who">' + esc(c.caller) + '</span>' +
          '<span class="conv-sub">' + esc(c.subject) + '</span>' +
        '</span>' +
        '<span class="conv-right">' + badge(c) +
          '<span class="conv-time">' + esc(c.time) + '</span>' +
          '<span class="chevron" aria-hidden="true">' + (open ? '▲' : '▼') + '</span></span>' +
      '</button>' +
      '<div class="conv-body" id="body-call-' + c.id + '"' + (open ? '' : ' hidden') + '>' +
        '<div class="transcript">' +
          '<p class="transcript-label">Transcription automatique · ' + esc(c.duration) + '</p>' +
          '<p class="transcript-text">' + esc(c.transcript) + '</p>' +
          '<div class="transcript-actions">' +
            '<button type="button" class="btn-play" data-play="' + c.id + '">' +
              '<span aria-hidden="true">▶</span> Écouter l\'enregistrement</button>' +
            '<button type="button" class="btn-link" data-fix="' + c.id + '">Corriger la transcription</button>' +
          '</div>' +
          '<p class="legal">Enregistré avec le consentement de l\'appelant, conformément à la réglementation.</p>' +
        '</div>' +
      '</div></div>';
  }

  function draftItem(mail) {
    var open = ui.expanded === 'draft-' + mail.id;
    return '<div class="conv is-draft' + (mail.sending ? ' is-sending' : '') + '">' +
      '<button type="button" class="conv-head" data-expand="draft-' + mail.id + '"' +
        ' aria-expanded="' + open + '" aria-controls="body-draft-' + mail.id + '">' +
        '<span class="conv-chan chan-mail" aria-hidden="true"></span>' +
        '<span class="conv-main">' +
          '<span class="conv-who">' + esc(mail.subject) + '</span>' +
          '<span class="conv-sub">À : ' + esc(mail.to) + '</span>' +
        '</span>' +
        '<span class="conv-right"><span class="tag">' + esc(mail.category) + '</span>' +
          '<span class="conv-time">' + esc(mail.time) + '</span>' +
          '<span class="chevron" aria-hidden="true">' + (open ? '▲' : '▼') + '</span></span>' +
      '</button>' +
      '<div class="conv-body" id="body-draft-' + mail.id + '"' + (open ? '' : ' hidden') + '>' +
        '<div class="mail-preview">' +
          '<p class="transcript-label">Brouillon préparé par Ally</p>' +
          '<p class="transcript-text">' + esc(mail.preview) + '</p>' +
          '<p class="mail-sign">' + esc(signature()) + '</p>' +
          (mail.sending
            ? '<div class="sending-bar">' +
                '<span class="sending-dot" aria-hidden="true"></span>' +
                '<span>Envoi à ' + esc(mail.to) + ' dans ' +
                  '<strong data-countdown="' + mail.id + '">' + store.secondsLeft(mail) + '</strong> s</span>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-undo="' + mail.id + '">Annuler</button>' +
              '</div>'
            : '<div class="transcript-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-send="' + mail.id + '">Envoyer</button>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + mail.id + '">Modifier</button>' +
              '</div>') +
        '</div>' +
      '</div></div>';
  }

  function viewConversations() {
    var p = P();
    /* Le courrier réel passe en tête : quand une ligne est connectée, ce qui
       part vraiment prime sur la simulation. La carte ne rend rien sans
       serveur ni sans cabinet connecté. */
    var showDrafts = ui.filter === 'all' || ui.filter === 'validate' || ui.filter === 'emails';
    var showCalls  = ui.filter === 'all' || ui.filter === 'calls';
    var showSent   = ui.filter === 'all' || ui.filter === 'emails';

    var out = (window.ALLY_MAILBOX ? window.ALLY_MAILBOX.view() : '') +
      '<div class="choice-row filters" role="group" aria-label="Filtrer les conversations">' +
      FILTERS.map(function (f) {
        var count = f.id === 'validate' ? drafts().length
          : f.id === 'calls' ? calls().length
          : f.id === 'emails' ? drafts().length + D().sent.length
          : calls().length + drafts().length + D().sent.length;
        return '<button type="button" class="choice" data-filter="' + f.id + '"' +
          ' aria-pressed="' + (ui.filter === f.id) + '">' + esc(f.label) +
          ' <span class="choice-count">' + count + '</span></button>';
      }).join('') + '</div>';

    if (showDrafts) {
      out += '<p class="section-label">À valider avant envoi' +
        '<span class="section-hint">Ally ne les enverra pas sans vous</span></p>' +
        '<div class="conv-list">' + (drafts().length
          ? drafts().map(draftItem).join('')
          : emptyState('Aucun brouillon en attente.')) + '</div>';
    }

    if (showCalls) {
      out += '<p class="section-label">Appels du jour</p>' +
        '<div class="conv-list">' + calls().map(callItem).join('') + '</div>';
    }

    if (showSent) {
      out += '<p class="section-label">Envoyés automatiquement par Ally</p>' +
        '<div class="conv-list flat">' + D().sent.map(function (mail) {
          return '<div class="row"><div><p class="row-name">' + esc(mail.subject) + '</p>' +
            '<p class="row-meta">À : ' + esc(mail.to) + '</p></div>' +
            '<p class="row-meta">' + esc(mail.time) + '</p></div>';
        }).join('') + '</div>';
    }

    return out;
  }

  /* ================================ AGENDA ================================ */
  /* L'agenda réel passe en tête : quand une ligne est connectée, les
     rendez-vous du serveur priment sur ceux du navigateur. */
  function viewAgenda() {
    return (window.ALLY_DIARY ? window.ALLY_DIARY.view() : '') + window.ALLY_AGENDA.view();
  }

  /* ================================= ALLY ================================= */
  var SHEET_FIELDS = [
    { id: 'address', label: 'Adresse', hint: '12 rue Victor-Hugo, 69002 Lyon' },
    { id: 'access',  label: 'Comment venir', hint: 'Métro Bellecour, sortie A — 3e étage, ascenseur' },
    { id: 'parking', label: 'Stationnement', hint: 'Parking Bellecour à 100 m, places en zone bleue devant' },
    { id: 'payment', label: 'Moyens de paiement', hint: 'Virement, carte, chèque — pas d\'espèces' },
    { id: 'price',   label: 'Tarif annoncé', hint: '120 € TTC la première consultation, 45 minutes' },
    { id: 'delay',   label: 'Délai de réponse', hint: 'Rappel sous 24 h ouvrées' }
  ];

  function viewAlly() {
    var p = P();
    return '<div class="stack limit-760">' +

      '<div class="card"><p class="card-title">Niveau d\'autonomie par tâche</p>' +
        slider('calls', 'Appels') + slider('emails', 'Emails') + slider('agenda', 'Agenda') +
        (p.secret && S.rules.draft
          ? '<p class="lock-note">Profil ' + esc(p.name.toLowerCase()) + ' : le mode « brouillon à valider » '
            + 'reste imposé sur les emails — aucun contenu métier ne part sans votre accord.</p>' : '') +
      '</div>' +

      '<div class="card"><p class="card-title">Registre de parole</p>' +
        '<p class="note" style="margin-bottom:14px">Le même contenu, dit trois façons. ' +
          'Changer de registre réécrit l\'accueil et les réponses du script d\'appel, ' +
          'sauf celles que vous avez modifiées vous-même.</p>' +
        '<div class="chip-group">' + Object.keys(store.TONES).map(function (id) {
          return '<button type="button" class="chip" data-tone="' + id + '"' +
            ' aria-pressed="' + (S.tone === id) + '">' + esc(store.TONES[id].label) + '</button>';
        }).join('') + '</div>' +
        '<p class="note" style="margin-top:12px">' + esc(store.tone().desc) + '</p>' +
      '</div>' +

      '<div class="card"><p class="card-title">La voix d\'Ally</p>' +
        '<p class="note" style="margin-bottom:14px">Celle que vos ' + esc(p.clientWord) +
          's entendront au téléphone, et celle qui vous répond ici. Les voix ' +
          'proposées sont celles installées sur cet appareil.</p>' +
        '<div data-voice-picker></div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Script d\'accueil téléphonique</p>' +
        '<label class="sr-only" for="greeting">Script d\'accueil téléphonique</label>' +
        '<textarea class="field" id="greeting">' + esc(store.greeting()) + '</textarea>' +
        '<div class="recap-listen">' +
          '<button type="button" class="btn btn-ghost btn-md" id="ally-listen">' +
            '<span aria-hidden="true">▶</span> Écouter</button>' +
          '<p class="note">C\'est la première phrase que vos ' + esc(p.clientWord) + 's entendent.</p>' +
        '</div>' +
      '</div>' +

      /* Fiche du cabinet : chaque champ rempli devient une réponse qu'Ally
         donne seule, au lieu de prendre un message. */
      '<div class="card"><p class="card-title">Fiche du cabinet' +
        '<span class="section-hint">' + store.sheetFilled() + ' sur 6 renseignés</span></p>' +
        '<p class="note" style="margin-bottom:16px">Ce que vos ' + esc(p.clientWord) +
          's demandent sans avoir besoin de vous. Chaque ligne remplie est un appel ' +
          'de moins à traiter.</p>' +
        SHEET_FIELDS.map(function (field) {
          return '<div class="ob-field">' +
            '<label class="ob-label" for="sheet-' + field.id + '">' + esc(field.label) + '</label>' +
            '<input class="field" id="sheet-' + field.id + '" type="text" data-sheet="' + field.id +
              '" value="' + esc(S.sheet[field.id]) + '" placeholder="' + esc(field.hint) + '">' +
          '</div>';
        }).join('') +
      '</div>' +

      (store.can('voiceCommand') ? '' : upsell('La commande vocale',
        'Dire « Hey Ally, envoie un mail à mon rendez-vous de 15h » demande l\'agent IA, '
        + 'absent de la formule Permanence.')) +

      (store.can('voiceCommand') ? '<div class="card"><p class="card-title">Commande vocale</p>' +
        switchRow('flat', 'voiceEnabled', 'Parler à Ally depuis l\'application',
          'Affiche le bouton micro en bas de l\'écran.') +
        '<p class="note" style="margin-top:12px">La voix se choisit plus haut sur cette page. ' +
          'Le script d\'appel complet et la simulation sont dans ' +
          '<button type="button" class="btn-link" data-jump="telephony">l\'onglet Téléphonie</button>.</p>' +
        '<p class="sub-label">Confirmation orale avant exécution</p>' +
        '<div class="choice-row" role="group" aria-label="Niveau de confirmation requis">' +
          [['none', 'Aucune'], ['sensitive', 'Actions sensibles'], ['always', 'Systématique']].map(function (pair) {
            return '<button type="button" class="choice" data-confirm="' + pair[0] + '"' +
              ' aria-pressed="' + (S.confirmLevel === pair[0]) + '">' + pair[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' : '') +

      (store.can('voiceCommand') ? '<div class="card"><p class="card-title">Derniers ordres vocaux</p>' +
        '<div class="voice-log">' + D().voiceLog.map(function (entry) {
          return '<div class="row"><div><p class="row-name">« ' + esc(entry.order) + ' »</p>' +
            '<p class="row-meta">' + esc(entry.when) + ' · ' + esc(entry.result) + '</p></div>' +
            '<span class="voice-status ' + entry.state + '">' +
            (entry.state === 'done' ? 'Exécuté' : 'À valider') + '</span></div>';
        }).join('') + '</div>' +
      '</div>' : '') +

      '<div class="card"><p class="card-title">Contacts prioritaires</p>' +
        '<p class="note" style="margin-bottom:14px">Ally vous transfère ces appels immédiatement.</p>' +
        D().contacts.map(function (c) {
          var label = c.name === 'Votre portable' && S.identity.phone
            ? 'Votre portable (' + S.identity.phone + ')' : c.name;
          return '<div class="row"><span style="font-size:14px">' + esc(label) + '</span>' +
            '<span class="row-meta">' + esc(c.reason) + '</span></div>';
        }).join('') +
      '</div>' +

      (store.can('knowledge')
        ? '<div class="card"><p class="card-title">Base de connaissances' +
          (store.planData().caps.knowledge === 'advanced' ? ' <span class="tag">avancée</span>' : '') + '</p>' +
        '<p class="note" style="margin-bottom:14px">Ce qu\'Ally peut répondre seule, sans vous solliciter.</p>' +
        '<div class="faq-list">' + D().faq.map(function (item) {
          return '<div class="faq"><div class="faq-top"><strong>' + esc(item.q) + '</strong>' +
            '<button type="button" class="btn-link danger" data-faq-del="' + item.id + '">Supprimer</button></div>' +
            '<p>' + esc(item.a) + '</p></div>';
        }).join('') + '</div>' +
        '<form class="faq-form" id="faq-form" hidden>' +
          '<label class="sr-only" for="faq-q">Question</label>' +
          '<input class="field" id="faq-q" placeholder="Question — ex. : Acceptez-vous la carte bancaire ?">' +
          '<label class="sr-only" for="faq-a">Réponse d\'Ally</label>' +
          '<textarea class="field" id="faq-a" rows="2" placeholder="Ce qu\'Ally répondra, mot pour mot"></textarea>' +
          '<div class="faq-form-actions">' +
            '<button type="submit" class="btn btn-primary btn-sm">Ajouter</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="faq-cancel">Annuler</button>' +
          '</div>' +
        '</form>' +
        '<button type="button" class="add-row" id="faq-open" style="margin-top:14px">+ Ajouter une entrée</button>' +
      '</div>'
        : upsell('La base de connaissances',
            'Elle permet à Ally de répondre seule aux questions courantes de vos ' +
            P().clientWord + 's. Disponible à partir de la formule Cabinet.')) +
      '</div>';
  }

  /* ================================ COMPTE ================================ */
  function accountPlan() {
    var p = P();
    var usage = store.usage();
    var pct = function (u) { return Math.min(100, Math.round((u.used / u.limit) * 100)); };
    /* Le cabinet à plusieurs n'a de sens qu'avec un serveur : sans lui, la
       carte ne rend rien. */
    return (window.ALLY_TEAM ? window.ALLY_TEAM.view() : '') +
      '<div class="cols cols-11">' +
      '<div class="plan-card">' +
        '<p class="plan-kicker">Formule actuelle</p>' +
        '<p class="plan-name">' + esc(store.plan()) + '</p>' +
        (S.subscription
          ? '<p class="note" style="margin-bottom:16px">' +
            (S.subscription.cycle === 'year' ? 'Facturation annuelle' : 'Facturation mensuelle') +
            ' · ' + S.subscription.price + ' € HT · essai jusqu\'au ' +
            esc(S.subscription.trialEndsOn) + '</p>'
          : '') +
        '<div class="meter"><div class="meter-head"><span>Appels traités</span><span>' +
          usage.calls.used + ' / ' + usage.calls.limit + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill accent" style="width:' + pct(usage.calls) + '%"></div></div></div>' +
        '<div class="meter"><div class="meter-head"><span>Emails traités</span><span>' +
          usage.emails.used + ' / ' + usage.emails.limit + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill cyan" style="width:' + pct(usage.emails) + '%"></div></div></div>' +
        estimate(usage) +
        '<button type="button" class="btn btn-ghost btn-md" id="plan-open">Changer de formule</button>' +
        '<div class="plan-choices" id="plan-choices" hidden>' +
          ['Essai gratuit', p.plan, 'Cabinet illimité'].map(function (label) {
            return '<button type="button" class="choice" data-plan="' + esc(label) + '"' +
              ' aria-pressed="' + (store.plan() === label) + '">' + esc(label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="card"><p class="card-title">Historique de facturation</p>' +
        billing() +
      '</div></div>';
  }

  /* Ce que coûtera le mois en cours, tant que la ligne est branchée : le
     forfait, plus les appels au-delà. On ne coupe jamais la ligne — un appel
     refusé coûte au cabinet bien plus que 0,35 € — donc le professionnel doit
     pouvoir voir venir le supplément, pas le découvrir sur sa facture. */
  function estimate(usage) {
    if (!usage.real) return '';

    var plan = store.planData();
    var extraCalls = Math.max(0, usage.calls.used - usage.calls.limit);
    var extraMails = Math.max(0, usage.emails.used - usage.emails.limit);
    var extra = (extraCalls + extraMails) * plan.overage;
    var money = function (n) { return n.toFixed(2).replace('.', ',') + ' €'; };

    return '<div class="recap-row" style="margin-top:18px"><span>Forfait ' +
        esc(plan.name) + '</span><span>' + plan.price + ' €</span></div>' +
      (extra
        ? '<div class="recap-row"><span>Au-delà du forfait — ' +
          (extraCalls ? extraCalls + ' appel' + (extraCalls > 1 ? 's' : '') : '') +
          (extraCalls && extraMails ? ', ' : '') +
          (extraMails ? extraMails + ' email' + (extraMails > 1 ? 's' : '') : '') +
          ' × ' + money(plan.overage) + '</span><span>' + money(extra) + '</span></div>'
        : '') +
      '<div class="recap-row total"><span>Estimation du mois</span><span>' +
        money(plan.price + extra) + '</span></div>' +
      '<p class="note" style="margin-top:10px">Compté sur la ligne réelle : ' +
        usage.calls.used + ' appel' + (usage.calls.used > 1 ? 's' : '') + ' reçu' +
        (usage.calls.used > 1 ? 's' : '') + ' et ' + usage.emails.used + ' email' +
        (usage.emails.used > 1 ? 's' : '') + ' parti' + (usage.emails.used > 1 ? 's' : '') +
        ' depuis le 1er du mois.</p>';
  }

  /* Un compte neuf n'a pas d'historique de facturation. Trois factures payées
     affichées le jour de l'inscription, c'est le genre de détail qui apprend au
     professionnel que rien de ce qu'il voit n'est à lui. */
  function billing() {
    var S2 = store.state;
    if (S2.dataMode === 'empty' || !S2.configured) {
      var plan = window.ALLY_PLAN_BY_ID(S2.planId);
      var end = S2.subscription && S2.subscription.trialEndsOn;
      return '<div class="empty">Aucune facture pour l\'instant. ' +
        (end
          ? 'Votre essai court jusqu\'au ' + esc(end) + ' — la première facture de '
            + plan.price + ' € partira ce jour-là.'
          : 'La première facture partira à la fin de votre essai.') +
        '</div>';
    }

    var plan = window.ALLY_PLAN_BY_ID(S2.planId);
    var rows = [], date = new Date();
    for (var i = 1; i <= 3; i++) {
      var d = new Date(date.getFullYear(), date.getMonth() - i + 1, 1);
      rows.push([
        '01/' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '/' + d.getFullYear(),
        plan.price + ' €'
      ]);
    }
    return rows.map(function (row) {
      return '<div class="tri-row"><span>' + row[0] + '</span><span>' + row[1] + '</span>' +
        '<span>Payée</span></div>';
    }).join('');
  }

  /* Journal du serveur, tenu à jour par un rafraîchissement discret. « null »
     signifie « pas de serveur » : l'écran affiche alors l'exemple. */
  var journal = null;

  var JOURNAL_LABELS = {
    login: 'Connexion à l\'espace pro', 'login-failed': 'Tentative de connexion refusée',
    logout: 'Déconnexion', signup: 'Création du cabinet', verified: 'Adresse confirmée',
    'code-issued': 'Code à usage unique envoyé', 'password-reset': 'Mot de passe réinitialisé',
    'call-received': 'Appel reçu et enregistré', 'message-sent': 'Email envoyé',
    'rdv-created': 'Rendez-vous posé', 'rdv-cancelled': 'Rendez-vous annulé',
    'rdv-moved': 'Rendez-vous déplacé', 'member-invited': 'Collaborateur invité',
    'member-joined': 'Collaborateur arrivé', 'member-removed': 'Collaborateur retiré',
    'cabinet-updated': 'Fiche du cabinet modifiée', 'data-exported': 'Export des données',
    'retention-purge': 'Effacement automatique (conservation)'
  };

  function journalEntries() {
    if (!journal) return null;
    return journal.map(function (e) {
      var d = new Date(e.at);
      var jour = d.toDateString() === new Date().toDateString()
        ? "Aujourd'hui" : window.ALLY_DATE(e.at);
      return {
        who: e.userId ? 'Compte du cabinet' : 'Ally (système)',
        what: JOURNAL_LABELS[e.action] || e.action,
        when: jour + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':'
          + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
      };
    });
  }

  function accountPrivacy() {
    var who = store.fullName();
    var log = [
      { who: who, what: "Consultation des transcriptions d'appels", when: "Aujourd'hui 09:20" },
      { who: 'Ally (système)', what: 'Traitement automatique — appel entrant', when: "Aujourd'hui 09:12" },
      { who: who, what: 'Export des données de facturation', when: 'Hier 17:40' }
    ];
    /* Ligne connectée : le journal vient du serveur et dit ce qui s'est
       réellement passé. Sans serveur, il reste l'exemple — clairement annoncé
       comme tel, plutôt que présenté comme un vrai relevé d'accès. */
    var reel = journalEntries();

    return '<div class="stack limit-800">' +
      '<div class="card"><p class="card-title">Journal d\'accès aux données</p>' +
        (reel
          ? (reel.length
              ? reel.map(function (row) {
                  return '<div class="tri-row"><span>' + esc(row.who) + '</span>' +
                    '<span>' + esc(row.what) + '</span><span>' + esc(row.when) + '</span></div>';
                }).join('')
              : '<div class="empty">Rien à signaler pour l\'instant.</div>')
          : log.map(function (row) {
              return '<div class="tri-row"><span>' + esc(row.who) + '</span>' +
                '<span>' + esc(row.what) + '</span><span>' + esc(row.when) + '</span></div>';
            }).join('') +
            '<p class="note" style="margin-top:12px">Exemple. Le journal réel ' +
              'apparaît ici dès que la ligne est connectée au serveur.</p>') +
      '</div>' +
      '<div class="card"><p class="card-title">Conservation des enregistrements</p>' +
        '<div class="slider-head"><label for="retention">Durée de conservation</label>' +
          '<output id="out-retention" for="retention">' + S.retentionDays + ' jours</output></div>' +
        '<input type="range" id="retention" min="7" max="365" value="' + S.retentionDays + '">' +
        '<div class="danger-actions">' +
          '<button type="button" class="btn btn-ghost btn-md" id="export-data">Exporter mes données</button>' +
          '<button type="button" class="btn btn-danger btn-md" id="wipe-data">Supprimer toutes mes données</button>' +
        '</div>' +
      '</div>' +
      '<div class="card"><p class="card-title">Ce compte</p>' +
        '<div class="tri-row"><span>Nom d\'usage</span><span>' + esc(name()) + '</span><span></span></div>' +
        '<div class="tri-row"><span>' + esc(P().orgLabel) + '</span><span>' + esc(S.identity.org) + '</span><span></span></div>' +
        '<div class="tri-row"><span>Email</span><span>' + esc(S.identity.email || '—') + '</span><span></span></div>' +
        '<div class="tri-row"><span>Portable</span><span>' + esc(S.identity.phone || '—') + '</span><span></span></div>' +
        '<div class="danger-actions">' +
          '<button type="button" class="btn btn-ghost btn-md" id="edit-profile">Modifier mon profil</button>' +
          (store.isNew()
            ? '<button type="button" class="btn btn-ghost btn-md" data-sample="load">Charger des données d\'exemple</button>'
            : '<button type="button" class="btn btn-ghost btn-md" id="sample-clear">Retirer les données d\'exemple</button>') +
          '<button type="button" class="btn btn-danger btn-md" id="reset-account">Réinitialiser la démonstration</button>' +
        '</div>' +
      '</div></div>';
  }

  function accountAlerts() {
    return '<div class="stack limit-640">' +
      '<div class="card"><p class="card-title">Canaux d\'alerte pour les urgences</p>' +
        switchRow('notif', 'sms', 'SMS', 'Au ' + (S.identity.phone || 'numéro de transfert')) +
        switchRow('notif', 'push', 'Notification push', 'Sur cet appareil') +
        switchRow('notif', 'email', 'Email', S.identity.email || 'Adresse professionnelle') +
      '</div>' +
      '<div class="card"><p class="card-title">Fréquence des résumés</p>' +
        '<div class="choice-row" role="group" aria-label="Fréquence des résumés">' +
          '<button type="button" class="choice" data-freq="daily" aria-pressed="' + (S.summaryFreq === 'daily') + '">Quotidien</button>' +
          '<button type="button" class="choice" data-freq="weekly" aria-pressed="' + (S.summaryFreq === 'weekly') + '">Hebdomadaire</button>' +
        '</div>' +
      '</div>' +

      /* Un réglage qu'on n'a jamais vu à l'œuvre ne s'active pas : on montre
         l'email exact qui partirait ce soir, avec les données du compte. */
      '<div class="card"><p class="card-title">Ce que vous recevrez</p>' +
        digestPreview() +
        '<div class="transcript-actions" style="margin-top:16px">' +
          '<button type="button" class="btn btn-ghost btn-sm" id="digest-send">' +
            'Me l\'envoyer maintenant</button>' +
          '<span class="row-meta">Envoyé à ' + esc(S.identity.email || 'votre adresse') +
            (S.summaryFreq === 'daily' ? ' chaque soir à 19 h' : ' chaque vendredi à 18 h') + '</span>' +
        '</div>' +
      '</div></div>';
  }

  /* Rendu de l'email de résumé, à partir des données réelles du compte. */
  function digestPreview() {
    var usage = store.usage();
    var rdv = todayRdv();
    var lines = [
      calls().length + ' appel' + (calls().length > 1 ? 's' : '') + ' pris' +
        (calls().length > 1 ? '' : '') + ' par Ally',
      drafts().length + ' email' + (drafts().length > 1 ? 's' : '') + ' en attente de votre validation',
      rdv.length ? rdv.length + ' rendez-vous aujourd\'hui' : 'Aucun rendez-vous aujourd\'hui',
      'Forfait : ' + usage.calls.used + ' appels sur ' + usage.calls.limit
    ];
    var urgent = urgentCall();

    return '<div class="mail-preview">' +
      '<p class="transcript-label">De : Ally &lt;resume@ally.fr&gt; — Objet : Votre journée du ' +
        esc(dateLabel().toLowerCase()) + '</p>' +
      '<p class="transcript-text">' + esc(store.tone().mailOpen) + '<br><br>' +
        'Voici votre récapitulatif, ' + esc(name()) + '.</p>' +
      '<ul class="digest-list">' + lines.map(function (line) {
        return '<li>' + esc(line) + '</li>';
      }).join('') + '</ul>' +
      (urgent
        ? '<p class="lock-note">À traiter en priorité : ' + esc(urgent.caller) + ' — ' +
          esc(urgent.subject) + ', à ' + esc(urgent.time) + '.</p>'
        : '') +
      '<p class="mail-sign">Ally, assistante de ' + esc(S.identity.org || name()) + '</p>' +
    '</div>';
  }

  var TUTORIALS = [
    { title: 'Choisir la voix d\'Ally',
      body: 'Onglet Téléphonie → La voix d\'Ally. Cliquez une voix, elle se présente aussitôt. '
        + 'Réglez le débit et la hauteur, puis « Essayer cette voix ». Le choix vaut pour le '
        + 'téléphone comme pour l\'application.' },
    { title: 'Écrire votre script d\'appel',
      body: 'Onglet Téléphonie → Votre script d\'appel. Six étapes, de l\'accueil à la clôture. '
        + 'Modifiez le texte : Ally dira exactement vos phrases. « Écouter » vous les fait entendre '
        + 'avec sa voix avant de valider.' },
    { title: 'Comprendre le mode brouillon à valider',
      body: 'Pour les métiers à secret professionnel, aucun email métier ne part sans vous. Ally '
        + 'prépare, vous relisez, vous envoyez. Le curseur Emails de l\'onglet Ally reste alors '
        + 'sur « Toujours valider ».' },
    { title: 'Donner des ordres à Ally à la voix',
      body: 'Bouton « Parler à Ally » en bas à droite. Dites par exemple « déplace mon rendez-vous '
        + 'de 14h à demain ». Ally répète l\'ordre avant d\'exécuter les actions sensibles, selon '
        + 'le niveau de confirmation que vous avez choisi.' }
  ];

  function accountHelp() {
    return '<div class="cols cols-12 limit-1000">' +
      '<div class="card chat">' +
        '<div class="chat-head">' +
          '<div><p class="card-title" style="margin-bottom:2px">Écrire à Ally</p>' +
            '<p class="note">Même moteur que la commande vocale : elle répond pareil.</p></div>' +
          '<div class="switch-row" style="gap:10px">' +
            '<span id="lbl-speak" style="font-size:12px;color:var(--txt-4)">Lire à voix haute</span>' +
            '<button type="button" class="toggle" role="switch" id="chat-speak"' +
              ' aria-checked="' + !!S.chatSpeaks + '" aria-labelledby="lbl-speak"></button>' +
          '</div>' +
        '</div>' +
        '<div class="chat-log" id="chat-log">' +
          '<div class="bubble bubble-in">Bonjour ' + esc(name()) + '. Posez-moi une question sur ' +
            'votre agenda, vos appels ou votre cabinet — ou donnez-moi un ordre.</div>' +
        '</div>' +
        '<div class="chat-suggestions">' +
          window.ALLY_BRAIN.suggestions().slice(0, 3).map(function (text) {
            return '<button type="button" class="voice-chip-sm" data-suggest>' + esc(text) + '</button>';
          }).join('') +
        '</div>' +
        '<form class="chat-form" id="chat-form">' +
          '<label class="sr-only" for="chat-input">Votre message</label>' +
          '<input class="field" id="chat-input" type="text" placeholder="Écrire à Ally..." autocomplete="off">' +
          '<button type="submit" class="btn btn-primary btn-md">Envoyer</button>' +
        '</form>' +
      '</div>' +
      '<div class="card"><p class="card-title">Tutoriels</p>' +
        TUTORIALS.map(function (t, i) {
          return '<div class="tuto-item">' +
            '<button type="button" class="tuto" data-tuto="' + i + '" aria-expanded="false">' +
              esc(t.title) + '</button>' +
            '<p class="tuto-body" id="tuto-' + i + '" hidden>' + esc(t.body) + '</p>' +
          '</div>';
        }).join('') +
      '</div></div>';
  }

  /* Services qu'Ally doit relier pour travailler réellement. */
  var SERVICES = [
    { id: 'gmail',    name: 'Gmail',            role: 'Lecture des emails entrants et envoi des réponses',
      need: 'Autorisation Google (OAuth), périmètre lecture + envoi' },
    { id: 'outlook',  name: 'Outlook / Microsoft 365', role: 'Alternative à Gmail pour la messagerie',
      need: 'Autorisation Microsoft (OAuth)' },
    { id: 'gcal',     name: 'Google Calendar',  role: 'Lecture des disponibilités, création et déplacement de rendez-vous',
      need: 'Autorisation Google (OAuth), périmètre agenda' },
    { id: 'phone',    name: 'Numéro de téléphone', role: 'La ligne sur laquelle Ally décroche',
      need: 'Numéro fourni par Ally, ou renvoi de votre ligne existante' },
    { id: 'sms',      name: 'Alertes SMS',      role: 'Notifications d\'urgence sur votre portable',
      need: 'Votre numéro de portable, déjà renseigné' }
  ];

  function accountLinks() {
    return '<div class="stack limit-800">' +
      '<div class="card">' +
        '<p class="card-title">Connexions</p>' +
        '<p class="note" style="margin-bottom:18px">Ally a besoin d\'accéder à votre messagerie, ' +
          'à votre agenda et à une ligne téléphonique pour travailler à votre place.</p>' +
        SERVICES.map(function (svc) {
          var on = !!S.links[svc.id];
          return '<div class="link-row">' +
            '<span class="link-state ' + (on ? 'on' : 'off') + '" aria-hidden="true"></span>' +
            '<div class="link-main">' +
              '<strong>' + esc(svc.name) + '</strong>' +
              '<span>' + esc(svc.role) + '</span>' +
              (on ? '<span class="link-need">Connecté</span>'
                  : '<span class="link-need">' + esc(svc.need) + '</span>') +
            '</div>' +
            '<button type="button" class="btn ' + (on ? 'btn-ghost' : 'btn-primary') +
              ' btn-sm" data-link="' + svc.id + '">' + (on ? 'Déconnecter' : 'Connecter') + '</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="card">' +
        '<p class="card-title">Ce que la démonstration ne fait pas</p>' +
        '<p class="note">Ces connexions sont simulées. Relier réellement Gmail ou Google ' +
          'Calendar suppose un serveur, une autorisation OAuth validée par Google, et un ' +
          'hébergement européen conforme au RGPD — impossible depuis une page seule. ' +
          'L\'interface est ici pour montrer le parcours et les autorisations demandées.</p>' +
      '</div></div>';
  }

  var ACCOUNT_VIEWS = { plan: accountPlan, links: accountLinks, privacy: accountPrivacy, alerts: accountAlerts, help: accountHelp };

  function viewAccount() {
    return '<div class="choice-row filters" role="group" aria-label="Sections du compte">' +
      ACCOUNT_SECTIONS.map(function (section) {
        return '<button type="button" class="choice" data-account="' + section.id + '"' +
          ' aria-pressed="' + (ui.account === section.id) + '">' + esc(section.label) + '</button>';
      }).join('') + '</div>' + ACCOUNT_VIEWS[ui.account]();
  }

  var VIEWS = {
    today: viewToday, conversations: viewConversations, agenda: viewAgenda,
    telephony: function () { return window.ALLY_TELEPHONY.view(); },
    ally: viewAlly, account: viewAccount
  };

  /* ---------- Liaison des événements ---------- */
  /* Ligne connectée et jeu de démonstration encore chargé : l'écran montre
     côte à côte de vraies données et des fausses. On le dit, plutôt que de
     laisser deviner — et on propose de retirer les exemples d'un clic. */
  function demoNotice() {
    if (!window.ALLY_API || !window.ALLY_API.online() || !window.ALLY_API.cabinetId()) return '';
    if (S.dataMode !== 'sample') return '';
    if (['today', 'conversations', 'agenda', 'telephony'].indexOf(ui.tab) < 0) return '';

    return '<div class="alert"><span class="dot"></span><div>' +
      '<strong>Vous voyez deux choses à la fois</strong>' +
      '<p class="row-meta">Les cartes marquées <em>réel</em> viennent de votre ligne. ' +
        'Le reste est le jeu de démonstration, chargé pour montrer le produit.</p></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-drop-sample>' +
        'Retirer les exemples</button>' +
    '</div>';
  }

  function renderPanel() {
    el.panel.innerHTML = demoNotice() + VIEWS[ui.tab]();
    var panel = el.panel;

    var drop = panel.querySelector('[data-drop-sample]');
    if (drop) {
      drop.addEventListener('click', function () {
        store.clearActivity();
        renderNav(); renderPanel(); renderChrome();
        flash('Données d\'exemple retirées — il ne reste que votre ligne');
      });
    }

    /* Un envoi peut être en cours au moment où l'on change d'onglet : le
       décompte doit repartir, sinon il se fige sur l'écran suivant. */
    if (store.sending().length) startUndoTicker(); else stopUndoTicker();

    if (ui.tab === 'telephony') window.ALLY_TELEPHONY.bind(panel, renderPanel);
    if (ui.tab === 'agenda') window.ALLY_AGENDA.bind(panel, renderPanel);
    if (ui.tab === 'agenda' && window.ALLY_DIARY) window.ALLY_DIARY.bind(panel, renderPanel);
    if (ui.tab === 'conversations' && window.ALLY_MAILBOX) {
      window.ALLY_MAILBOX.bind(panel, renderPanel);
    }
    if (ui.tab === 'account' && ui.account === 'plan' && window.ALLY_TEAM) {
      window.ALLY_TEAM.bind(panel, renderPanel);
    }

    /* Journal d'accès : lu une fois à l'ouverture de l'onglet Sécurité. Il ne
       change pas assez vite pour mériter un battement. */
    if (ui.tab === 'account' && ui.account === 'privacy'
        && window.ALLY_API && window.ALLY_API.online() && window.ALLY_API.cabinetId()) {
      window.ALLY_API.journal().then(function (res) {
        if (!res.ok) return;
        var avant = journal ? journal.length : -1;
        journal = res.body.events || [];
        if (journal.length !== avant && ui.account === 'privacy') renderPanel();
      }).catch(function () {});
    }

    /* ---------- Actions réelles sur les données du compte ---------- */

    // Envoyer un brouillon : il quitte la file et rejoint les envois.
    panel.querySelectorAll('[data-send]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-send'));
        var mail = store.sendMail(id, function () {
          /* Passé les dix secondes, l'email est parti : on rafraîchit. */
          if (ui.tab === 'conversations' || ui.tab === 'today') {
            renderNav(); renderPanel(); renderChrome();
          }
        });
        if (!mail) return;

        startUndoTicker();
        flashUndo('Envoi à ' + mail.to + ' dans ' + (store.UNDO_MS / 1000) + ' s.', function () {
          store.cancelSend(id);
          stopUndoTicker();
          renderNav(); renderPanel(); renderChrome();
          flash('Envoi annulé. Le brouillon est toujours là.');
        });

        renderNav(); renderPanel(); renderChrome();
        el.sub.textContent = SUBS[ui.tab]();
      });
    });

    // Modifier un brouillon avant envoi.
    panel.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('data-editing') === '1') return;
        var id = Number(button.getAttribute('data-edit'));
        var mail = drafts().filter(function (m) { return m.id === id; })[0];
        if (!mail) return;
        store.record('draft-edited');
        mail.edited = true;
        var box = button.closest('.mail-preview');
        var text = box.querySelector('.transcript-text');
        var area = document.createElement('textarea');
        area.className = 'field';
        area.rows = 4;
        area.value = mail.preview;
        text.replaceWith(area);
        area.focus();
        button.textContent = 'Enregistrer';
        button.setAttribute('data-editing', '1');
        button.addEventListener('click', function save() {
          mail.preview = area.value;
          store.save();
          renderPanel();
        }, { once: true });
      });
    });

    // Écouter la transcription avec la voix d'Ally.
    panel.querySelectorAll('[data-play]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-play'));
        var c = calls().filter(function (x) { return x.id === id; })[0];
        if (c) window.ALLY_VOICE.speak(c.transcript, store.voiceOptions());
      });
    });

    // Corriger une transcription mal comprise.
    panel.querySelectorAll('[data-fix]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('data-editing') === '1') return;
        var id = Number(button.getAttribute('data-fix'));
        var c = calls().filter(function (x) { return x.id === id; })[0];
        if (!c) return;
        button.setAttribute('data-editing', '1');
        var box = button.closest('.transcript');
        var text = box.querySelector('.transcript-text');
        var area = document.createElement('textarea');
        area.className = 'field';
        area.rows = 4;
        area.value = c.transcript;
        text.replaceWith(area);
        area.focus();
        button.textContent = 'Enregistrer la correction';
        button.addEventListener('click', function () {
          c.transcript = area.value;
          store.log('Correction de la transcription — ' + c.caller, 'Transcription mise à jour');
          store.save();
          renderPanel();
        }, { once: true });
      });
    });

    // Base de connaissances : ajout et suppression, connus aussitôt par Ally.
    var faqOpen = panel.querySelector('#faq-open');
    var faqForm = panel.querySelector('#faq-form');
    if (faqOpen && faqForm) {
      faqOpen.addEventListener('click', function () {
        faqForm.hidden = false;
        faqOpen.hidden = true;
        document.getElementById('faq-q').focus();
      });
      panel.querySelector('#faq-cancel').addEventListener('click', function () {
        faqForm.hidden = true;
        faqOpen.hidden = false;
      });
      faqForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var q = document.getElementById('faq-q').value.trim();
        var a = document.getElementById('faq-a').value.trim();
        if (!q || !a) return;
        D().faq.push({ id: Date.now(), q: q, a: a });
        store.log('Ajout à la base de connaissances', q);
        store.save();
        renderPanel();
      });
    }
    panel.querySelectorAll('[data-faq-del]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-faq-del'));
        D().faq = D().faq.filter(function (f) { return f.id !== id; });
        store.save();
        renderPanel();
      });
    });

    panel.querySelectorAll('[data-upgrade]').forEach(function (button) {
      button.addEventListener('click', function () { ui.account = 'plan'; setTab('account'); });
    });

    // Connexions : bascule d'état, simulée mais persistée.
    panel.querySelectorAll('[data-link]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-link');
        S.links[id] = !S.links[id];
        store.log(S.links[id] ? 'Connexion de ' + id : 'Déconnexion de ' + id,
          S.links[id] ? 'Service relié à Ally' : 'Service détaché');
        store.save();
        renderPanel();
      });
    });

    // Changement de formule.
    var planOpen = panel.querySelector('#plan-open');
    if (planOpen) {
      planOpen.addEventListener('click', function () {
        var box = panel.querySelector('#plan-choices');
        box.hidden = !box.hidden;
      });
    }
    panel.querySelectorAll('[data-plan]').forEach(function (button) {
      button.addEventListener('click', function () {
        S.plan = button.getAttribute('data-plan');
        store.save();
        renderChrome();
        renderPanel();
      });
    });

    // Export RGPD : un vrai fichier JSON, téléchargé depuis le navigateur.
    var exportBtn = panel.querySelector('#export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportBtn.disabled = true;

        /* Ligne connectée : l'export contient aussi ce que le serveur détient —
           appels, emails, rendez-vous. Exporter la seule copie du navigateur
           serait un export incomplet, donc un droit d'accès mal rendu. */
        var distant = (window.ALLY_API && window.ALLY_API.online() && window.ALLY_API.cabinetId())
          ? window.ALLY_API.exportAccount().then(function (res) {
              return res.ok ? res.body : null;
            }).catch(function () { return null; })
          : Promise.resolve(null);

        distant.then(function (serveur) {
          exportBtn.disabled = false;
          download(serveur);
        });
      });

      function download(serveur) {
        var payload = JSON.stringify({
          exporte_le: new Date().toISOString(),
          identite: S.identity, metier: S.trade, horaires: S.hours,
          regles: S.rules, autonomie: S.autonomy, script: store.script(),
          donnees: D(),
          serveur: serveur
        }, null, 2);
        var blob = new Blob([payload], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'ally-donnees-' + (S.identity.lastName || 'compte').toLowerCase() + '.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        exportBtn.textContent = serveur ? 'Export complet téléchargé' : 'Export téléchargé';
        window.setTimeout(function () { exportBtn.textContent = 'Exporter mes données'; }, 2500);
      }
    }

    // Suppression : effacement réel, avec confirmation.
    var wipeBtn = panel.querySelector('#wipe-data');
    if (wipeBtn) {
      wipeBtn.addEventListener('click', function () {
        if (wipeBtn.getAttribute('data-armed') !== '1') {
          wipeBtn.setAttribute('data-armed', '1');
          wipeBtn.textContent = 'Confirmer la suppression définitive';
          window.setTimeout(function () {
            wipeBtn.removeAttribute('data-armed');
            wipeBtn.textContent = 'Supprimer toutes mes données';
          }, 5000);
          return;
        }
        /* Ligne connectée : la suppression vaut aussi côté serveur, et elle
           y est définitive. On redemande le mot de passe — un effacement
           irréversible ne doit pas tenir à un onglet resté ouvert. */
        if (window.ALLY_API && window.ALLY_API.online() && window.ALLY_API.cabinetId()) {
          var mot = window.prompt('Cette suppression est définitive, y compris sur le '
            + 'serveur d\'Ally : appels, emails, rendez-vous, collaborateurs.\n\n'
            + 'Saisissez votre mot de passe pour confirmer.');
          if (!mot) {
            wipeBtn.removeAttribute('data-armed');
            wipeBtn.textContent = 'Supprimer toutes mes données';
            return;
          }

          wipeBtn.disabled = true;
          window.ALLY_API.deleteAccount(mot).then(function (res) {
            wipeBtn.disabled = false;
            if (!res.ok) {
              flash((res.body && res.body.error) || 'Suppression refusée.');
              wipeBtn.removeAttribute('data-armed');
              wipeBtn.textContent = 'Supprimer toutes mes données';
              return;
            }
            if (window.ALLY_ACCOUNTS) window.ALLY_ACCOUNTS.logout();
            store.reset();
            window.ALLY_RESTART();
          }).catch(function () {
            wipeBtn.disabled = false;
            flash('Serveur injoignable — rien n\'a été supprimé.');
          });
          return;
        }

        store.reset();
        window.ALLY_RESTART();
      });
    }

    // Tutoriels dépliables.
    panel.querySelectorAll('[data-tuto]').forEach(function (button) {
      button.addEventListener('click', function () {
        var body = document.getElementById('tuto-' + button.getAttribute('data-tuto'));
        var open = body.hidden;
        body.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      });
    });

    // Agenda : annuler ou déplacer un rendez-vous, bloquer une demi-journée.
    panel.querySelectorAll('[data-rdv-cancel]').forEach(function (button) {
      button.addEventListener('click', function () {
        /* Comparaison en chaîne : les identifiants du serveur n'en sont pas
           des nombres, et Number() en faisait des NaN — le bouton ne trouvait
           plus rien à annuler. */
        var id = button.getAttribute('data-rdv-cancel');
        var r = D().rdv.filter(function (x) { return String(x.id) === id; })[0];

        var sent = window.ALLY_SYNC && r
          ? window.ALLY_SYNC.dropRdv(r.id)
          : Promise.resolve(false);

        sent.then(function (result) {
          if (result && !result.ok) { flash(result.error); return; }

          D().rdv = D().rdv.filter(function (x) { return String(x.id) !== id; });
          if (r) {
            store.log('Annulation du rendez-vous de ' + r.client,
              'Créneau libéré, ' + r.client + ' prévenu');
          }
          store.save();
          renderNav(); renderPanel();
          el.sub.textContent = SUBS[ui.tab]();
        });
      });
    });
    var blockForm = panel.querySelector('#block-form');
    if (blockForm) {
      blockForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var day = document.getElementById('block-day').value;
        var half = document.getElementById('block-half').value;
        D().blocked.unshift({ id: Date.now(), label: day + ' ' + half });
        store.log('Blocage de créneau', day + ' ' + half + ' rendu indisponible');
        store.save();
        renderPanel();
      });
    }
    panel.querySelectorAll('[data-unblock]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-unblock'));
        D().blocked = D().blocked.filter(function (b) { return b.id !== id; });
        store.save();
        renderPanel();
      });
    });

    var digestSend = panel.querySelector('#digest-send');
    if (digestSend) {
      digestSend.addEventListener('click', function () {
        store.log('Résumé envoyé à la demande', S.identity.email || 'adresse professionnelle');
        flash('Résumé envoyé à ' + (S.identity.email || 'votre adresse') + '.');
      });
    }

    var sampleClear = panel.querySelector('#sample-clear');
    if (sampleClear) {
      sampleClear.addEventListener('click', function () {
        if (!window.confirm('Retirer les données d\'exemple ? Votre configuration est conservée.')) return;
        store.clearActivity();
        renderPanel();
        renderChrome();
        flash('Données d\'exemple retirées. Le compte repart à zéro.');
      });
    }

    panel.querySelectorAll('[data-upgrade]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-upgrade');
        S.planId = id;
        S.plan = window.ALLY_PLAN_BY_ID(id).name;
        store.save();
        store.syncAccount();
        renderNav(); renderPanel(); renderChrome();
        flash('Formule ' + S.plan + ' active. Le forfait est réévalué immédiatement.');
      });
    });

    panel.querySelectorAll('[data-insight-yes]').forEach(function (button) {
      button.addEventListener('click', function () {
        var insight = store.insight();
        if (!insight || insight.id !== button.getAttribute('data-insight-yes')) return;
        if (insight.apply) insight.apply();
        store.dismissInsight(insight.id);
        store.record('insight-accepted', insight.id);
        if (insight.go) { setTab(insight.go); return; }
        renderNav(); renderPanel(); renderChrome();
        flash('C\'est appliqué.');
      });
    });

    panel.querySelectorAll('[data-insight-no]').forEach(function (button) {
      button.addEventListener('click', function () {
        store.dismissInsight(button.getAttribute('data-insight-no'));
        renderPanel();
        flash('Entendu, je ne le reproposerai plus.');
      });
    });

    panel.querySelectorAll('[data-undo]').forEach(function (button) {
      button.addEventListener('click', function () {
        store.cancelSend(Number(button.getAttribute('data-undo')));
        stopUndoTicker();
        renderNav(); renderPanel(); renderChrome();
        flash('Envoi annulé. Le brouillon est toujours là.');
      });
    });

    /* ---- Registre, fiche du cabinet, écoute ---- */
    panel.querySelectorAll('[data-tone]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        store.setTone(chip.getAttribute('data-tone'));
        renderPanel();
        flash('Registre « ' + store.tone().label.toLowerCase() + ' » appliqué.');
      });
    });

    panel.querySelectorAll('[data-sheet]').forEach(function (input) {
      input.addEventListener('change', function () {
        S.sheet[input.getAttribute('data-sheet')] = input.value.trim();
        store.save();
        /* La fiche alimente la base de connaissances : le compteur et les
           réponses d'Ally doivent suivre immédiatement. */
        renderPanel();
        flash(store.sheetFilled() + ' fiche(s) du cabinet renseignée(s) — Ally peut y répondre.');
      });
    });

    var pickerHost = panel.querySelector('[data-voice-picker]');
    if (pickerHost) {
      window.ALLY_UI.voicePicker(pickerHost, {
        sliders: true,
        sample: function () {
          var box = panel.querySelector('#greeting');
          return (box && box.value) || store.greeting();
        },
        onChange: renderChrome
      });
    }

    var allyListen = panel.querySelector('#ally-listen');
    if (allyListen) {
      allyListen.addEventListener('click', function () {
        var voice = window.ALLY_VOICE;
        if (!voice || !voice.canSpeak()) { flash('Synthèse vocale indisponible sur ce navigateur.'); return; }
        store.markStep('heard');
        voice.speak(panel.querySelector('#greeting').value || store.greeting(), store.voiceOptions());
      });
    }

    /* ---- Mise en service et données d'exemple ---- */
    panel.querySelectorAll('[data-steps="dismiss"]').forEach(function (button) {
      button.addEventListener('click', function () {
        S.steps.dismissed = true;
        store.save();
        renderPanel();
        flash('Mise en service masquée. Elle réapparaîtra si vous changez de formule.');
      });
    });

    panel.querySelectorAll('[data-step-go]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-step-go');
        /* « Écouter » se coche à l'écoute, pas au clic : le geste doit être
           réellement accompli. Les autres mènent à l'endroit où le faire. */
        if (id !== 'heard') store.markStep(id);
        setTab(button.getAttribute('data-step-tab'));
      });
    });

    panel.querySelectorAll('[data-sample="load"]').forEach(function (button) {
      button.addEventListener('click', function () {
        store.loadSample();
        renderPanel();
        renderChrome();
        flash('Données d\'exemple chargées. Vous pouvez les retirer depuis Mon compte.');
      });
    });

    panel.querySelectorAll('[data-jump]').forEach(function (button) {
      button.addEventListener('click', function () {
        ui.filter = button.getAttribute('data-filter') || 'all';
        setTab(button.getAttribute('data-jump'));
      });
    });

    panel.querySelectorAll('[data-filter]:not([data-jump])').forEach(function (button) {
      button.addEventListener('click', function () {
        ui.filter = button.getAttribute('data-filter');
        ui.expanded = null;
        renderPanel();
      });
    });

    panel.querySelectorAll('[data-account]').forEach(function (button) {
      button.addEventListener('click', function () {
        ui.account = button.getAttribute('data-account');
        renderPanel();
      });
    });

    panel.querySelectorAll('[data-expand]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-expand');
        ui.expanded = (ui.expanded === key) ? null : key;
        renderPanel();
        var next = el.panel.querySelector('[data-expand="' + key + '"]');
        if (next) next.focus();
      });
    });

    panel.querySelectorAll('[data-autonomy]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.getAttribute('data-autonomy');
        S.autonomy[key] = Number(input.value);
        document.getElementById('out-' + key).textContent = autonomyLabel(S.autonomy[key]);
        store.save();
      });
    });

    var retention = panel.querySelector('#retention');
    if (retention) {
      var publishRetention = null;
      retention.addEventListener('input', function () {
        S.retentionDays = Number(retention.value);
        document.getElementById('out-retention').textContent = S.retentionDays + ' jours';
        store.save();

        /* Le serveur s'appuie dessus pour effacer les enregistrements
           périmés : il doit connaître la durée choisie. On attend la fin du
           glissement, sinon on lui envoie cinquante valeurs pour un geste. */
        if (window.ALLY_GATE) {
          window.clearTimeout(publishRetention);
          publishRetention = window.setTimeout(function () {
            window.ALLY_GATE.publish({ retentionDays: S.retentionDays });
          }, 600);
        }
      });
    }

    panel.querySelectorAll('[data-switch]').forEach(function (button) {
      button.addEventListener('click', function () {
        var path = button.getAttribute('data-switch').split('.');
        var value;
        if (path[0] === 'flat') { S[path[1]] = !S[path[1]]; value = S[path[1]]; }
        else { S[path[0]][path[1]] = !S[path[0]][path[1]]; value = S[path[0]][path[1]]; }
        button.setAttribute('aria-checked', String(value));
        store.save();
        renderChrome();
      });
    });

    panel.querySelectorAll('[data-freq]').forEach(function (button) {
      button.addEventListener('click', function () {
        S.summaryFreq = button.getAttribute('data-freq');
        panel.querySelectorAll('[data-freq]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        store.save();
      });
    });

    panel.querySelectorAll('[data-confirm]').forEach(function (button) {
      button.addEventListener('click', function () {
        S.confirmLevel = button.getAttribute('data-confirm');
        panel.querySelectorAll('[data-confirm]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        store.save();
      });
    });

    var greeting = panel.querySelector('#greeting');
    if (greeting) {
      greeting.addEventListener('input', function () { S.greeting = greeting.value; store.save(); });
    }

    var edit = panel.querySelector('#edit-profile');
    if (edit) edit.addEventListener('click', function () { window.location.href = 'onboarding.html'; });

    var reset = panel.querySelector('#reset-account');
    if (reset) {
      reset.addEventListener('click', function () {
        /* Réinitialise la démonstration locale, et rien d'autre : le compte du
           serveur, lui, se supprime depuis « Sécurité » — avec mot de passe. */
        store.reset();
        window.ALLY_RESTART();
      });
    }

    /* Le chat écrit et la commande vocale partagent le même moteur : poser la
       question au clavier ou à la voix donne exactement la même réponse. */
    var chatForm = panel.querySelector('#chat-form');
    if (chatForm) {
      var speakToggle = panel.querySelector('#chat-speak');
      if (speakToggle) {
        speakToggle.addEventListener('click', function () {
          S.chatSpeaks = !S.chatSpeaks;
          speakToggle.setAttribute('aria-checked', String(S.chatSpeaks));
          store.save();
        });
      }

      panel.querySelectorAll('[data-suggest]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          document.getElementById('chat-input').value = chip.textContent;
          chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        });
      });

      chatForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('chat-input');
        var text = input.value.trim();
        if (!text) return;
        var log = document.getElementById('chat-log');

        function bubble(kind, content, detail) {
          var node = document.createElement('div');
          node.className = 'bubble bubble-' + kind;
          node.textContent = content;
          if (detail) {
            var small = document.createElement('span');
            small.className = 'bubble-detail';
            small.textContent = detail;
            node.appendChild(small);
          }
          log.appendChild(node);
          log.scrollTop = log.scrollHeight;
        }

        bubble('out', text);
        input.value = '';

        var result = window.ALLY_CONVERSE.respond(text);
        var answer = (result.kind === 'action' && result.confirm &&
          (S.confirmLevel === 'always' || (S.confirmLevel === 'sensitive' && result.sensitive)))
          ? result.confirm : result.reply;

        window.setTimeout(function () {
          bubble('in', answer, result.detail);
          if (S.chatSpeaks) window.ALLY_VOICE.speak(answer, store.voiceOptions());

          // Les suites proposées : on clique, la conversation continue.
          var old = log.querySelector('.chat-follow');
          if (old) old.remove();
          if (result.follow && result.follow.length) {
            var row = document.createElement('div');
            row.className = 'chat-follow';
            result.follow.forEach(function (text) {
              var chip = document.createElement('button');
              chip.type = 'button';
              chip.className = 'voice-chip-sm';
              chip.textContent = text;
              chip.addEventListener('click', function () {
                input.value = text;
                chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
              });
              row.appendChild(chip);
            });
            log.appendChild(row);
            log.scrollTop = log.scrollHeight;
          }
        }, 350);
      });
    }
  }

  /* ---------- Commande vocale réelle ----------
     Le micro passe par l'API du navigateur, la réponse vient du moteur partagé
     avec le chat et la simulation d'appel, et Ally la prononce avec la voix
     choisie dans l'onglet Téléphonie. */
  var VOICE = window.ALLY_VOICE;
  var BRAIN = window.ALLY_BRAIN;
  var session = { lastFocus: null, pending: null, timers: [] };

  function clearTimers() { session.timers.forEach(clearTimeout); session.timers = []; }
  function later(fn, delay) { session.timers.push(setTimeout(fn, delay)); }

  function renderSuggestions() {
    var box = document.getElementById('voice-suggestions');
    box.innerHTML = BRAIN.suggestions().slice(0, 4).map(function (text) {
      return '<button type="button" class="voice-chip-sm">' + esc(text) + '</button>';
    }).join('');
    box.querySelectorAll('button').forEach(function (chip) {
      chip.addEventListener('click', function () { handle(chip.textContent); });
    });
  }

  function setNote(text) {
    var note = document.getElementById('voice-note');
    note.textContent = text || '';
    note.hidden = !text;
  }

  function startListening() {
    var input = document.getElementById('voice-input');

    if (!VOICE.canListen()) {
      // On le dit franchement au lieu de simuler une écoute qui n'existe pas.
      el.voiceTitle.textContent = 'Écrivez votre demande';
      el.heard.textContent = '';
      document.getElementById('voice-viz').classList.remove('is-live');
      setNote(VOICE.listenBlockedReason());
      input.focus();
      return;
    }

    el.voiceTitle.textContent = 'Ally écoute…';
    el.heard.textContent = '';
    document.getElementById('voice-viz').classList.add('is-live');
    setNote('Parlez, ou écrivez si vous préférez.');

    VOICE.listen({
      onPartial: function (text) { el.heard.textContent = '« ' + text + '… »'; },
      onResult: function (text) { handle(text); },
      onError: function (message) {
        document.getElementById('voice-viz').classList.remove('is-live');
        el.voiceTitle.textContent = 'Micro indisponible';
        setNote(message);
        input.focus();
      },
      onEnd: function () { document.getElementById('voice-viz').classList.remove('is-live'); }
    });
  }

  /* Traite une demande, qu'elle vienne du micro ou du clavier. */
  function handle(text) {
    VOICE.stopListening();
    clearTimers();
    document.getElementById('voice-viz').classList.remove('is-live');

    el.heard.textContent = '« ' + text + ' »';
    el.voiceTitle.textContent = 'Ally répond';

    var result = window.ALLY_CONVERSE.respond(text);
    var needsConfirm = result.kind === 'action' &&
      (S.confirmLevel === 'always' || (S.confirmLevel === 'sensitive' && result.sensitive));

    var detail = document.getElementById('voice-detail');
    detail.textContent = result.detail || '';
    detail.hidden = !result.detail;

    if (needsConfirm) {
      var question = result.confirm || 'Vous confirmez cet ordre avant que je l\'exécute ?';
      el.confirm.textContent = question;
      el.confirm.hidden = false;
      el.voiceOk.hidden = false;
      el.voiceOk.focus();
      session.pending = result;
      VOICE.speak(question, store.voiceOptions());
      logVoice(text, 'À valider');
      return;
    }

    settle(result, text);
  }

  function settle(result, spoken) {
    el.confirm.hidden = true;
    el.voiceOk.hidden = true;
    session.pending = null;

    if (result.apply) result.apply();
    el.voiceTitle.textContent = result.kind === 'action' ? 'C\'est fait' : 'Ally répond';
    VOICE.speak(result.reply, store.voiceOptions());

    var box = document.getElementById('voice-suggestions');
    box.innerHTML = '<p class="voice-reply">' + esc(result.reply) + '</p>' +
      ((result.follow && result.follow.length)
        ? '<div class="voice-follow">' + result.follow.map(function (text) {
            return '<button type="button" class="voice-chip-sm">' + esc(text) + '</button>';
          }).join('') + '</div>'
        : '');
    box.querySelectorAll('.voice-chip-sm').forEach(function (chip) {
      chip.addEventListener('click', function () { handle(chip.textContent); });
    });
    document.getElementById('voice-again').hidden = false;

    if (spoken) logVoice(spoken, result.kind === 'action' ? 'Exécuté' : 'Répondu');
    renderChrome();
  }

  /* Trace l'ordre dans l'historique visible sous l'onglet Ally.
     Il s'écrit dans les données du compte, pas dans le profil métier : ce
     dernier est un objet partagé par tous les comptes du même métier, il n'est
     jamais enregistré, et l'onglet Ally lit ailleurs. Les ordres vocaux
     n'apparaissaient donc nulle part, tout en polluant le profil. */
  function logVoice(order, status) {
    D().voiceLog.unshift({
      id: Date.now(), order: order, when: 'À l\'instant',
      result: status === 'À valider' ? 'En attente de votre confirmation' : 'Traité par Ally',
      state: status === 'À valider' ? 'wait' : 'done'
    });
    store.save();
    if (ui.tab === 'ally') renderPanel();
  }

  function openVoice() {
    session.lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.confirm.hidden = true;
    el.voiceOk.hidden = true;
    document.getElementById('voice-again').hidden = true;
    document.getElementById('voice-detail').hidden = true;
    document.getElementById('voice-input').value = '';
    renderSuggestions();
    startListening();
  }

  function closeVoice() {
    clearTimers();
    VOICE.stopListening();
    VOICE.stopSpeaking();
    session.pending = null;
    el.overlay.hidden = true;
    if (session.lastFocus && session.lastFocus.focus) session.lastFocus.focus();
  }

  el.fab.addEventListener('click', openVoice);
  el.voiceCancel.addEventListener('click', closeVoice);
  document.getElementById('voice-again').addEventListener('click', function () {
    document.getElementById('voice-again').hidden = true;
    document.getElementById('voice-detail').hidden = true;
    renderSuggestions();
    startListening();
  });
  el.voiceOk.addEventListener('click', function () {
    if (session.pending) settle(session.pending, null);
  });
  document.getElementById('voice-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var input = document.getElementById('voice-input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    handle(text);
  });
  el.overlay.addEventListener('click', function (event) {
    if (event.target === el.overlay) closeVoice();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (!el.overlay.hidden) closeVoice();
    else if (el.shell.classList.contains('drawer-open')) closeDrawer();
  });

  /* ---------- Démarrage ---------- */
  window.ALLY_PALETTE.init({
    goTab: function (tab, filter) { if (filter) ui.filter = filter; setTab(tab); },
    goAccount: function (section) { ui.account = section; setTab('account'); },
    openVoice: openVoice,
    exportData: function () { exportJSON('compte', { identite: S.identity, donnees: D() }); },
    ask: function (question) { openVoice(); window.setTimeout(function () { handle(question); }, 120); }
  });

  renderChrome();
  renderActions();
  setTab('today');

  /* Le fichier de démonstration autonome n'a pas de rechargement de page :
     il appelle ce point d'entrée pour relire le compte après l'onboarding. */
  /* Permet aux composants partagés (le choix de la voix, par exemple) de
     rafraîchir la barre latérale sans re-rendre tout le panneau. */
  window.ALLY_CHROME_REFRESH = renderChrome;

  /* La sonde de l'API répond après le premier rendu : on remet à jour le
     libellé de stockage, et l'onglet Téléphonie si c'est celui qui est
     affiché — c'est lui qui porte la ligne réelle. */
  if (window.ALLY_API) {
    window.ALLY_API.onReady(function (online) {
      renderChrome();
      if (!online) return;
      /* Le serveur fait autorité sur la formule et la raison sociale : on les
         reprend avant de redessiner, sinon l'écran annonce celles du
         navigateur. */
      var done = window.ALLY_GATE ? window.ALLY_GATE.adopt() : Promise.resolve();
      done.then(function () {
        /* Et on recopie les données du serveur dans l'espace de travail, pour
           qu'Ally, le calendrier et le résumé du soir parlent de la même
           journée que les cartes « réelles ». */
        if (window.ALLY_SYNC) {
          window.ALLY_SYNC.start(function () {
            renderNav(); renderChrome(); renderPanel();
          });
        }
        renderChrome();
        renderNav();
        if (ui.tab === 'telephony' || ui.tab === 'conversations'
            || ui.tab === 'account' || ui.tab === 'agenda') {
          renderPanel();
        }
      });
    });
  }

  window.ALLY_DASHBOARD_REFRESH = function () {
    renderChrome();
    setTab(ui.tab);
  };
})();
