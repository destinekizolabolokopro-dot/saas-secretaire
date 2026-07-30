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
    { id: 'ally',          label: 'Ally' }
  ];

  var ACCOUNT_SECTIONS = [
    { id: 'plan',   label: 'Abonnement' },
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
  function name() { return store.displayName(); }

  var AUTONOMY = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(v) { return v < 34 ? AUTONOMY[0] : v < 67 ? AUTONOMY[1] : AUTONOMY[2]; }

  var DATE_LABEL = 'Mardi 28 juillet 2026';

  /* ---------- Dérivés du profil ---------- */
  function drafts()   { return P().drafts; }
  function calls()    { return P().calls; }
  function todayRdv() { return P().rdv.filter(function (r) { return r.day === 'Auj.'; }); }
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
    el.badgePlan.textContent = p.plan;
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
  document.getElementById('notif-btn').addEventListener('click', function () {
    setTab(urgentCall() ? 'conversations' : 'account');
    if (!urgentCall()) ui.account = 'alerts';
    renderPanel();
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
            '<button type="button" class="btn-play"><span aria-hidden="true">▶</span> Écouter l\'enregistrement</button>' +
            '<button type="button" class="btn-link">Corriger la transcription</button>' +
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
            '<button type="button" class="btn btn-primary btn-sm">Envoyer</button>' +
            '<button type="button" class="btn btn-ghost btn-sm">Modifier</button>' +
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
          : f.id === 'emails' ? drafts().length + p.sent.length
          : calls().length + drafts().length + p.sent.length;
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
        '<div class="conv-list flat">' + p.sent.map(function (mail) {
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
    var later = p.rdv.filter(function (r) { return r.day !== 'Auj.'; });

    function rdvRow(r, withDay) {
      return '<div class="rdv">' +
        (withDay ? '<span class="rdv-day">' + esc(r.day) + '</span>' : '<span class="rdv-day">' + esc(r.time) + '</span>') +
        '<div><p class="row-name">' + esc(r.client) + '</p>' +
        '<p class="row-meta">' + esc(r.type) + (withDay ? ' · ' + esc(r.time) : '') + '</p></div></div>';
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
        '<div class="card"><p class="card-title">Modifications faites par Ally</p>' +
          '<p class="note">' + esc(P().agendaLast) + '</p>' +
          '<p class="note note-sep" style="margin-top:12px">Les déplacements restent tracés : vous pouvez les annuler depuis l\'historique.</p>' +
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
        '<p class="sub-label">Confirmation orale avant exécution</p>' +
        '<div class="choice-row" role="group" aria-label="Niveau de confirmation requis">' +
          [['none', 'Aucune'], ['sensitive', 'Actions sensibles'], ['always', 'Systématique']].map(function (pair) {
            return '<button type="button" class="choice" data-confirm="' + pair[0] + '"' +
              ' aria-pressed="' + (S.confirmLevel === pair[0]) + '">' + pair[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Derniers ordres vocaux</p>' +
        '<div class="voice-log">' + p.voiceLog.map(function (entry) {
          return '<div class="row"><div><p class="row-name">« ' + esc(entry.order) + ' »</p>' +
            '<p class="row-meta">' + esc(entry.when) + ' · ' + esc(entry.result) + '</p></div>' +
            '<span class="voice-status ' + entry.state + '">' +
            (entry.state === 'done' ? 'Exécuté' : 'À valider') + '</span></div>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Contacts prioritaires</p>' +
        '<p class="note" style="margin-bottom:14px">Ally vous transfère ces appels immédiatement.</p>' +
        p.contacts.map(function (c) {
          var label = c.name === 'Votre portable' && S.identity.phone
            ? 'Votre portable (' + S.identity.phone + ')' : c.name;
          return '<div class="row"><span style="font-size:14px">' + esc(label) + '</span>' +
            '<span class="row-meta">' + esc(c.reason) + '</span></div>';
        }).join('') +
      '</div>' +

      '<div class="card"><p class="card-title">Base de connaissances</p>' +
        '<p class="note" style="margin-bottom:14px">Ce qu\'Ally peut répondre seule, sans vous solliciter.</p>' +
        '<div class="faq-list">' + p.faq.map(function (item) {
          return '<div class="faq"><strong>' + esc(item.q) + '</strong><p>' + esc(item.a) + '</p></div>';
        }).join('') + '</div>' +
        '<button type="button" class="add-row" style="margin-top:14px">+ Ajouter une entrée</button>' +
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
        '<p class="plan-name">' + esc(p.plan) + '</p>' +
        '<div class="meter"><div class="meter-head"><span>Appels traités</span><span>' +
          q.calls[0] + ' / ' + q.calls[1] + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill accent" style="width:' + pct(q.calls) + '%"></div></div></div>' +
        '<div class="meter"><div class="meter-head"><span>Emails traités</span><span>' +
          q.emails[0] + ' / ' + q.emails[1] + '</span></div>' +
          '<div class="meter-track"><div class="meter-fill cyan" style="width:' + pct(q.emails) + '%"></div></div></div>' +
        '<button type="button" class="btn btn-ghost btn-md">Changer de formule</button>' +
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
          '<button type="button" class="btn btn-ghost btn-md">Exporter mes données</button>' +
          '<button type="button" class="btn btn-danger btn-md">Demander la suppression</button>' +
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

  function accountHelp() {
    var tutorials = [
      'Configurer vos règles de transfert',
      'Comprendre le mode brouillon à valider',
      'Synchroniser votre agenda',
      'Donner des ordres à Ally à la voix'
    ];
    return '<div class="cols cols-12 limit-1000">' +
      '<div class="card chat"><p class="card-title">Assistance</p>' +
        '<div class="chat-log" id="chat-log">' +
          '<div class="bubble bubble-in">Bonjour ' + esc(name()) + ', comment puis-je vous aider ?</div>' +
          '<div class="bubble bubble-out">Comment modifier le script d\'accueil ?</div>' +
          '<div class="bubble bubble-in">Onglet Ally → Script d\'accueil téléphonique. La modification est appliquée immédiatement.</div>' +
        '</div>' +
        '<form class="chat-form" id="chat-form">' +
          '<label class="sr-only" for="chat-input">Votre message</label>' +
          '<input class="field" id="chat-input" type="text" placeholder="Écrire un message...">' +
          '<button type="submit" class="btn btn-primary btn-md">Envoyer</button>' +
        '</form>' +
      '</div>' +
      '<div class="card"><p class="card-title">Tutoriels</p>' +
        tutorials.map(function (t) { return '<button type="button" class="tuto">' + esc(t) + '</button>'; }).join('') +
      '</div></div>';
  }

  var ACCOUNT_VIEWS = { plan: accountPlan, privacy: accountPrivacy, alerts: accountAlerts, help: accountHelp };

  function viewAccount() {
    return '<div class="choice-row filters" role="group" aria-label="Sections du compte">' +
      ACCOUNT_SECTIONS.map(function (section) {
        return '<button type="button" class="choice" data-account="' + section.id + '"' +
          ' aria-pressed="' + (ui.account === section.id) + '">' + esc(section.label) + '</button>';
      }).join('') + '</div>' + ACCOUNT_VIEWS[ui.account]();
  }

  var VIEWS = {
    today: viewToday, conversations: viewConversations,
    agenda: viewAgenda, ally: viewAlly, account: viewAccount
  };

  /* ---------- Liaison des événements ---------- */
  function renderPanel() {
    el.panel.innerHTML = VIEWS[ui.tab]();
    var panel = el.panel;

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

    var chatForm = panel.querySelector('#chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('chat-input');
        var text = input.value.trim();
        if (!text) return;
        var log = document.getElementById('chat-log');
        var bubble = document.createElement('div');
        bubble.className = 'bubble bubble-out';
        bubble.textContent = text;
        log.appendChild(bubble);
        input.value = '';
        log.scrollTop = log.scrollHeight;
      });
    }
  }

  /* ---------- Commande vocale (interface seule) ---------- */
  var voice = { index: 0, timers: [], lastFocus: null };
  function clearTimers() { voice.timers.forEach(clearTimeout); voice.timers = []; }
  function later(fn, delay) { voice.timers.push(setTimeout(fn, delay)); }

  function openVoice() {
    var demos = P().voiceDemo;
    var demo = demos[voice.index % demos.length];
    voice.index += 1;
    voice.lastFocus = document.activeElement;

    clearTimers();
    el.overlay.hidden = false;
    el.voiceTitle.textContent = 'Ally écoute…';
    el.heard.textContent = '';
    el.confirm.hidden = true;
    el.voiceOk.hidden = true;
    el.voiceCancel.textContent = 'Annuler';
    el.voiceCancel.focus();

    later(function () {
      el.voiceTitle.textContent = 'Ordre reçu';
      el.heard.textContent = '« ' + demo.heard + ' »';

      var needsConfirm = S.confirmLevel === 'always' ||
        (S.confirmLevel === 'sensitive' && !!demo.confirm);

      if (needsConfirm) {
        el.confirm.textContent = demo.confirm || 'Vous confirmez cet ordre avant que je l\'exécute ?';
        el.confirm.hidden = false;
        el.voiceOk.hidden = false;
        el.voiceOk.focus();
        el.voiceOk.onclick = function () { settle(demo); };
      } else {
        later(function () { settle(demo); }, 700);
      }
    }, 1200);
  }

  function settle(demo) {
    clearTimers();
    el.voiceTitle.textContent = 'C\'est fait';
    el.confirm.hidden = true;
    el.voiceOk.hidden = true;
    el.heard.textContent = demo.reply;
    el.voiceCancel.textContent = 'Fermer';
    el.voiceCancel.focus();
    later(closeVoice, 3200);
  }

  function closeVoice() {
    clearTimers();
    el.overlay.hidden = true;
    if (voice.lastFocus && voice.lastFocus.focus) voice.lastFocus.focus();
  }

  el.fab.addEventListener('click', openVoice);
  el.voiceCancel.addEventListener('click', closeVoice);
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
