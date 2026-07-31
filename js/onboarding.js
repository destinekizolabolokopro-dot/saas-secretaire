/* Ally — questionnaire de configuration (5 étapes).
   Le métier génère le profil (vocabulaire, autonomie, script d'accueil), et
   l'identité saisie est reprise partout dans l'espace pro. Tout est écrit dans
   ALLY_STORE à la dernière étape. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var S = store.state;
  var PROFILES = window.ALLY_PROFILES;
  var TRADE_IDS = Object.keys(PROFILES);

  var RULES = [
    { id: 'transfer', label: 'Transférer les urgences vers mon portable',
      hint: 'Ally reconnaît les appels urgents et vous les passe immédiatement.' },
    { id: 'draft', label: "Aucun envoi d'email sans ma validation",
      hint: 'Sinon Ally rédige et envoie directement, sur votre ordre vocal.' },
    { id: 'record', label: 'Enregistrer les appels',
      hint: 'Avec message de consentement diffusé à l\'appelant.' },
    { id: 'autobook', label: 'Laisser Ally poser des rendez-vous seule',
      hint: 'Uniquement dans vos créneaux déclarés disponibles.' },
    { id: 'voice', label: 'Activer la commande vocale dans l\'application',
      hint: 'Donner des ordres à Ally à la voix depuis l\'espace pro.' }
  ];

  var STEPS = [
    { title: 'Quel métier exercez-vous ?',
      lede: 'Ally charge le vocabulaire, les scripts d\'accueil et le niveau d\'autonomie adaptés à votre profession.' },
    { title: 'Qui êtes-vous ?',
      lede: 'Ces informations servent partout : ce qu\'Ally dit au téléphone, la signature de vos emails, votre espace pro.' },
    { title: 'Quelles sont vos disponibilités ?',
      lede: 'Ally s\'y tient strictement : aucun rendez-vous ne sera proposé en dehors de ces créneaux.' },
    { title: 'Quelles règles Ally doit-elle suivre ?',
      lede: 'Ce cadre vaut pour les appels comme pour les emails. Modifiable à tout moment.' },
    { title: null, /* personnalisé : « Ally est prête, Maître Dubois. » */
      lede: 'Voici le profil généré à partir de vos réponses. Vérifiez-le avant d\'ouvrir votre espace pro.' }
  ];

  var AUTONOMY = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(v) { return v < 34 ? AUTONOMY[0] : v < 67 ? AUTONOMY[1] : AUTONOMY[2]; }

  var step = 1;

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
    greeting: document.getElementById('greeting'),
    closures: document.getElementById('closures'),
    orgLabel: document.getElementById('org-label'),
    pvName: document.getElementById('pv-name'),
    pvGreeting: document.getElementById('pv-greeting')
  };

  var IDENTITY_FIELDS = ['firstName', 'lastName', 'org', 'email', 'phone'];

  function profile() { return PROFILES[S.trade]; }

  /* ---- Étape 1 : métier ---- */
  function renderTrades() {
    el.trades.innerHTML = '';
    TRADE_IDS.forEach(function (id) {
      var p = PROFILES[id];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'trade';
      button.setAttribute('aria-pressed', String(id === S.trade));
      button.innerHTML = '<strong></strong><span></span>' +
        (p.secret ? '<em>Secret professionnel renforcé</em>' : '');
      button.querySelector('strong').textContent = p.name;
      button.querySelector('span').textContent = p.desc;
      button.addEventListener('click', function () {
        S.trade = id;
        // Le métier redéfinit les curseurs d'autonomie recommandés.
        S.autonomy = { calls: p.autonomy.calls, emails: p.autonomy.emails, agenda: p.autonomy.agenda };
        renderTrades();
        renderIdentityLabels();
        renderRules();
      });
      el.trades.appendChild(button);
    });
  }

  /* ---- Étape 2 : identité ---- */
  function renderIdentityLabels() {
    var p = profile();
    el.orgLabel.textContent = 'Nom ' + (p.orgLabel === 'Cabinet' ? 'du cabinet'
      : p.orgLabel === 'Entreprise' ? 'de l\'entreprise' : 'de la structure');
    document.getElementById('org').placeholder = p.orgPlaceholder;
    renderPreview();
  }

  function renderPreview() {
    var name = store.displayName();
    el.pvName.textContent = S.identity.lastName ? name : '—';
    el.pvGreeting.textContent = S.identity.org
      ? '« ' + profile().greeting({ org: S.identity.org, name: name }) + ' »'
      : '—';
  }

  /* Écoute une seule fois ; syncIdentity() recharge les valeurs depuis l'état. */
  function bindIdentity() {
    document.querySelectorAll('[data-civility]').forEach(function (button) {
      button.addEventListener('click', function () {
        S.identity.civility = button.getAttribute('data-civility');
        document.querySelectorAll('[data-civility]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        renderPreview();
      });
    });

    IDENTITY_FIELDS.forEach(function (key) {
      document.getElementById(key).addEventListener('input', function (event) {
        S.identity[key] = event.target.value;
        renderPreview();
      });
    });
  }

  function syncIdentity() {
    IDENTITY_FIELDS.forEach(function (key) {
      document.getElementById(key).value = S.identity[key] || '';
    });
    document.querySelectorAll('[data-civility]').forEach(function (button) {
      button.setAttribute('aria-pressed',
        String(button.getAttribute('data-civility') === S.identity.civility));
    });
  }

  /* ---- Étape 3 : horaires ---- */
  function renderHours() {
    el.hours.innerHTML = '';
    S.hours.forEach(function (day) {
      var row = document.createElement('div');
      row.className = 'hours-row' + (day.on ? '' : ' is-off');
      row.innerHTML =
        '<span class="day"></span>' +
        '<input type="time" aria-label="Ouverture ' + day.label + '" value="' + day.from + '">' +
        '<span class="sep">→</span>' +
        '<input type="time" aria-label="Fermeture ' + day.label + '" value="' + day.to + '">';
      row.querySelector('.day').textContent = day.label;

      var times = row.querySelectorAll('input[type="time"]');
      times[0].addEventListener('change', function () { day.from = times[0].value; });
      times[1].addEventListener('change', function () { day.to = times[1].value; });

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

    el.closures.value = S.closures;
    el.closures.addEventListener('input', function () { S.closures = el.closures.value; });
  }

  /* ---- Étape 4 : règles ---- */
  function renderRules() {
    var p = profile();
    el.rules.innerHTML = '';

    RULES.forEach(function (rule) {
      var locked = rule.lockedBySecret && p.secret;
      if (locked) S.rules[rule.id] = true;

      var row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = '<div><strong></strong><span></span>' +
        (locked ? '<span class="rule-locked">Imposé par le profil ' + p.name.toLowerCase() + '</span>' : '') +
        '</div>';
      row.querySelector('strong').textContent = rule.label;
      row.querySelector('span').textContent = rule.hint;

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(S.rules[rule.id]));
      toggle.setAttribute('aria-label', rule.label);
      if (locked) toggle.disabled = true;
      toggle.addEventListener('click', function () {
        S.rules[rule.id] = !S.rules[rule.id];
        toggle.setAttribute('aria-checked', String(S.rules[rule.id]));
      });
      row.appendChild(toggle);
      el.rules.appendChild(row);
    });

    if (p.secret && !S.rules.draft) {
      var note = document.createElement('p');
      note.className = 'lock-note';
      note.textContent = 'Métier à secret professionnel : Ally enverra vos emails sans relecture. '
        + 'Activez la validation ci-dessus si vous préférez relire avant envoi.';
      el.rules.appendChild(note);
    }
  }

  /* ---- Étape 5 : récapitulatif ---- */
  function renderRecap() {
    var p = profile();
    var openDays = S.hours.filter(function (d) { return d.on; });
    var activeRules = Object.keys(S.rules).filter(function (k) { return S.rules[k]; });

    var rows = [
      ['Nom d\'usage', store.displayName()],
      [p.orgLabel, S.identity.org || '—'],
      ['Métier', p.name],
      ['Jours d\'ouverture', openDays.length
        ? openDays.map(function (d) { return d.label.slice(0, 3); }).join(', ') : 'Aucun'],
      ['Fermetures', S.closures || '—'],
      ['Autonomie appels', autonomyLabel(S.autonomy.calls)],
      ['Autonomie emails', autonomyLabel(S.autonomy.emails)],
      ['Autonomie agenda', autonomyLabel(S.autonomy.agenda)],
      ['Règles actives', activeRules.length + ' sur ' + RULES.length],
      ['Transfert des urgences', S.identity.phone || '—']
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

    el.greeting.value = store.greeting();
    el.recapNote.textContent = p.secret
      ? 'Profil à confidentialité renforcée : les emails partent uniquement après votre validation.'
      : 'Vous pouvez relever le niveau d\'autonomie d\'Ally à tout moment depuis l\'onglet Ally.';
  }

  /* ---- Navigation ---- */
  function render() {
    for (var i = 1; i <= 5; i++) document.getElementById('step-' + i).hidden = (i !== step);

    el.progress.querySelectorAll('span').forEach(function (bar, index) {
      bar.classList.toggle('done', index < step);
    });
    el.progress.setAttribute('aria-valuenow', String(step));

    el.stepLabel.textContent = 'Étape ' + step + ' sur 5';
    el.title.textContent = (step === 5)
      ? 'Ally est prête, ' + store.displayName() + '.'
      : STEPS[step - 1].title;
    el.lede.textContent = STEPS[step - 1].lede;
    el.prev.hidden = (step === 1);
    el.next.textContent = (step === 5) ? 'Ouvrir mon espace pro' : 'Continuer';

    if (step === 2) renderIdentityLabels();
    if (step === 5) renderRecap();
  }

  el.next.addEventListener('click', function () {
    // L'étape identité exige au moins un nom et une structure.
    if (step === 2) {
      if (!S.identity.lastName.trim()) { document.getElementById('lastName').focus(); return; }
      if (!S.identity.org.trim()) { document.getElementById('org').focus(); return; }
    }

    if (step === 5) {
      S.greeting = el.greeting.value;
      S.configured = true;
      store.save();
      window.location.href = 'dashboard.html';
      return;
    }

    step += 1;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.prev.addEventListener('click', function () {
    if (step > 1) step -= 1;
    render();
  });

  renderTrades();
  bindIdentity();
  syncIdentity();
  renderHours();
  renderRules();
  render();

  /* Même rôle que côté espace pro : rejouer le questionnaire sur l'état
     courant quand il n'y a pas de rechargement de page. */
  window.ALLY_ONBOARDING_REFRESH = function () {
    step = 1;
    S = store.state;
    renderTrades();
    syncIdentity();
    renderHours();
    renderRules();
    render();
  };
})();
