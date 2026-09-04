/* Ally — console d'administration.
   Réservée au rôle « admin » : vue plateforme, comptes, revenus et journal.
   Même grammaire visuelle que l'espace pro, mais aucune donnée de cabinet n'y
   apparaît : l'administrateur voit des volumes et des statuts, pas le contenu
   des appels ni des emails de ses clients. C'est un choix, pas une limite
   technique — voir ARCHITECTURE.md § Ne pas stocker ce dont on n'a pas besoin. */
(function () {
  'use strict';

  var accounts = window.ALLY_ACCOUNTS;
  var store = window.ALLY_STORE;
  var UI = window.ALLY_UI;
  var esc = UI.esc;

  /* Compte administrateur connecté. Renseigné par boot(), qui contrôle le rôle
     avant d'afficher quoi que ce soit. */
  var me = null;

  var TABS = [
    { id: 'overview', label: "Vue d'ensemble" },
    { id: 'accounts', label: 'Comptes' },
    { id: 'revenue',  label: 'Revenus' },
    { id: 'activity', label: 'Activité' },
    { id: 'system',   label: 'Système' }
  ];

  var ui = { tab: 'overview', search: '', filter: 'all', sort: 'recent', open: null };

  var el = {
    shell: document.getElementById('adm-shell'),
    navList: document.getElementById('adm-nav-list'),
    panel: document.getElementById('adm-tabpanel'),
    title: document.getElementById('adm-tab-title'),
    sub: document.getElementById('adm-tab-sub'),
    actions: document.getElementById('adm-topbar-actions'),
    scrim: document.getElementById('adm-scrim'),
    sidebar: document.getElementById('adm-sidebar'),
    menuToggle: document.getElementById('adm-menu-toggle'),
    sidebarClose: document.getElementById('adm-sidebar-close'),
    clock: document.getElementById('live-clock'),
    pulse: document.getElementById('pulse-online'),
    drawer: document.getElementById('drawer-overlay'),
    drawerTitle: document.getElementById('drawer-title'),
    drawerBody: document.getElementById('drawer-body')
  };

  function planName(id) { return window.ALLY_PLAN_BY_ID(id).name; }
  function tradeName(id) {
    return (window.ALLY_PROFILES[id] || window.ALLY_PROFILES.avocat).name;
  }

  var STATUS = {
    active:    { label: 'Actif',    css: 'badge-ok' },
    trial:     { label: 'Essai',    css: 'badge-pending' },
    pending:   { label: 'Non vérifié', css: 'badge-wait' },
    suspended: { label: 'Suspendu', css: 'badge-urgent' }
  };

  function statusBadge(status) {
    var s = STATUS[status] || STATUS.pending;
    return '<span class="badge-status ' + s.css + '">' + s.label + '</span>';
  }

  function money(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }

  /* ---------- Barres et jauges ---------- */
  function barChart(items, unit) {
    var top = Math.max.apply(null, items.map(function (i) { return i.count; }).concat([1]));
    return '<div class="chart">' + items.map(function (item) {
      var height = Math.round((item.count / top) * 100);
      return '<div class="chart-col">' +
        '<span class="chart-value">' + item.count + '</span>' +
        '<span class="chart-bar" style="height:' + Math.max(height, 2) + '%"></span>' +
        '<span class="chart-label">' + esc(item.label) + '</span>' +
        '</div>';
    }).join('') + '</div>' +
      (unit ? '<p class="note" style="margin-top:10px">' + esc(unit) + '</p>' : '');
  }

  function meter(label, value, total, tone) {
    var pct = total ? Math.round((value / total) * 100) : 0;
    return '<div class="meter-row">' +
      '<div class="meter-head"><span>' + esc(label) + '</span>' +
      '<strong>' + value + '<small> · ' + pct + ' %</small></strong></div>' +
      '<span class="meter-track"><i class="' + (tone || '') + '" style="width:' + pct + '%"></i></span>' +
      '</div>';
  }

  /* ================= VUE D'ENSEMBLE ================= */
  function viewOverview() {
    var s = accounts.stats();
    var pros = accounts.pros();

    var recent = pros.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 6);
    var online = pros.filter(function (u) { return accounts.isOnline(u); });

    var alerts = [];
    if (s.byStatus.pending) {
      alerts.push(s.byStatus.pending + ' compte(s) créé(s) mais jamais vérifié(s) — '
        + 'ils n\'ont pas terminé leur inscription.');
    }
    if (s.byStatus.suspended) {
      alerts.push(s.byStatus.suspended + ' compte(s) suspendu(s) — impayé ou demande du client.');
    }
    var endingTrials = pros.filter(function (u) {
      return u.status === 'trial' && (Date.now() - u.createdAt) > 10 * 86400000;
    });
    if (endingTrials.length) {
      alerts.push(endingTrials.length + ' essai(s) arrivent à échéance dans moins de 4 jours.');
    }

    return '' +
      '<div class="stat-grid stat-grid-4">' +
        '<div class="stat"><p class="stat-label">Comptes professionnels</p>' +
          '<p class="stat-value">' + s.total + '</p>' +
          '<p class="stat-foot">' + s.byStatus.active + ' actifs · ' + s.byStatus.trial + ' en essai</p></div>' +
        '<div class="stat"><p class="stat-label">En ligne maintenant</p>' +
          '<p class="stat-value cyan">' + s.online + '</p>' +
          '<p class="stat-foot">activité dans les 5 dernières minutes</p></div>' +
        '<div class="stat"><p class="stat-label">Revenu récurrent mensuel</p>' +
          '<p class="stat-value accent">' + money(s.mrr) + '</p>' +
          '<p class="stat-foot">' + money(s.arr) + ' par an · ' + money(s.trialMrr) + ' en essai</p></div>' +
        '<div class="stat"><p class="stat-label">Marge estimée</p>' +
          '<p class="stat-value">' + money(s.margin) + '</p>' +
          '<p class="stat-foot">' + s.marginRate + ' % · coûts ' + money(s.cost) + '</p></div>' +
      '</div>' +

      (alerts.length
        ? '<div class="alert"><span class="dot"></span><div><strong>À traiter</strong>' +
          '<ul class="alert-list">' + alerts.map(function (a) {
            return '<li>' + esc(a) + '</li>';
          }).join('') + '</ul></div></div>'
        : '') +

      '<div class="cols cols-13">' +
        '<div class="card card-chart">' +
          '<p class="card-title">Inscriptions sur 12 mois</p>' +
          barChart(s.signups, 'Une barre par mois. La donnée vient des dates de création réelles des comptes.') +
        '</div>' +

        '<div class="stack">' +
          '<div class="card">' +
            '<p class="card-title">Répartition par formule</p>' +
            window.ALLY_PLANS.map(function (plan) {
              return meter(plan.name + ' — ' + plan.price + ' €',
                s.byPlan[plan.id].count, s.total, plan.id === 'expert' ? 'tone-accent' : '');
            }).join('') +
          '</div>' +
          '<div class="card">' +
            '<p class="card-title">Répartition par métier</p>' +
            Object.keys(s.byTrade).map(function (trade) {
              return meter(tradeName(trade), s.byTrade[trade], s.total, 'tone-cyan');
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="cols cols-11" style="margin-top:20px">' +
        '<div class="card">' +
          '<p class="card-title">Dernières inscriptions</p>' +
          (recent.length ? recent.map(function (user) {
            return '<div class="row"><div class="row-main">' +
              '<p class="row-name">' + esc(user.firstName + ' ' + user.lastName) + '</p>' +
              '<p class="row-meta">' + esc(user.org) + ' · ' + planName(user.planId) + '</p></div>' +
              '<div class="row-side">' + statusBadge(user.status) +
              '<span class="row-meta">' + window.ALLY_SINCE(user.createdAt) + '</span></div></div>';
          }).join('') : '<p class="empty">Aucun compte.</p>') +
        '</div>' +

        '<div class="card">' +
          '<p class="card-title">Connectés à l\'instant</p>' +
          (online.length ? online.map(function (user) {
            return '<div class="row"><div class="row-main">' +
              '<p class="row-name"><span class="pulse-dot" aria-hidden="true"></span>' +
              esc(user.firstName + ' ' + user.lastName) + '</p>' +
              '<p class="row-meta">' + esc(user.org) + '</p></div>' +
              '<span class="row-meta">' + window.ALLY_SINCE(user.lastSeenAt) + '</span></div>';
          }).join('') : '<p class="empty">Personne en ligne pour le moment.</p>') +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:20px">' +
        '<p class="card-title">Volumes traités par la plateforme</p>' +
        '<div class="tri-stat">' +
          '<div><p class="mini-stat-label">Appels pris par Ally</p>' +
            '<p class="mini-stat-value">' + s.calls.toLocaleString('fr-FR') + '</p></div>' +
          '<div><p class="mini-stat-label">Emails envoyés</p>' +
            '<p class="mini-stat-value">' + s.emails.toLocaleString('fr-FR') + '</p></div>' +
          '<div><p class="mini-stat-label">Minutes de conversation</p>' +
            '<p class="mini-stat-value">' + s.minutes.toLocaleString('fr-FR') + '</p></div>' +
        '</div>' +
        '<p class="note note-sep" style="margin-top:16px">' +
          'Les minutes sont la seule ligne de coût qui monte avec l\'usage. ' +
          'À ' + s.minutes.toLocaleString('fr-FR') + ' minutes, la facture téléphonie ' +
          'représente environ ' + money(s.minutes * 0.15) + ' sur la période.' +
        '</p>' +
      '</div>';
  }

  /* ================= COMPTES ================= */
  function filtered() {
    var query = ui.search.trim().toLowerCase();
    var list = accounts.pros().filter(function (user) {
      if (ui.filter !== 'all' && user.status !== ui.filter) return false;
      if (!query) return true;
      return (user.firstName + ' ' + user.lastName + ' ' + user.org + ' ' + user.email)
        .toLowerCase().indexOf(query) >= 0;
    });

    var SORTS = {
      recent: function (a, b) { return b.createdAt - a.createdAt; },
      name:   function (a, b) { return a.lastName.localeCompare(b.lastName); },
      seen:   function (a, b) { return b.lastSeenAt - a.lastSeenAt; },
      usage:  function (a, b) { return b.usage.calls - a.usage.calls; }
    };
    return list.sort(SORTS[ui.sort] || SORTS.recent);
  }

  function viewAccounts() {
    var list = filtered();
    var s = accounts.stats();

    var chips = [
      { id: 'all', label: 'Tous', count: s.total },
      { id: 'active', label: 'Actifs', count: s.byStatus.active },
      { id: 'trial', label: 'En essai', count: s.byStatus.trial },
      { id: 'pending', label: 'Non vérifiés', count: s.byStatus.pending },
      { id: 'suspended', label: 'Suspendus', count: s.byStatus.suspended }
    ];

    return '' +
      '<div class="admin-toolbar">' +
        '<div class="filters">' + chips.map(function (chip) {
          return '<button type="button" class="choice" data-filter="' + chip.id + '"' +
            ' aria-pressed="' + (ui.filter === chip.id) + '">' + esc(chip.label) +
            '<span class="choice-count">' + chip.count + '</span></button>';
        }).join('') + '</div>' +
        '<div class="toolbar-right">' +
          '<label class="sr-only" for="admin-search">Rechercher un compte</label>' +
          '<input class="field" id="admin-search" type="search" placeholder="Nom, cabinet, email…"' +
            ' value="' + esc(ui.search) + '">' +
          '<label class="sr-only" for="admin-sort">Trier</label>' +
          '<select class="field field-select" id="admin-sort">' +
            '<option value="recent"' + (ui.sort === 'recent' ? ' selected' : '') + '>Plus récents</option>' +
            '<option value="seen"' + (ui.sort === 'seen' ? ' selected' : '') + '>Dernière connexion</option>' +
            '<option value="name"' + (ui.sort === 'name' ? ' selected' : '') + '>Nom</option>' +
            '<option value="usage"' + (ui.sort === 'usage' ? ' selected' : '') + '>Volume d\'appels</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      (list.length === 0
        ? '<p class="empty">Aucun compte ne correspond à cette recherche.</p>'
        : '<div class="card card-table"><div class="table-wrap"><table class="admin-table">' +
          '<thead><tr>' +
            '<th scope="col">Professionnel</th><th scope="col">Formule</th>' +
            '<th scope="col">Statut</th><th scope="col">Appels</th>' +
            '<th scope="col">Dernière activité</th><th scope="col"><span class="sr-only">Actions</span></th>' +
          '</tr></thead><tbody>' +
          list.map(function (user) {
            var initials = (user.firstName[0] || '') + (user.lastName[0] || '');
            return '<tr>' +
              '<td><div class="cell-user">' +
                '<span class="avatar avatar-sm' + (accounts.isOnline(user) ? ' is-online' : '') + '">' +
                  esc(initials.toUpperCase()) + '</span>' +
                '<div><p class="row-name">' + esc(user.firstName + ' ' + user.lastName) + '</p>' +
                '<p class="row-meta">' + esc(user.org) + ' · ' + tradeName(user.trade) + '</p></div>' +
              '</div></td>' +
              /* data-label sert au repli mobile : sous 700 px le tableau devient
                 une liste, et chaque valeur retrouve son intitulé. */
              '<td data-label="Formule"><span class="tag">' + planName(user.planId) + '</span>' +
                '<span class="row-meta cell-cycle">' +
                (user.cycle === 'year' ? 'annuel' : 'mensuel') + '</span></td>' +
              '<td data-label="Statut">' + statusBadge(user.status) + '</td>' +
              '<td class="num" data-label="Appels">' + user.usage.calls.toLocaleString('fr-FR') + '</td>' +
              '<td class="row-meta" data-label="Vu">' + window.ALLY_SINCE(user.lastSeenAt) + '</td>' +
              '<td class="cell-actions">' +
                '<button type="button" class="btn btn-ghost btn-sm" data-open="' + user.id + '">Ouvrir</button>' +
              '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div></div>') +

      '<p class="note" style="margin-top:16px">' +
        'La console ne donne accès à aucun contenu d\'appel ni d\'email : ' +
        'seuls les volumes et les statuts remontent ici.' +
      '</p>';
  }

  /* ---------- Fiche d'un compte ---------- */
  function openDrawer(userId) {
    var user = accounts.byId(userId);
    if (!user) return;
    ui.open = userId;

    var plan = window.ALLY_PLAN_BY_ID(user.planId);
    var monthly = user.cycle === 'year' ? Math.round(plan.priceYear / 12) : plan.price;
    var survey = user.survey || {};

    el.drawerTitle.textContent = user.firstName + ' ' + user.lastName;
    el.drawerBody.innerHTML = '' +
      '<div class="drawer-id">' +
        '<span class="avatar' + (accounts.isOnline(user) ? ' is-online' : '') + '">' +
          esc(((user.firstName[0] || '') + (user.lastName[0] || '')).toUpperCase()) + '</span>' +
        '<div><p class="row-name">' + esc(user.org) + '</p>' +
        '<p class="row-meta">' + esc(user.email) + '</p></div>' +
        statusBadge(user.status) +
      '</div>' +

      '<div class="drawer-grid">' +
        '<div><p class="mini-stat-label">Formule</p><p class="mini-stat-value">' + plan.name +
          '<small> · ' + monthly + ' €/mois</small></p></div>' +
        '<div><p class="mini-stat-label">Client depuis</p><p class="mini-stat-value">' +
          window.ALLY_DATE(user.createdAt) + '</p></div>' +
        '<div><p class="mini-stat-label">Appels traités</p><p class="mini-stat-value">' +
          user.usage.calls.toLocaleString('fr-FR') + '</p></div>' +
        '<div><p class="mini-stat-label">Minutes consommées</p><p class="mini-stat-value">' +
          user.usage.minutes.toLocaleString('fr-FR') + '</p></div>' +
      '</div>' +

      '<div class="drawer-block">' +
        '<p class="card-title">Consommation du forfait</p>' +
        meter('Appels', Math.min(user.usage.calls, plan.quota.calls), plan.quota.calls,
          user.usage.calls > plan.quota.calls * 0.8 ? 'tone-warn' : '') +
        meter('Emails', Math.min(user.usage.emails, plan.quota.emails), plan.quota.emails, 'tone-cyan') +
        (user.usage.calls > plan.quota.calls
          ? '<p class="lock-note">Forfait dépassé de ' + (user.usage.calls - plan.quota.calls) +
            ' appels. À facturer en supplément ou à faire basculer vers la formule supérieure.</p>'
          : '') +
      '</div>' +

      (survey.volume ? '<div class="drawer-block">' +
        '<p class="card-title">Réponses au questionnaire</p>' +
        '<div class="recap-row"><span>Appels manqués / semaine</span><span>' + esc(survey.volume) + '</span></div>' +
        '<div class="recap-row"><span>Répondait avant</span><span>' + esc(survey.today || '—') + '</span></div>' +
        '<div class="recap-row"><span>Irritants</span><span>' + esc((survey.pain || []).join(', ') || '—') + '</span></div>' +
        '<div class="recap-row"><span>Agenda utilisé</span><span>' + esc((survey.tools || []).join(', ') || '—') + '</span></div>' +
        '<div class="recap-row"><span>Durée de rendez-vous</span><span>' + esc(survey.rdvDuration || '—') + ' min</span></div>' +
      '</div>' : '') +

      '<div class="drawer-block">' +
        '<p class="card-title">Changer de formule</p>' +
        '<div class="chip-group">' + window.ALLY_PLANS.map(function (p) {
          return '<button type="button" class="chip" data-setplan="' + p.id + '"' +
            ' aria-pressed="' + (p.id === user.planId) + '">' + p.name + '</button>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="drawer-actions">' +
        (user.status === 'suspended'
          ? '<button type="button" class="btn btn-primary btn-md" data-act="activate">Réactiver le compte</button>'
          : '<button type="button" class="btn btn-ghost btn-md" data-act="suspend">Suspendre le compte</button>') +
        (user.verified
          ? ''
          : '<button type="button" class="btn btn-ghost btn-md" data-act="verify">Valider l\'adresse manuellement</button>') +
        '<button type="button" class="btn btn-danger btn-md" data-act="delete">Supprimer</button>' +
      '</div>' +

      '<p class="note" style="margin-top:16px">' +
        'Chaque action est inscrite au journal d\'activité, avec l\'auteur et l\'heure.' +
      '</p>';

    el.drawer.hidden = false;
    bindDrawer(user);
    /* Le tiroir de fiche recouvre la console : le focus n'a rien à faire
       derrière lui, et doit revenir au bouton « Ouvrir » à la fermeture. */
    relacheFiche = window.ALLY_FOCUS.piege(el.drawer);
  }

  function closeDrawer() {
    el.drawer.hidden = true;
    ui.open = null;
    if (relacheFiche) { relacheFiche(); relacheFiche = null; }
  }

  var relacheFiche = null;
  var relacheBarre = null;

  function bindDrawer(user) {
    el.drawerBody.querySelectorAll('[data-setplan]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var planId = chip.getAttribute('data-setplan');
        accounts.update(user.id, { planId: planId });
        accounts.log('plan-changed', user.email + ' → ' + planName(planId));
        UI.toast('Formule de ' + user.lastName + ' passée à ' + planName(planId), 'ok');
        openDrawer(user.id);
        renderPanel();
      });
    });

    el.drawerBody.querySelectorAll('[data-act]').forEach(function (button) {
      button.addEventListener('click', function () {
        var act = button.getAttribute('data-act');

        if (act === 'suspend') {
          accounts.update(user.id, { status: 'suspended' });
          accounts.log('suspended', user.email);
          UI.toast('Compte suspendu — la connexion lui est refusée.', 'warn');
        }
        if (act === 'activate') {
          accounts.update(user.id, { status: user.verified ? 'active' : 'pending' });
          accounts.log('reactivated', user.email);
          UI.toast('Compte réactivé.', 'ok');
        }
        if (act === 'verify') {
          accounts.update(user.id, { verified: true, status: 'trial' });
          accounts.log('verified-by-admin', user.email);
          UI.toast('Adresse validée manuellement.', 'ok');
        }
        if (act === 'delete') {
          if (!window.confirm('Supprimer définitivement le compte de ' + user.firstName + ' '
              + user.lastName + ' ? Ses données de configuration seront effacées.')) return;
          accounts.remove(user.id);
          UI.toast('Compte supprimé.', 'warn');
          closeDrawer();
          renderPanel();
          renderChrome();
          return;
        }

        openDrawer(user.id);
        renderPanel();
        renderChrome();
      });
    });
  }

  /* ================= REVENUS ================= */
  function viewRevenue() {
    var s = accounts.stats();
    var COST_FIXED = 45;

    var rows = window.ALLY_PLANS.map(function (plan) {
      var entry = s.byPlan[plan.id];
      /* On compte les comptes actifs, pas tous les comptes : le MRR de la ligne
         ne vient que d'eux, et une colonne « comptes » incluant les essais
         rendrait l'arithmétique du tableau incompréhensible. */
      return '<tr><td>' + plan.name + '</td>' +
        '<td class="num" data-label="Actifs">' + entry.active + '</td>' +
        '<td class="num" data-label="Prix">' + plan.price + ' €</td>' +
        '<td class="num" data-label="MRR">' + money(entry.mrr) + '</td>' +
        '<td class="num" data-label="Part">' +
          (s.mrr ? Math.round((entry.mrr / s.mrr) * 100) : 0) + ' %</td></tr>';
    }).join('');

    var totalActive = window.ALLY_PLANS.reduce(function (sum, plan) {
      return sum + s.byPlan[plan.id].active;
    }, 0);

    /* Projection simple : le rythme d'acquisition des 3 derniers mois, prolongé
       sur 12. Volontairement grossier — c'est un ordre de grandeur, pas un
       business plan. */
    var lastThree = s.signups.slice(-3).reduce(function (sum, m) { return sum + m.count; }, 0);
    var perMonth = Math.round(lastThree / 3);
    var projected = s.mrr + perMonth * 12 * s.arpu;

    return '' +
      '<div class="stat-grid stat-grid-4">' +
        '<div class="stat"><p class="stat-label">MRR</p>' +
          '<p class="stat-value accent">' + money(s.mrr) + '</p>' +
          '<p class="stat-foot">revenu récurrent mensuel</p></div>' +
        '<div class="stat"><p class="stat-label">ARR</p>' +
          '<p class="stat-value">' + money(s.arr) + '</p>' +
          '<p class="stat-foot">projeté sur 12 mois à volume constant</p></div>' +
        '<div class="stat"><p class="stat-label">Revenu moyen par client</p>' +
          '<p class="stat-value">' + money(s.arpu) + '</p>' +
          '<p class="stat-foot">sur ' + s.byStatus.active + ' comptes actifs</p></div>' +
        '<div class="stat"><p class="stat-label">Marge brute</p>' +
          '<p class="stat-value cyan">' + s.marginRate + ' %</p>' +
          '<p class="stat-foot">' + money(s.margin) + ' par mois</p></div>' +
      '</div>' +

      '<div class="cols cols-13">' +
        '<div class="card">' +
          '<p class="card-title">Revenu par formule</p>' +
          '<div class="table-wrap"><table class="admin-table">' +
            '<thead><tr><th scope="col">Formule</th><th scope="col">Comptes actifs</th>' +
            '<th scope="col">Prix</th><th scope="col">MRR</th><th scope="col">Part</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot><tr><td>Total</td><td class="num">' + totalActive + '</td><td></td>' +
            '<td class="num">' + money(s.mrr) + '</td><td class="num">100 %</td></tr></tfoot>' +
          '</table></div>' +
          '<p class="note" style="margin-top:14px">' +
            'Les essais et les comptes suspendus ne sont pas comptés ici : ils ne ' +
            'produisent aucun revenu. Ils apparaissent dans l\'onglet Comptes.' +
          '</p>' +
        '</div>' +

        '<div class="card">' +
          '<p class="card-title">Structure de coûts</p>' +
          '<div class="recap-row"><span>Hébergement et base (fixe)</span><span>' + money(COST_FIXED) + '</span></div>' +
          '<div class="recap-row"><span>Comptes actifs — ' + s.byStatus.active + ' × 12 €</span>' +
            '<span>' + money(s.byStatus.active * 12) + '</span></div>' +
          '<div class="recap-row"><span>Essais en cours — ' + s.byStatus.trial + ' × 7 €</span>' +
            '<span>' + money(s.byStatus.trial * 7) + '</span></div>' +
          '<div class="recap-row total"><span>Coût mensuel total</span><span>' + money(s.cost) + '</span></div>' +
          '<p class="note" style="margin-top:16px">' +
            'Le coût par compte suppose les optimisations retenues : appels courts, ' +
            'filtrage du démarchage, prélèvement SEPA, cache du contexte LLM. ' +
            'Sans elles, comptez 36 € au lieu de 12 €.' +
          '</p>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:20px">' +
        '<p class="card-title">Projection à 12 mois</p>' +
        '<p class="proj-value">' + money(projected) + ' <small>de MRR</small></p>' +
        '<p class="note">' +
          'Au rythme des 3 derniers mois (' + perMonth + ' inscription(s) par mois) et à revenu ' +
          'moyen constant. Aucune hypothèse de résiliation n\'est intégrée : le chiffre est ' +
          'optimiste par construction, à ne pas présenter tel quel à un investisseur.' +
        '</p>' +
      '</div>';
  }

  /* ================= ACTIVITÉ ================= */
  var EVENT_LABEL = {
    signup: 'Inscription', verified: 'Adresse vérifiée', login: 'Connexion',
    logout: 'Déconnexion', 'login-failed': 'Échec de connexion',
    'verify-code': 'Code de vérification émis', 'reset-code': 'Code de récupération émis',
    'password-reset': 'Mot de passe modifié', 'plan-changed': 'Changement de formule',
    suspended: 'Compte suspendu', reactivated: 'Compte réactivé',
    'verified-by-admin': 'Validation manuelle', deleted: 'Compte supprimé',
    reseed: 'Données de démonstration réinitialisées'
  };

  var EVENT_TONE = {
    'login-failed': 'warn', suspended: 'warn', deleted: 'warn',
    signup: 'ok', verified: 'ok', reactivated: 'ok'
  };

  function viewActivity() {
    var events = accounts.events();
    var failures = events.filter(function (e) { return e.action === 'login-failed'; }).length;

    return '' +
      '<div class="stat-grid stat-grid-3">' +
        '<div class="stat"><p class="stat-label">Événements enregistrés</p>' +
          '<p class="stat-value">' + events.length + '</p>' +
          '<p class="stat-foot">120 derniers conservés</p></div>' +
        '<div class="stat"><p class="stat-label">Échecs de connexion</p>' +
          '<p class="stat-value' + (failures > 3 ? ' warn' : '') + '">' + failures + '</p>' +
          '<p class="stat-foot">au-delà de 5 sur un même compte, blocage temporaire</p></div>' +
        '<div class="stat"><p class="stat-label">En ligne</p>' +
          '<p class="stat-value cyan">' + accounts.stats().online + '</p>' +
          '<p class="stat-foot">fenêtre de 5 minutes</p></div>' +
      '</div>' +

      '<div class="card">' +
        '<p class="card-title">Journal d\'activité</p>' +
        (events.length ? '<ul class="log-list">' + events.map(function (event) {
          var user = event.userId ? accounts.byId(event.userId) : null;
          return '<li class="log-item">' +
            '<span class="log-dot ' + (EVENT_TONE[event.action] || '') + '" aria-hidden="true"></span>' +
            '<div class="log-main">' +
              '<p class="row-name">' + esc(EVENT_LABEL[event.action] || event.action) + '</p>' +
              '<p class="row-meta">' + esc(event.detail || (user ? user.email : '—')) + '</p>' +
            '</div>' +
            '<span class="row-meta">' + window.ALLY_SINCE(event.at) + '</span>' +
          '</li>';
        }).join('') + '</ul>'
          : '<p class="empty">Aucun événement pour le moment.</p>') +
        '<p class="note note-sep" style="margin-top:16px">' +
          'Ce journal est la trace d\'accès exigée par le RGPD en cas d\'incident. ' +
          'En production il est conservé côté serveur, en écriture seule, ' +
          'et l\'administrateur ne peut pas l\'effacer.' +
        '</p>' +
      '</div>';
  }

  /* ================= SYSTÈME ================= */
  var CHECKLIST = [
    ['Cloisonnement des comptes', true,
      'Chaque configuration est stockée sous une clé propre au compte. En production : filtre sur cabinet_id déduit du jeton de session.'],
    ['Vérification de l\'adresse email', true,
      'Code à 6 chiffres, valable 10 minutes, 5 tentatives maximum.'],
    ['Récupération de mot de passe', true,
      'Par code à usage unique. La page ne révèle pas si l\'adresse existe.'],
    ['Journal d\'accès', true,
      'Connexions, échecs, changements de formule et suppressions sont horodatés.'],
    ['Hachage des mots de passe', false,
      'Maquette : fonction non cryptographique côté navigateur. À remplacer par argon2id côté serveur.'],
    ['Chiffrement applicatif des transcriptions', false,
      'Demande un serveur et un gestionnaire de secrets. À écrire dès la première ligne de l\'API.'],
    ['Signature des webhooks Retell et Stripe', false,
      'Sans serveur, il n\'y a pas de webhook à signer.'],
    ['Double authentification sur les comptes tiers', false,
      'Action manuelle : hébergeur, Google, Stripe, GitHub.']
  ];

  function viewSystem() {
    var done = CHECKLIST.filter(function (item) { return item[1]; }).length;

    return '' +
      '<div class="cols cols-13">' +
        '<div class="card">' +
          '<p class="card-title">État de la sécurité — ' + done + ' sur ' + CHECKLIST.length + '</p>' +
          '<ul class="check-list">' + CHECKLIST.map(function (item) {
            return '<li class="check-item' + (item[1] ? ' is-done' : '') + '">' +
              '<span class="check-mark" aria-hidden="true"></span>' +
              '<div><p class="row-name">' + esc(item[0]) + '</p>' +
              '<p class="row-meta">' + esc(item[2]) + '</p></div>' +
              '<span class="badge-status ' + (item[1] ? 'badge-ok' : 'badge-wait') + '">' +
              (item[1] ? 'En place' : 'À faire') + '</span></li>';
          }).join('') + '</ul>' +
        '</div>' +

        '<div class="stack">' +
          '<div class="card">' +
            '<p class="card-title">Stockage</p>' +
            '<div class="recap-row"><span>Emplacement</span><span>navigateur (localStorage)</span></div>' +
            '<div class="recap-row"><span>Comptes enregistrés</span><span>' + accounts.all().length + '</span></div>' +
            '<div class="recap-row"><span>Événements</span><span>' + accounts.events().length + '</span></div>' +
            '<p class="lock-note">Aucun serveur : ces données ne quittent pas cet appareil et ' +
              'disparaissent si vous videz le cache du navigateur.</p>' +
          '</div>' +

          '<div class="card">' +
            '<p class="card-title">Compte administrateur</p>' +
            '<div class="recap-row"><span>Adresse</span><span>' + esc(me.email) + '</span></div>' +
            '<div class="recap-row"><span>Rôle</span><span>Accès complet</span></div>' +
            '<p class="lock-note">Identifiants de démonstration affichés sur la page de ' +
              'connexion. À changer avant toute mise en ligne.</p>' +
          '</div>' +

          '<div class="card">' +
            '<p class="card-title">Données de démonstration</p>' +
            '<p class="note" style="margin-bottom:16px">' +
              'Remet l\'annuaire à son état initial : 16 comptes fictifs, journal vidé. ' +
              'Les configurations enregistrées par chaque compte ne sont pas effacées.' +
            '</p>' +
            '<button type="button" class="btn btn-ghost btn-md" id="sys-reseed">Réinitialiser l\'annuaire</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ================= CHROME ================= */
  var VIEWS = {
    overview: viewOverview, accounts: viewAccounts,
    revenue: viewRevenue, activity: viewActivity, system: viewSystem
  };

  var SUBS = {
    overview: 'Ce que fait la plateforme, en un écran.',
    accounts: 'Tous les professionnels inscrits, leur formule et leur consommation.',
    revenue: 'Revenu récurrent, coûts et marge réelle.',
    activity: 'Journal des connexions et des actions d\'administration.',
    system: 'État de la sécurité et données de la maquette.'
  };

  function renderNav() {
    var s = accounts.stats();
    var counts = { accounts: s.total, activity: accounts.events().length };

    el.navList.innerHTML = TABS.map(function (tab) {
      return '<button type="button" class="nav-item" data-tab="' + tab.id + '"' +
        (ui.tab === tab.id ? ' aria-current="page"' : '') + '>' +
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="nav-label">' + esc(tab.label) + '</span>' +
        (counts[tab.id] ? '<span class="nav-count">' + counts[tab.id] + '</span>' : '') +
        '</button>';
    }).join('');

    el.navList.querySelectorAll('[data-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        ui.tab = button.getAttribute('data-tab');
        el.shell.classList.remove('drawer-open');
        renderNav();
        renderPanel();
      });
    });
  }

  function renderChrome() {
    document.getElementById('adm-foot-email').textContent = me.email;
    el.pulse.textContent = accounts.stats().online;
    el.title.textContent = (TABS.filter(function (t) { return t.id === ui.tab; })[0] || TABS[0]).label;
    el.sub.textContent = SUBS[ui.tab] || '';
  }

  function renderPanel() {
    /* La plateforme réelle passe en tête de la vue d'ensemble : quand un vrai
       serveur répond, ses chiffres priment sur ceux de la démonstration. Elle
       ne rend rien du tout sans serveur ni sans session administrateur. */
    var real = (ui.tab === 'overview' && window.ALLY_PLATFORM) ? window.ALLY_PLATFORM.view() : '';
    el.panel.innerHTML = real + VIEWS[ui.tab]();
    renderChrome();
    bindPanel();
    if (real) window.ALLY_PLATFORM.bind(el.panel, renderPanel);
  }

  function bindPanel() {
    el.panel.querySelectorAll('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        ui.filter = chip.getAttribute('data-filter');
        renderPanel();
      });
    });

    var search = document.getElementById('admin-search');
    if (search) {
      search.addEventListener('input', function () {
        ui.search = search.value;
        renderPanel();
        var again = document.getElementById('admin-search');
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      });
    }

    var sort = document.getElementById('admin-sort');
    if (sort) {
      sort.addEventListener('change', function () {
        ui.sort = sort.value;
        renderPanel();
      });
    }

    el.panel.querySelectorAll('[data-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        openDrawer(button.getAttribute('data-open'));
      });
    });

    var reseed = document.getElementById('sys-reseed');
    if (reseed) reseed.addEventListener('click', doReseed);
  }

  function doReseed() {
    if (!window.confirm('Réinitialiser l\'annuaire de démonstration ? '
        + 'Les comptes créés depuis seront perdus.')) return;
    accounts.reseed();
    accounts.open('admin');
    me = accounts.current();
    accounts.log('reseed', 'annuaire remis à zéro');
    UI.toast('Annuaire réinitialisé.', 'ok');
    renderNav();
    renderPanel();
  }

  /* ---------- Barre latérale mobile ----------
     Même mécanique que l'espace pro : la classe drawer-open est celle que
     dashboard.css connaît, et le bouton n'existe qu'en dessous de 900 px —
     l'attribut hidden doit être retiré par le script, puisque la règle
     [hidden] est en !important. */
  /* Noms distincts de ceux du tiroir de fiche : les déclarations de fonction
     étant remontées, un doublon openDrawer écrasait silencieusement l'autre et
     le bouton « Ouvrir » d'un compte n'ouvrait plus rien. */
  function openSidebar() {
    if (relacheBarre) return;
    el.shell.classList.add('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'true');
    relacheBarre = window.ALLY_FOCUS.piege(el.sidebar, { premier: el.sidebarClose });
  }
  function closeSidebar() {
    el.shell.classList.remove('drawer-open');
    el.menuToggle.setAttribute('aria-expanded', 'false');
    if (relacheBarre) { relacheBarre(); relacheBarre = null; }
  }

  var mqMobile = window.matchMedia('(max-width: 900px)');
  function syncMobile(event) {
    el.menuToggle.hidden = !event.matches;
    if (!event.matches) closeSidebar();
  }
  syncMobile(mqMobile);
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncMobile);
  else mqMobile.addListener(syncMobile);

  el.menuToggle.addEventListener('click', openSidebar);
  el.scrim.addEventListener('click', closeSidebar);
  /* Le piège rend lui-même le focus au bouton qui a ouvert le tiroir. */
  el.sidebarClose.addEventListener('click', closeSidebar);

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  el.drawer.addEventListener('click', function (event) {
    if (event.target === el.drawer) closeDrawer();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !el.drawer.hidden) closeDrawer();
  });

  document.getElementById('adm-foot-logout').addEventListener('click', function () {
    /* La session administrateur peut être tenue par le serveur : on la ferme
       des deux côtés avant de quitter la page. */
    var done = window.ALLY_GATE ? window.ALLY_GATE.logout() : Promise.resolve(accounts.logout());
    done.then(function () {
      store.reload();
      window.location.href = 'login.html';
    });
  });

  document.getElementById('adm-foot-reseed').addEventListener('click', doReseed);

  /* ---------- Horloge et présence ---------- */
  function tick() {
    el.clock.textContent = new Date().toLocaleTimeString('fr-FR',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  window.setInterval(tick, 1000);

  /* Le « en ligne » de l'administrateur doit rester vrai tant que la console
     est ouverte, sinon il disparaît de sa propre liste au bout de 5 minutes. */
  window.setInterval(function () {
    if (!me) return;
    accounts.touch();
    el.pulse.textContent = accounts.stats().online;
  }, 30000);

  /* ---------- Contrôle du rôle ----------
     Version front d'un contrôle qui, en production, se fait côté serveur : le
     rôle est déduit du jeton de session, jamais d'un paramètre du navigateur.
     On affiche un refus plutôt que de rediriger — une redirection au chargement
     casserait le fichier de démonstration, où tous les écrans coexistent. */
  function boot() {
    me = accounts.current();

    if (!me || me.role !== 'admin') {
      me = null;
      el.navList.innerHTML = '';
      el.title.textContent = 'Accès refusé';
      el.sub.textContent = 'Console réservée à l\'administrateur.';
      el.panel.innerHTML =
        '<div class="card limit-640">' +
          '<p class="card-title">Accès réservé</p>' +
          '<p class="note">Cette console n\'est accessible qu\'avec le compte ' +
          'administrateur. Un compte professionnel connecté ici ne verrait rien : ' +
          'le contrôle porte sur le rôle, pas sur l\'adresse de la page.</p>' +
          '<a class="btn btn-primary btn-md" href="login.html" style="margin-top:18px">' +
          'Se connecter en administrateur</a>' +
        '</div>';
      return;
    }

    accounts.touch();
    renderNav();
    renderPanel();
  }

  boot();

  /* La sonde de l'API répond après le premier rendu : sans ce rappel, la carte
     de la plateforme réelle n'apparaîtrait qu'au changement d'onglet. */
  if (window.ALLY_API) {
    window.ALLY_API.onReady(function (online) {
      if (online && me && ui.tab === 'overview') renderPanel();
    });
  }

  /* Le fichier de démonstration change d'écran sans recharger la page :
     la console doit relire la session à chaque fois qu'on l'ouvre. */
  window.ALLY_ADMIN_REFRESH = boot;
})();
