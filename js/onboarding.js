/* Ally — questionnaire de configuration (4 étapes)
   Le choix du métier génère le profil : script d'accueil, niveaux d'autonomie
   et verrouillage du mode « brouillon à valider » pour les métiers à secret
   professionnel renforcé. */
(function () {
  'use strict';

  var TRADES = [
    {
      id: 'avocat', name: 'Avocat', secret: true,
      desc: 'Vocabulaire procédural, gestion des appels du greffe, confidentialité renforcée.',
      greeting: 'Cabinet {cabinet}, bonjour. Je suis Ally, l\'assistante du cabinet. Comment puis-je vous aider aujourd\'hui ?',
      autonomy: { calls: 70, emails: 25, agenda: 85 }
    },
    {
      id: 'medecin', name: 'Médecin', secret: true,
      desc: 'Motifs de consultation, tri des urgences, secret médical.',
      greeting: 'Cabinet du {cabinet}, bonjour. Je suis Ally, l\'assistante du cabinet. Quel est le motif de votre appel ?',
      autonomy: { calls: 75, emails: 20, agenda: 80 }
    },
    {
      id: 'artisan', name: 'Artisan', secret: false,
      desc: 'Demandes de devis, planification de chantier, disponibilités terrain.',
      greeting: '{cabinet}, bonjour. Je suis Ally, l\'assistante. Vous appelez pour un devis ou un chantier en cours ?',
      autonomy: { calls: 85, emails: 65, agenda: 90 }
    },
    {
      id: 'consultant', name: 'Consultant', secret: false,
      desc: 'Qualification des demandes entrantes, prise de rendez-vous commerciaux.',
      greeting: '{cabinet}, bonjour. Je suis Ally, l\'assistante. Comment puis-je vous orienter ?',
      autonomy: { calls: 80, emails: 55, agenda: 90 }
    }
  ];

  var DAYS = [
    { id: 'lun', label: 'Lundi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'mar', label: 'Mardi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'mer', label: 'Mercredi', on: true,  from: '09:00', to: '12:30' },
    { id: 'jeu', label: 'Jeudi',    on: true,  from: '09:00', to: '18:30' },
    { id: 'ven', label: 'Vendredi', on: true,  from: '09:00', to: '18:30' },
    { id: 'sam', label: 'Samedi',   on: false, from: '09:00', to: '12:00' },
    { id: 'dim', label: 'Dimanche', on: false, from: '09:00', to: '12:00' }
  ];

  var RULES = [
    { id: 'transfer', label: 'Transférer les urgences vers mon portable',
      hint: 'Ally reconnaît les appels urgents et vous les passe immédiatement.', on: true },
    { id: 'draft', label: 'Aucun envoi d\'email sans ma validation',
      hint: 'Tout contenu métier reste en brouillon jusqu\'à votre accord.', on: true, lockedBySecret: true },
    { id: 'record', label: 'Enregistrer les appels',
      hint: 'Avec message de consentement diffusé à l\'appelant.', on: true },
    { id: 'autobook', label: 'Laisser Ally poser des rendez-vous seule',
      hint: 'Uniquement dans vos créneaux déclarés disponibles.', on: true },
    { id: 'voice', label: 'Activer la commande vocale dans l\'application',
      hint: 'Donner des ordres à Ally à la voix depuis le tableau de bord.', on: true }
  ];

  var STEPS = [
    { title: 'Quel métier exercez-vous ?',
      lede: 'Ally charge le vocabulaire, les scripts d\'accueil et le niveau d\'autonomie adaptés à votre profession. Vous pourrez tout affiner ensuite.' },
    { title: 'Quelles sont vos disponibilités ?',
      lede: 'Ally s\'y tient strictement : aucun rendez-vous ne sera proposé en dehors de ces créneaux.' },
    { title: 'Quelles règles Ally doit-elle suivre ?',
      lede: 'Ce cadre vaut pour les appels comme pour les emails. Vous pouvez le modifier à tout moment depuis l\'espace pro.' },
    { title: 'Ally est prête.',
      lede: 'Voici le profil généré à partir de vos réponses. Vérifiez-le avant d\'ouvrir votre tableau de bord.' }
  ];

  var AUTONOMY_LABELS = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(value) {
    return value < 34 ? AUTONOMY_LABELS[0] : value < 67 ? AUTONOMY_LABELS[1] : AUTONOMY_LABELS[2];
  }

  var state = { step: 1, trade: 'avocat', cabinet: 'Dubois & Associés' };

  var el = {
    progress: document.getElementById('ob-progress'),
    stepLabel: document.getElementById('ob-step-label'),
    title: document.getElementById('ob-title'),
    lede: document.getElementById('ob-lede'),
    prev: document.getElementById('ob-prev'),
    next: document.getElementById('ob-next'),
    trades: document.getElementById('trade-grid'),
    hours: document.getElementById('hours-list'),
    rules: document.getElementById('rules-list'),
    recap: document.getElementById('recap'),
    recapNote: document.getElementById('recap-note'),
    greeting: document.getElementById('greeting')
  };

  function trade() {
    return TRADES.filter(function (t) { return t.id === state.trade; })[0];
  }

  /* ---- Étape 1 : métier ---- */
  function renderTrades() {
    el.trades.innerHTML = '';
    TRADES.forEach(function (t) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'trade';
      button.setAttribute('aria-pressed', String(t.id === state.trade));
      button.innerHTML =
        '<strong></strong><span></span>' +
        (t.secret ? '<em>Secret professionnel renforcé</em>' : '');
      button.querySelector('strong').textContent = t.name;
      button.querySelector('span').textContent = t.desc;
      button.addEventListener('click', function () {
        state.trade = t.id;
        renderTrades();
        renderRules();
      });
      el.trades.appendChild(button);
    });
  }

  /* ---- Étape 2 : horaires ---- */
  function renderHours() {
    el.hours.innerHTML = '';
    DAYS.forEach(function (day) {
      var row = document.createElement('div');
      row.className = 'hours-row' + (day.on ? '' : ' is-off');
      row.innerHTML =
        '<span class="day"></span>' +
        '<input type="time" aria-label="Ouverture" value="' + day.from + '">' +
        '<span class="sep">→</span>' +
        '<input type="time" aria-label="Fermeture" value="' + day.to + '">';
      row.querySelector('.day').textContent = day.label;

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(day.on));
      toggle.setAttribute('aria-label', 'Ouvert le ' + day.label.toLowerCase());
      toggle.addEventListener('click', function () {
        day.on = !day.on;
        toggle.setAttribute('aria-checked', String(day.on));
        row.classList.toggle('is-off', !day.on);
      });
      row.insertBefore(toggle, row.children[1]);
      el.hours.appendChild(row);
    });
  }

  /* ---- Étape 3 : règles ---- */
  function renderRules() {
    var secret = trade().secret;
    el.rules.innerHTML = '';

    RULES.forEach(function (rule) {
      var locked = rule.lockedBySecret && secret;
      if (locked) rule.on = true;

      var row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML =
        '<div><strong></strong><span></span>' +
        (locked ? '<span class="rule-locked">Imposé par le profil ' + trade().name.toLowerCase() + '</span>' : '') +
        '</div>';
      row.querySelector('strong').textContent = rule.label;
      row.querySelector('span').textContent = rule.hint;

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(rule.on));
      toggle.setAttribute('aria-label', rule.label);
      if (locked) toggle.disabled = true;
      toggle.addEventListener('click', function () {
        rule.on = !rule.on;
        toggle.setAttribute('aria-checked', String(rule.on));
      });
      row.appendChild(toggle);
      el.rules.appendChild(row);
    });

    if (secret) {
      var note = document.createElement('p');
      note.className = 'lock-note';
      note.textContent = 'Le mode « brouillon à valider » est verrouillé pour ce métier : '
        + 'Ally ne pourra jamais envoyer un contenu métier sans votre accord.';
      el.rules.appendChild(note);
    }
  }

  /* ---- Étape 4 : récapitulatif ---- */
  function renderRecap() {
    var t = trade();
    var openDays = DAYS.filter(function (d) { return d.on; });
    var activeRules = RULES.filter(function (r) { return r.on; });

    var rows = [
      ['Métier', t.name],
      ['Jours d\'ouverture', openDays.length ? openDays.map(function (d) { return d.label.slice(0, 3); }).join(', ') : 'Aucun'],
      ['Fermetures', document.getElementById('closures').value || '—'],
      ['Autonomie appels', autonomyLabel(t.autonomy.calls)],
      ['Autonomie emails', autonomyLabel(t.autonomy.emails)],
      ['Autonomie agenda', autonomyLabel(t.autonomy.agenda)],
      ['Règles actives', activeRules.length + ' sur ' + RULES.length],
      ['Transfert des urgences', document.getElementById('transfer').value || '—']
    ];

    el.recap.innerHTML = '';
    rows.forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'recap-row';
      row.innerHTML = '<span></span><span></span>';
      row.children[0].textContent = pair[0];
      row.children[1].textContent = pair[1];
      el.recap.appendChild(row);
    });

    el.greeting.value = t.greeting.replace('{cabinet}', state.cabinet);
    el.recapNote.textContent = t.secret
      ? 'Profil à confidentialité renforcée : les emails partent uniquement après votre validation.'
      : 'Vous pouvez relever le niveau d\'autonomie d\'Ally à tout moment depuis Configuration IA.';
  }

  /* ---- Navigation ---- */
  function render() {
    var step = state.step;

    for (var i = 1; i <= 4; i++) {
      document.getElementById('step-' + i).hidden = (i !== step);
    }
    el.progress.querySelectorAll('span').forEach(function (bar, index) {
      bar.classList.toggle('done', index < step);
    });
    el.progress.setAttribute('aria-valuenow', String(step));

    el.stepLabel.textContent = 'Étape ' + step + ' sur 4';
    el.title.textContent = STEPS[step - 1].title;
    el.lede.textContent = STEPS[step - 1].lede;
    el.prev.hidden = (step === 1);
    el.next.textContent = (step === 4) ? 'Ouvrir mon tableau de bord' : 'Continuer';

    if (step === 4) renderRecap();
  }

  el.next.addEventListener('click', function () {
    if (state.step === 4) {
      try { window.localStorage.setItem('ally.configured', '1'); } catch (e) {}
      window.location.href = 'dashboard.html';
      return;
    }
    state.step += 1;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.prev.addEventListener('click', function () {
    if (state.step > 1) state.step -= 1;
    render();
  });

  renderTrades();
  renderHours();
  renderRules();
  render();
})();
