/* Ally — espace pro : navigation par onglets, interactions, commande vocale.
   Tous les contrôles sont de vrais éléments interactifs (button, role="switch",
   input) : le prototype n'utilisait que des <div onClick>, inaccessibles au
   clavier et invisibles pour les lecteurs d'écran. */
(function () {
  'use strict';

  var D = window.ALLY_DATA;

  var state = {
    tab: 'overview',
    expandedCall: null,
    autonomy: { calls: 70, emails: 25, agenda: 85 },
    notif: { sms: true, push: true, email: false },
    retentionDays: 90,
    summaryFreq: 'daily',
    voiceEnabled: true,
    confirmLevel: 'sensitive' // 'none' | 'sensitive' | 'always'
  };

  var el = {
    shell: document.getElementById('shell'),
    sidebar: document.getElementById('sidebar'),
    navList: document.getElementById('nav-list'),
    panel: document.getElementById('tabpanel'),
    title: document.getElementById('tab-title'),
    scrim: document.getElementById('scrim'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebarClose: document.getElementById('sidebar-close'),
    searchToggle: document.getElementById('search-toggle'),
    search: document.getElementById('search'),
    fab: document.getElementById('voice-fab'),
    overlay: document.getElementById('voice-overlay'),
    heard: document.getElementById('voice-heard'),
    confirm: document.getElementById('voice-confirm'),
    voiceOk: document.getElementById('voice-ok'),
    voiceCancel: document.getElementById('voice-cancel'),
    voiceTitle: document.getElementById('voice-title')
  };

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var AUTONOMY_LABELS = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(value) {
    return value < 34 ? AUTONOMY_LABELS[0] : value < 67 ? AUTONOMY_LABELS[1] : AUTONOMY_LABELS[2];
  }

  /* ================= SIDEBAR ================= */
  function renderNav() {
    el.navList.innerHTML = D.tabs.map(function (tab) {
      var current = tab.id === state.tab;
      return '<button type="button" class="nav-item" data-tab="' + tab.id + '"' +
        (current ? ' aria-current="page"' : '') + '>' +
        '<span class="dot" aria-hidden="true"></span>' + esc(tab.label) + '</button>';
    }).join('');

    el.navList.querySelectorAll('.nav-item').forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.getAttribute('data-tab'));
        closeDrawer();
      });
    });
  }

  function setTab(id) {
    state.tab = id;
    state.expandedCall = null;
    var tab = D.tabs.filter(function (t) { return t.id === id; })[0];
    el.title.textContent = tab.label;
    renderNav();
    renderPanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openDrawer() {
    el.shell.classList.add('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'true');
    el.sidebarClose.focus();
  }
  function closeDrawer() {
    el.shell.classList.remove('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'false');
  }

  /* Le bouton menu n'existe que sous 900px : on le révèle par media query JS
     pour qu'il reste hors du parcours clavier sur desktop. */
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

  el.searchToggle.addEventListener('click', function () {
    var open = el.search.classList.toggle('is-open');
    el.searchToggle.setAttribute('aria-expanded', String(open));
    if (open) el.search.focus();
  });

  /* ================= FRAGMENTS RÉUTILISABLES ================= */
  function badge(call) {
    return '<span class="badge-status badge-' + call.kind + '">' + esc(call.status) + '</span>';
  }

  function callRow(call) {
    return '<div class="row">' +
      '<div><p class="row-name">' + esc(call.caller) + '</p>' +
      '<p class="row-meta">' + esc(call.time) + ' · ' + esc(call.duration) + '</p></div>' +
      badge(call) + '</div>';
  }

  function sliderBlock(key, label, locked) {
    var value = state.autonomy[key];
    return '<div class="slider-block' + (locked ? ' slider-locked' : '') + '">' +
      '<div class="slider-head"><label for="au-' + key + '">' + esc(label) + '</label>' +
      '<output id="out-' + key + '" for="au-' + key + '">' + esc(autonomyLabel(value)) + '</output></div>' +
      '<input type="range" id="au-' + key + '" min="0" max="100" value="' + value + '"' +
      (locked ? ' disabled' : '') + ' data-autonomy="' + key + '"></div>';
  }

  function switchRow(key, label) {
    return '<div class="switch-row"><span id="lbl-' + key + '">' + esc(label) + '</span>' +
      '<button type="button" class="toggle" role="switch" data-notif="' + key + '"' +
      ' aria-checked="' + state.notif[key] + '" aria-labelledby="lbl-' + key + '"></button></div>';
  }

  /* ================= ONGLETS ================= */
  var views = {};

  views.overview = function () {
    return '' +
      '<div class="stat-grid">' +
        '<div class="stat"><p class="stat-label">Appels aujourd\'hui</p><p class="stat-value">12</p></div>' +
        '<div class="stat"><p class="stat-label">RDV du jour</p><p class="stat-value">5</p></div>' +
        '<div class="stat"><p class="stat-label">Mails à valider</p><p class="stat-value accent">3</p></div>' +
        '<div class="stat"><p class="stat-label">Temps gagné (semaine)</p><p class="stat-value cyan">6h20</p></div>' +
      '</div>' +
      '<div class="alert"><span class="dot" aria-hidden="true"></span>' +
        '<p><strong>Urgence transférée</strong> — appel de M. Lefebvre à 10:42, transféré sur votre portable (règle « urgences »).</p>' +
      '</div>' +
      '<div class="cols cols-13">' +
        '<div class="card"><p class="card-title">Derniers appels</p>' +
          D.calls.slice(0, 4).map(callRow).join('') +
        '</div>' +
        '<div class="card"><p class="card-title">Statistiques</p>' +
          '<div class="mini-stat"><p class="mini-stat-label">Appels manqués évités</p>' +
            '<p class="mini-stat-value">27 <small>cette semaine</small></p></div>' +
          '<div class="mini-stat"><p class="mini-stat-label">Brouillons validés</p>' +
            '<p class="mini-stat-value">14 <small>cette semaine</small></p></div>' +
        '</div>' +
      '</div>';
  };

  views.calls = function () {
    return '<div class="calls-list">' + D.calls.map(function (call) {
      var open = state.expandedCall === call.id;
      return '<div class="call">' +
        '<button type="button" class="call-head" data-call="' + call.id + '"' +
          ' aria-expanded="' + open + '" aria-controls="call-body-' + call.id + '">' +
          '<span class="call-who"><span class="call-avatar" aria-hidden="true"></span>' +
            '<span><span class="row-name" style="display:block">' + esc(call.caller) + '</span>' +
            '<span class="row-meta">' + esc(call.time) + ' · ' + esc(call.duration) + '</span></span>' +
          '</span>' +
          '<span class="call-right">' + badge(call) +
            '<span class="chevron" aria-hidden="true">' + (open ? '▲' : '▼') + '</span></span>' +
        '</button>' +
        '<div class="call-body" id="call-body-' + call.id + '"' + (open ? '' : ' hidden') + '>' +
          '<div class="transcript">' +
            '<p class="transcript-label">Transcription automatique</p>' +
            '<p class="transcript-text">' + esc(call.transcript) + '</p>' +
            '<div class="transcript-actions">' +
              '<button type="button" class="btn-play"><span aria-hidden="true">▶</span> Écouter l\'enregistrement</button>' +
              '<button type="button" class="btn-link">Corriger la transcription</button>' +
            '</div>' +
            '<p class="legal">Enregistré avec le consentement de l\'appelant, conformément à la réglementation.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  };

  views.emails = function () {
    return '' +
      '<p class="section-label">Brouillons en attente de validation</p>' +
      '<div class="drafts">' + D.emailDrafts.map(function (mail) {
        return '<div class="draft">' +
          '<div class="draft-head"><strong>' + esc(mail.subject) + '</strong>' +
            '<span class="tag">' + esc(mail.category) + '</span></div>' +
          '<p class="draft-to">À : ' + esc(mail.to) + '</p>' +
          '<p class="draft-preview">' + esc(mail.preview) + '</p>' +
          '<div class="draft-actions">' +
            '<button type="button" class="btn btn-primary btn-sm">Envoyer</button>' +
            '<button type="button" class="btn btn-ghost btn-sm">Modifier</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<p class="section-label">Envoyés automatiquement</p>' +
      '<div class="sent-list">' + D.emailsSent.map(function (mail) {
        return '<div class="row"><p style="font-size:14px">' + esc(mail.subject) + '</p>' +
          '<p class="row-meta">' + esc(mail.time) + '</p></div>';
      }).join('') + '</div>';
  };

  views.agenda = function () {
    return '<div class="cols cols-14">' +
      '<div class="card"><p class="card-title">Prochains rendez-vous</p>' +
        D.upcomingRdv.map(function (rdv) {
          return '<div class="rdv"><span class="rdv-day">' + esc(rdv.day) + '</span>' +
            '<div><p class="row-name">' + esc(rdv.client) + '</p>' +
            '<p class="row-meta">' + esc(rdv.type) + ' · ' + esc(rdv.time) + '</p></div></div>';
        }).join('') +
      '</div>' +
      '<div class="card"><p class="card-title">Règles de disponibilité</p>' +
        '<div class="stack" style="gap:14px">' +
          '<div class="sync-row"><span>Synchronisé avec Google Calendar</span>' +
            '<span class="sync-dot" aria-hidden="true"></span></div>' +
          '<p class="note">Fermé les jours fériés, absences déclarées et le mercredi après-midi.</p>' +
          '<p class="note note-sep">Dernière modification IA : RDV de M. Petit déplacé au 31/07 à 14h.</p>' +
        '</div>' +
      '</div></div>';
  };

  views.config = function () {
    var locked = state.autonomy.emails < 34;
    return '<div class="stack limit-760">' +
      '<div class="card"><p class="card-title">Niveau d\'autonomie par tâche</p>' +
        sliderBlock('calls', 'Appels', false) +
        sliderBlock('emails', 'Emails', false) +
        sliderBlock('agenda', 'Agenda', false) +
        (locked ? '<p class="lock-note">Profil avocat : le mode « brouillon à valider » reste recommandé sur les emails — aucun contenu métier ne part sans votre accord.</p>' : '') +
      '</div>' +

      '<div class="card"><p class="card-title">Script d\'accueil téléphonique</p>' +
        '<label class="sr-only" for="greeting">Script d\'accueil téléphonique</label>' +
        '<textarea class="field" id="greeting">Cabinet Dubois et Associés, bonjour. Je suis Ally, l\'assistante du cabinet. Comment puis-je vous aider aujourd\'hui ?</textarea>' +
      '</div>' +

      '<div class="card"><p class="card-title">Commande vocale</p>' +
        '<div class="switch-row"><span id="lbl-voice">Activer la commande vocale dans l\'application</span>' +
          '<button type="button" class="toggle" role="switch" id="voice-switch"' +
          ' aria-checked="' + state.voiceEnabled + '" aria-labelledby="lbl-voice"></button></div>' +
        '<p class="note" style="margin-top:14px">Confirmation orale avant exécution</p>' +
        '<div class="choice-row" style="margin-top:10px" role="group" aria-label="Niveau de confirmation requis">' +
          [['none', 'Aucune'], ['sensitive', 'Actions sensibles'], ['always', 'Systématique']].map(function (pair) {
            return '<button type="button" class="choice" data-confirm="' + pair[0] + '"' +
              ' aria-pressed="' + (state.confirmLevel === pair[0]) + '">' + pair[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Historique des ordres vocaux</p>' +
        '<div class="voice-log">' + D.voiceLog.map(function (entry) {
          return '<div class="row"><div><p class="row-name">« ' + esc(entry.order) + ' »</p>' +
            '<p class="row-meta">' + esc(entry.when) + ' · ' + esc(entry.result) + '</p></div>' +
            '<span class="voice-status ' + entry.state + '">' +
            (entry.state === 'done' ? 'Exécuté' : 'À valider') + '</span></div>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="card"><p class="card-title">Contacts prioritaires (transfert immédiat)</p>' +
        D.priorityContacts.map(function (contact) {
          return '<div class="row"><span style="font-size:14px">' + esc(contact.name) + '</span>' +
            '<span class="row-meta">' + esc(contact.reason) + '</span></div>';
        }).join('') +
      '</div></div>';
  };

  views.knowledge = function () {
    return '<div class="stack limit-760" style="gap:14px">' +
      D.faqItems.map(function (item) {
        return '<div class="faq"><strong>' + esc(item.q) + '</strong><p>' + esc(item.a) + '</p></div>';
      }).join('') +
      '<button type="button" class="add-row">+ Ajouter une entrée à la base de connaissances</button>' +
      '</div>';
  };

  views.billing = function () {
    return '<div class="cols cols-11 limit-900">' +
      '<div class="plan-card">' +
        '<p class="plan-kicker">Formule actuelle</p>' +
        '<p class="plan-name">Pilote Avocats</p>' +
        '<div class="meter"><div class="meter-head"><span>Appels traités</span><span>142 / 200</span></div>' +
          '<div class="meter-track"><div class="meter-fill accent" style="width:71%"></div></div></div>' +
        '<div class="meter"><div class="meter-head"><span>Emails traités</span><span>88 / 150</span></div>' +
          '<div class="meter-track"><div class="meter-fill cyan" style="width:59%"></div></div></div>' +
        '<button type="button" class="btn btn-ghost btn-md">Changer de formule</button>' +
      '</div>' +
      '<div class="card"><p class="card-title">Historique de facturation</p>' +
        D.billingHistory.map(function (row) {
          return '<div class="tri-row"><span>' + esc(row.date) + '</span>' +
            '<span>' + esc(row.amount) + '</span><span>' + esc(row.status) + '</span></div>';
        }).join('') +
      '</div></div>';
  };

  views.security = function () {
    return '<div class="stack limit-800">' +
      '<div class="card"><p class="card-title">Journal d\'accès aux données</p>' +
        D.accessLog.map(function (row) {
          return '<div class="tri-row"><span>' + esc(row.who) + '</span>' +
            '<span>' + esc(row.what) + '</span><span>' + esc(row.when) + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="card"><p class="card-title">Conservation des enregistrements</p>' +
        '<div class="slider-head"><label for="retention">Durée de conservation</label>' +
          '<output id="out-retention" for="retention">' + state.retentionDays + ' jours</output></div>' +
        '<input type="range" id="retention" min="7" max="365" value="' + state.retentionDays + '">' +
        '<div class="danger-actions">' +
          '<button type="button" class="btn btn-ghost btn-md">Exporter mes données</button>' +
          '<button type="button" class="btn btn-danger btn-md">Demander la suppression</button>' +
        '</div>' +
      '</div></div>';
  };

  views.notifications = function () {
    return '<div class="stack limit-640">' +
      '<div class="card"><p class="card-title">Canaux d\'alerte pour les urgences</p>' +
        switchRow('sms', 'SMS') + switchRow('push', 'Notification push') + switchRow('email', 'Email') +
      '</div>' +
      '<div class="card"><p class="card-title">Fréquence des résumés</p>' +
        '<div class="choice-row" role="group" aria-label="Fréquence des résumés">' +
          '<button type="button" class="choice" data-freq="daily" aria-pressed="' + (state.summaryFreq === 'daily') + '">Quotidien</button>' +
          '<button type="button" class="choice" data-freq="weekly" aria-pressed="' + (state.summaryFreq === 'weekly') + '">Hebdomadaire</button>' +
        '</div>' +
      '</div></div>';
  };

  views.support = function () {
    return '<div class="cols cols-12 limit-1000">' +
      '<div class="card chat"><p class="card-title">Assistance</p>' +
        '<div class="chat-log" id="chat-log">' + D.chat.map(function (msg) {
          return '<div class="bubble bubble-' + msg.from + '">' + esc(msg.text) + '</div>';
        }).join('') + '</div>' +
        '<form class="chat-form" id="chat-form">' +
          '<label class="sr-only" for="chat-input">Votre message</label>' +
          '<input class="field" id="chat-input" type="text" placeholder="Écrire un message...">' +
          '<button type="submit" class="btn btn-primary btn-md">Envoyer</button>' +
        '</form>' +
      '</div>' +
      '<div class="card"><p class="card-title">Tutoriels</p>' +
        D.tutorials.map(function (item) {
          return '<button type="button" class="tuto">' + esc(item.title) + '</button>';
        }).join('') +
      '</div></div>';
  };

  /* ================= LIAISON DES ÉVÉNEMENTS ================= */
  function renderPanel() {
    el.panel.innerHTML = views[state.tab]();
    var panel = el.panel;

    // Accordéon appels
    panel.querySelectorAll('[data-call]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-call'));
        state.expandedCall = (state.expandedCall === id) ? null : id;
        renderPanel();
        var next = el.panel.querySelector('[data-call="' + id + '"]');
        if (next) next.focus();
      });
    });

    // Sliders d'autonomie
    panel.querySelectorAll('[data-autonomy]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.getAttribute('data-autonomy');
        state.autonomy[key] = Number(input.value);
        document.getElementById('out-' + key).textContent = autonomyLabel(state.autonomy[key]);
      });
    });

    // Rétention
    var retention = panel.querySelector('#retention');
    if (retention) {
      retention.addEventListener('input', function () {
        state.retentionDays = Number(retention.value);
        document.getElementById('out-retention').textContent = state.retentionDays + ' jours';
      });
    }

    // Toggles de notification
    panel.querySelectorAll('[data-notif]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-notif');
        state.notif[key] = !state.notif[key];
        button.setAttribute('aria-checked', String(state.notif[key]));
      });
    });

    // Fréquence des résumés
    panel.querySelectorAll('[data-freq]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.summaryFreq = button.getAttribute('data-freq');
        panel.querySelectorAll('[data-freq]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
      });
    });

    // Commande vocale : interrupteur + niveau de confirmation
    var voiceSwitch = panel.querySelector('#voice-switch');
    if (voiceSwitch) {
      voiceSwitch.addEventListener('click', function () {
        state.voiceEnabled = !state.voiceEnabled;
        voiceSwitch.setAttribute('aria-checked', String(state.voiceEnabled));
        el.fab.hidden = !state.voiceEnabled;
      });
    }
    panel.querySelectorAll('[data-confirm]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.confirmLevel = button.getAttribute('data-confirm');
        panel.querySelectorAll('[data-confirm]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
      });
    });

    // Chat d'assistance
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

  /* ================= COMMANDE VOCALE (UI seule) ================= */
  var voice = { index: 0, timers: [], lastFocus: null };

  function clearVoiceTimers() {
    voice.timers.forEach(clearTimeout);
    voice.timers = [];
  }
  function later(fn, delay) { voice.timers.push(setTimeout(fn, delay)); }

  function openVoice() {
    var demo = D.voiceDemo[voice.index % D.voiceDemo.length];
    voice.index += 1;
    voice.lastFocus = document.activeElement;

    clearVoiceTimers();
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

      var needsConfirm = state.confirmLevel === 'always' ||
        (state.confirmLevel === 'sensitive' && !!demo.confirm);

      if (needsConfirm) {
        el.confirm.textContent = demo.confirm ||
          'Vous confirmez cet ordre avant que je l\'exécute ?';
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
    clearVoiceTimers();
    el.voiceTitle.textContent = 'C\'est fait';
    el.confirm.hidden = true;
    el.voiceOk.hidden = true;
    el.heard.textContent = demo.reply;
    el.voiceCancel.textContent = 'Fermer';
    el.voiceCancel.focus();
    later(closeVoice, 3200);
  }

  function closeVoice() {
    clearVoiceTimers();
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

  /* ================= DÉMARRAGE ================= */
  renderNav();
  renderPanel();
})();
