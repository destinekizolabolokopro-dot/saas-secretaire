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

  var DATE_LABEL = 'Mardi 28 juillet 2026';

  /* ---------- Dérivés du profil ---------- */
  function drafts()   { return D().drafts; }
  function calls()    { return D().calls; }
  function todayRdv() { return D().rdv.filter(function (r) { return r.day === 'Auj.'; }); }
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

  /* ---------- En-tête et barre latérale ---------- */
  function renderChrome() {
    var p = P();
    el.profileName.textContent = name();
    el.profileOrg.textContent = S.identity.org || p.orgLabel;
    el.avatar.textContent = ((S.identity.firstName || '?')[0] + (S.identity.lastName || '?')[0]).toUpperCase();
    el.badgePlan.textContent = store.plan();
    el.notifBadge.hidden = !urgentCall();
    el.fab.hidden = !S.voiceEnabled;
    document.title = 'Espace pro — ' + name() + ' — Ally';
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
      return DATE_LABEL + ' · ' + (n ? n + ' action' + (n > 1 ? 's' : '') + ' à traiter' : 'rien à traiter');
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

    el.title.textContent = (id === 'today') ? 'Bonjour ' + name()
      : (id === 'account') ? 'Mon compte' : tab.label;
    el.sub.textContent = SUBS[id]();

    renderNav();
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
        hits.push({ tab: 'agenda', filter: 'all', label: r.client, sub: r.day + ' · ' + r.time, kind: 'RDV' });
      }
    });
    D().faq.forEach(function (f) {
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

  function emptyState(text) {
    return '<div class="empty">' + esc(text) + '</div>';
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

  function viewToday() {
    var p = P();
    var items = todoItems();

    return '' +
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
    return '<div class="conv is-draft">' +
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
          '<div class="transcript-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-send="' + mail.id + '">Envoyer</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + mail.id + '">Modifier</button>' +
          '</div>' +
        '</div>' +
      '</div></div>';
  }

  function viewConversations() {
    var p = P();
    var showDrafts = ui.filter === 'all' || ui.filter === 'validate' || ui.filter === 'emails';
    var showCalls  = ui.filter === 'all' || ui.filter === 'calls';
    var showSent   = ui.filter === 'all' || ui.filter === 'emails';

    var out = '<div class="choice-row filters" role="group" aria-label="Filtrer les conversations">' +
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
  function viewAgenda() {
    var p = P();
    var today = todayRdv();
    var later = D().rdv.filter(function (r) { return r.day !== 'Auj.'; });

    function rdvRow(r, withDay) {
      return '<div class="rdv">' +
        '<span class="rdv-day">' + esc(withDay ? r.day : r.time) + '</span>' +
        '<div class="rdv-main"><p class="row-name">' + esc(r.client) + '</p>' +
        '<p class="row-meta">' + esc(r.type) + (withDay ? ' · ' + esc(r.time) : '') + '</p></div>' +
        '<button type="button" class="btn-link danger" data-rdv-cancel="' + r.id + '">Annuler</button>' +
        '</div>';
    }

    return '<div class="cols cols-14">' +
      '<div class="stack">' +
        '<div class="card"><p class="card-title">Aujourd\'hui</p>' +
          (today.length ? today.map(function (r) { return rdvRow(r, false); }).join('')
            : emptyState('Aucun rendez-vous aujourd\'hui.')) +
        '</div>' +
        '<div class="card"><p class="card-title">À venir</p>' +
          later.map(function (r) { return rdvRow(r, true); }).join('') +
        '</div>' +
      '</div>' +
      '<div class="stack">' +
        '<div class="card"><p class="card-title">Synchronisation</p>' +
          '<div class="sync-row"><span>Google Calendar</span><span class="sync-dot" aria-hidden="true"></span></div>' +
          '<p class="note" style="margin-top:14px">' + esc(P().agendaRules) + '</p>' +
        '</div>' +
        '<div class="card"><p class="card-title">Bloquer un créneau</p>' +
          '<p class="note" style="margin-bottom:14px">Ally n\'y proposera aucun rendez-vous.</p>' +
          '<form class="block-form" id="block-form">' +
            '<label class="sr-only" for="block-day">Jour</label>' +
            '<select class="field" id="block-day">' +
              ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(function (d) {
                return '<option>' + d + '</option>';
              }).join('') + '</select>' +
            '<label class="sr-only" for="block-half">Demi-journée</label>' +
            '<select class="field" id="block-half">' +
              '<option>matin</option><option>après-midi</option><option>toute la journée</option>' +
            '</select>' +
            '<button type="submit" class="btn btn-primary btn-sm">Bloquer</button>' +
          '</form>' +
          (D().blocked.length
            ? '<div class="blocked-list">' + D().blocked.map(function (b) {
                return '<div class="row"><span style="font-size:14px">' + esc(b.label) + '</span>' +
                  '<button type="button" class="btn-link" data-unblock="' + b.id + '">Débloquer</button></div>';
              }).join('') + '</div>'
            : '') +
        '</div>' +
        '<div class="card"><p class="card-title">Modifications faites par Ally</p>' +
          '<p class="note">' + esc(P().agendaLast) + '</p>' +
        '</div>' +
      '</div></div>';
  }

  /* ================================= ALLY ================================= */
  function viewAlly() {
    var p = P();
    return '<div class="stack limit-760">' +

      '<div class="card"><p class="card-title">Niveau d\'autonomie par tâche</p>' +
        slider('calls', 'Appels') + slider('emails', 'Emails') + slider('agenda', 'Agenda') +
        (p.secret && S.rules.draft
          ? '<p class="lock-note">Profil ' + esc(p.name.toLowerCase()) + ' : le mode « brouillon à valider » '
            + 'reste imposé sur les emails — aucun contenu métier ne part sans votre accord.</p>' : '') +
      '</div>' +

      '<div class="card"><p class="card-title">Script d\'accueil téléphonique</p>' +
        '<label class="sr-only" for="greeting">Script d\'accueil téléphonique</label>' +
        '<textarea class="field" id="greeting">' + esc(store.greeting()) + '</textarea>' +
        '<p class="note" style="margin-top:12px">C\'est la première phrase que vos ' +
          esc(p.clientWord) + 's entendent.</p>' +
      '</div>' +

      '<div class="card"><p class="card-title">Commande vocale</p>' +
        switchRow('flat', 'voiceEnabled', 'Parler à Ally depuis l\'application',
          'Affiche le bouton micro en bas de l\'écran.') +
        '<p class="note" style="margin-top:12px">Le choix de la voix et son essai se font dans ' +
          '<button type="button" class="btn-link" data-jump="telephony">l\'onglet Téléphonie</button>.</p>' +
        '<p class="sub-label">Confirmation orale avant exécution</p>' +
        '<div class="choice-row" role="group" aria-label="Niveau de confirmation requis">' +
          [['none', 'Aucune'], ['sensitive', 'Actions sensibles'], ['always', 'Systématique']].map(function (pair) {
            return '<button type="button" class="choice" data-confirm="' + pair[0] + '"' +
              ' aria-pressed="' + (S.confirmLevel === pair[0]) + '">' + pair[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Derniers ordres vocaux</p>' +
        '<div class="voice-log">' + D().voiceLog.map(function (entry) {
          return '<div class="row"><div><p class="row-name">« ' + esc(entry.order) + ' »</p>' +
            '<p class="row-meta">' + esc(entry.when) + ' · ' + esc(entry.result) + '</p></div>' +
            '<span class="voice-status ' + entry.state + '">' +
            (entry.state === 'done' ? 'Exécuté' : 'À valider') + '</span></div>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Contacts prioritaires</p>' +
        '<p class="note" style="margin-bottom:14px">Ally vous transfère ces appels immédiatement.</p>' +
        D().contacts.map(function (c) {
          var label = c.name === 'Votre portable' && S.identity.phone
            ? 'Votre portable (' + S.identity.phone + ')' : c.name;
          return '<div class="row"><span style="font-size:14px">' + esc(label) + '</span>' +
            '<span class="row-meta">' + esc(c.reason) + '</span></div>';
        }).join('') +
      '</div>' +

      '<div class="card"><p class="card-title">Base de connaissances</p>' +
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
      '</div></div>';
  }

  /* ================================ COMPTE ================================ */
  function accountPlan() {
    var p = P();
    var q = p.quota;
    var pct = function (pair) { return Math.round((pair[0] / pair[1]) * 100); };
    return '<div class="cols cols-11">' +
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
          q.calls[0] + ' / ' + q.calls[1] + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill accent" style="width:' + pct(q.calls) + '%"></div></div></div>' +
        '<div class="meter"><div class="meter-head"><span>Emails traités</span><span>' +
          q.emails[0] + ' / ' + q.emails[1] + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill cyan" style="width:' + pct(q.emails) + '%"></div></div></div>' +
        '<button type="button" class="btn btn-ghost btn-md" id="plan-open">Changer de formule</button>' +
        '<div class="plan-choices" id="plan-choices" hidden>' +
          ['Essai gratuit', p.plan, 'Cabinet illimité'].map(function (label) {
            return '<button type="button" class="choice" data-plan="' + esc(label) + '"' +
              ' aria-pressed="' + (store.plan() === label) + '">' + esc(label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="card"><p class="card-title">Historique de facturation</p>' +
        [['01/07/2026', '149 €'], ['01/06/2026', '149 €'], ['01/05/2026', '149 €']].map(function (row) {
          return '<div class="tri-row"><span>' + row[0] + '</span><span>' + row[1] + '</span>' +
            '<span>Payée</span></div>';
        }).join('') +
      '</div></div>';
  }

  function accountPrivacy() {
    var who = store.fullName();
    var log = [
      { who: who, what: "Consultation des transcriptions d'appels", when: "Aujourd'hui 09:20" },
      { who: 'Ally (système)', what: 'Traitement automatique — appel entrant', when: "Aujourd'hui 09:12" },
      { who: who, what: 'Export des données de facturation', when: 'Hier 17:40' }
    ];
    return '<div class="stack limit-800">' +
      '<div class="card"><p class="card-title">Journal d\'accès aux données</p>' +
        log.map(function (row) {
          return '<div class="tri-row"><span>' + esc(row.who) + '</span>' +
            '<span>' + esc(row.what) + '</span><span>' + esc(row.when) + '</span></div>';
        }).join('') +
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
      '</div></div>';
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
  function renderPanel() {
    el.panel.innerHTML = VIEWS[ui.tab]();
    var panel = el.panel;

    if (ui.tab === 'telephony') window.ALLY_TELEPHONY.bind(panel, renderPanel);

    /* ---------- Actions réelles sur les données du compte ---------- */

    // Envoyer un brouillon : il quitte la file et rejoint les envois.
    panel.querySelectorAll('[data-send]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-send'));
        var mail = drafts().filter(function (m) { return m.id === id; })[0];
        if (!mail) return;
        D().drafts = drafts().filter(function (m) { return m.id !== id; });
        D().sent.unshift({ id: Date.now(), subject: mail.subject, to: mail.to, time: 'À l\'instant' });
        store.log('Validation de « ' + mail.subject + ' »', 'Email envoyé à ' + mail.to);
        store.save();
        ui.expanded = null;
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
        var payload = JSON.stringify({
          exporte_le: new Date().toISOString(),
          identite: S.identity, metier: S.trade, horaires: S.hours,
          regles: S.rules, autonomie: S.autonomy, script: store.script(),
          donnees: D()
        }, null, 2);
        var blob = new Blob([payload], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'ally-donnees-' + (S.identity.lastName || 'compte').toLowerCase() + '.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        exportBtn.textContent = 'Export téléchargé';
        window.setTimeout(function () { exportBtn.textContent = 'Exporter mes données'; }, 2500);
      });
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
        var id = Number(button.getAttribute('data-rdv-cancel'));
        var r = D().rdv.filter(function (x) { return x.id === id; })[0];
        D().rdv = D().rdv.filter(function (x) { return x.id !== id; });
        if (r) store.log('Annulation du rendez-vous de ' + r.client, 'Créneau libéré, ' + r.client + ' prévenu');
        store.save();
        renderNav(); renderPanel();
        el.sub.textContent = SUBS[ui.tab]();
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
      retention.addEventListener('input', function () {
        S.retentionDays = Number(retention.value);
        document.getElementById('out-retention').textContent = S.retentionDays + ' jours';
        store.save();
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

  /* Trace l'ordre dans l'historique visible sous l'onglet Ally. */
  function logVoice(order, status) {
    P().voiceLog.unshift({
      id: Date.now(), order: order, when: 'À l\'instant',
      result: status === 'À valider' ? 'En attente de votre confirmation' : 'Traité par Ally',
      state: status === 'À valider' ? 'wait' : 'done'
    });
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
  renderChrome();
  setTab('today');

  /* Le fichier de démonstration autonome n'a pas de rechargement de page :
     il appelle ce point d'entrée pour relire le compte après l'onboarding. */
  window.ALLY_DASHBOARD_REFRESH = function () {
    renderChrome();
    setTab(ui.tab);
  };
})();
