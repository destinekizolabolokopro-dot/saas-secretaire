/* Ally — questionnaire de configuration (8 étapes).
   Le métier génère le profil (vocabulaire, autonomie, script d'accueil),
   l'identité est reprise partout dans l'espace pro, et les réponses ne servent
   pas qu'à remplir un formulaire : elles choisissent la formule recommandée,
   filtrent la base de connaissances, fixent la durée par défaut des
   rendez-vous et définissent ce qu'est une urgence — c'est-à-dire quand le
   téléphone du professionnel sonne réellement. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var S = store.state;
  var PROFILES = window.ALLY_PROFILES;
  var TRADE_IDS = Object.keys(PROFILES);
  var STEP_COUNT = 8;

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
    { title: 'Parlez-nous de votre activité',
      lede: 'Quatre questions pour dimensionner Ally correctement. C\'est ici que se décide la formule dont vous avez réellement besoin.' },
    { title: 'Quelles sont vos disponibilités ?',
      lede: 'Ally s\'y tient strictement : aucun rendez-vous ne sera proposé en dehors de ces créneaux.' },
    { title: 'Que doit-elle savoir répondre ?',
      lede: 'Ce qu\'Ally peut traiter seule, et ce sur quoi elle doit se taire et prendre un message.' },
    { title: 'Qu\'est-ce qu\'une urgence, chez vous ?',
      lede: 'C\'est la question qui décide quand votre téléphone sonne. Sans elle, Ally ne peut que deviner — et une IA qui devine vous dérange trop, ou pas assez.' },
    { title: 'Quelles règles Ally doit-elle suivre ?',
      lede: 'Ce cadre vaut pour les appels comme pour les emails. Modifiable à tout moment.' },
    { title: null, /* personnalisé : « Ally est prête, Maître Dubois. » */
      lede: 'Voici le profil généré à partir de vos réponses. Vérifiez-le avant d\'ouvrir votre espace pro.' }
  ];

  /* ---- Questions sur l'activité ---- */
  var VOLUME = ['Moins de 5', '5 à 15', '15 à 40', 'Plus de 40'];
  var TODAY = ['Moi-même, plus tard', 'Un secrétariat externe', 'Ma messagerie vocale', 'Personne'];
  var PAIN = [
    'Les appels pendant mes rendez-vous',
    'Les questions de tarifs',
    'La prise de rendez-vous',
    'Les relances par email',
    'Le démarchage téléphonique'
  ];
  var TOOLS = ['Google Agenda', 'Outlook / Microsoft 365', 'Doctolib', 'Agenda papier', 'Aucun outil'];
  var DURATIONS = ['15', '30', '45', '60', '90'];
  var CALLBACK = ['Le jour même', 'Sous 24 h', 'Sous 48 h', 'Sans engagement'];
  var FIRSTTIME = ['Oui, sans condition', 'Oui, après qualification', 'Sur recommandation uniquement'];

  var FALLBACK = [
    'Je prends un message',
    'Je propose un rendez-vous',
    'J\'annonce un rappel de votre part'
  ];
  var WINDOW = [
    { value: 'always', label: 'À toute heure' },
    { value: 'open', label: 'Pendant mes horaires' },
    { value: 'day', label: 'Entre 8 h et 20 h' }
  ];

  var AUTONOMY = ['Toujours valider', 'Semi-autonome', 'IA autonome'];
  function autonomyLabel(v) { return v < 34 ? AUTONOMY[0] : v < 67 ? AUTONOMY[1] : AUTONOMY[2]; }

  var step = 1;
  var motifsTouched = false;
  var urgencyTouched = false;

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

  /* ---- Groupe de pastilles, à choix unique ou multiple ---- */
  function chipGroup(container, options, read, write, multi) {
    if (!container) return;
    container.innerHTML = '';
    options.forEach(function (option) {
      var value = typeof option === 'string' ? option : option.value;
      var label = typeof option === 'string' ? option : option.label;

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = label;

      function sync() {
        var current = read();
        var on = multi ? current.indexOf(value) >= 0 : current === value;
        chip.setAttribute('aria-pressed', String(on));
      }

      chip.addEventListener('click', function () {
        if (multi) {
          var list = read().slice();
          var at = list.indexOf(value);
          if (at >= 0) list.splice(at, 1); else list.push(value);
          write(list);
        } else {
          /* Choix unique : recliquer ne désélectionne pas. Une question à
             réponse obligatoire ne doit pas pouvoir repasser à vide par
             inadvertance — c'est ce qui vidait la durée de rendez-vous. */
          write(value);
        }
        container.querySelectorAll('.chip').forEach(function (other) {
          if (other.sync) other.sync();
        });
      });

      chip.sync = sync;
      sync();
      container.appendChild(chip);
    });
  }

  function surveyField(key) {
    return {
      read: function () { return S.survey[key]; },
      write: function (value) { S.survey[key] = value; }
    };
  }

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
        // Le métier redéfinit les curseurs d'autonomie recommandés et la
        // liste des sujets qu'Ally peut traiter.
        S.autonomy = { calls: p.autonomy.calls, emails: p.autonomy.emails, agenda: p.autonomy.agenda };
        motifsTouched = false;
        urgencyTouched = false;
        S.survey.motifs = [];
        S.survey.urgency.motifs = [];
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
    el.pvGreeting.textContent = S.identity.org ? '« ' + store.greeting() + ' »' : '—';
  }

  /* ---- Registre de parole (étape 2) ----
     L'aperçu se met à jour à chaque changement, et le bouton Écouter le dit à
     voix haute : c'est le moment où le professionnel entend sa secrétaire pour
     la première fois, et c'est là que le produit devient crédible. */
  function renderTone() {
    var TONES = store.TONES;
    chipGroup(document.getElementById('q-tone'),
      Object.keys(TONES).map(function (id) { return { value: id, label: TONES[id].label }; }),
      function () { return S.tone; },
      function (value) {
        store.setTone(value);
        document.getElementById('tone-desc').textContent = TONES[value].desc;
        renderPreview();
      }, false);
    document.getElementById('tone-desc').textContent = (TONES[S.tone] || TONES.sobre).desc;
  }

  /* Le choix de la voix, au moment où l'on écrit ce qu'elle dira. Rendu à
     l'entrée de l'étape 2 seulement : la liste des voix du navigateur peut
     arriver en différé, et le composant s'en charge. */
  var voicePickerReady = false;
  function renderVoicePicker() {
    if (voicePickerReady) return;
    voicePickerReady = true;
    window.ALLY_UI.voicePicker(document.getElementById('ob-voice'), {
      sliders: false,
      tryButton: false,
      sample: function () { return store.greeting(); }
    });
  }

  function bindListen(buttonId, noteId, text) {
    var button = document.getElementById(buttonId);
    if (!button) return;
    var note = noteId ? document.getElementById(noteId) : null;

    button.addEventListener('click', function () {
      var voice = window.ALLY_VOICE;
      if (!voice || !voice.canSpeak()) {
        if (note) {
          note.textContent = 'Votre navigateur ne propose pas de synthèse vocale. '
            + 'Le texte reste correct, seule l\'écoute est indisponible.';
          note.hidden = false;
        }
        return;
      }
      if (note) note.hidden = true;
      store.markStep('heard');
      voice.speak(text(), store.voiceOptions());
    });
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

  /* ---- Étape 3 : activité ---- */
  function renderActivity() {
    var volume = surveyField('volume');
    chipGroup(document.getElementById('q-volume'), VOLUME, volume.read, volume.write, false);

    var today = surveyField('today');
    chipGroup(document.getElementById('q-today'), TODAY, today.read, today.write, false);

    var pain = surveyField('pain');
    chipGroup(document.getElementById('q-pain'), PAIN, pain.read, pain.write, true);

    var tools = surveyField('tools');
    chipGroup(document.getElementById('q-tools'), TOOLS, tools.read, tools.write, true);
  }

  /* ---- Étape 4 : horaires ---- */
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

  /* ---- Étape 5 : sujets traités ---- */
  function renderTopics() {
    var p = profile();

    /* Les sujets proposés sont ceux que le métier connaît déjà : ce sont les
       fiches de la base de connaissances. Décocher une fiche la retire. */
    var options = p.faq.map(function (entry) {
      return { value: entry.q, label: entry.q };
    });

    if (!motifsTouched && !S.survey.motifs.length) {
      S.survey.motifs = options.map(function (o) { return o.value; });
    }

    var motifs = surveyField('motifs');
    chipGroup(document.getElementById('q-motifs'), options, motifs.read, function (list) {
      motifsTouched = true;
      motifs.write(list);
    }, true);

    var duration = surveyField('rdvDuration');
    chipGroup(document.getElementById('q-duration'),
      DURATIONS.map(function (d) { return { value: d, label: d + ' min' }; }),
      duration.read, duration.write, false);

    var callback = surveyField('callback');
    chipGroup(document.getElementById('q-callback'), CALLBACK, callback.read, callback.write, false);

    document.getElementById('firsttime-title').textContent =
      'Acceptez-vous de nouveaux ' + p.clientWord + 's ?';
    var firstTime = surveyField('firstTime');
    chipGroup(document.getElementById('q-firsttime'), FIRSTTIME, firstTime.read, firstTime.write, false);

    var notes = document.getElementById('q-notes');
    notes.value = S.survey.notes || '';
    if (!notes.dataset.bound) {
      notes.dataset.bound = '1';
      notes.addEventListener('input', function () { S.survey.notes = notes.value; });
    }
  }

  /* ---- Étape 6 : définition de l'urgence ---- */
  function urgencyField(key) {
    return {
      read: function () { return S.survey.urgency[key]; },
      write: function (value) { S.survey.urgency[key] = value; }
    };
  }

  function renderUrgency() {
    var p = profile();
    var list = p.urgencies || [];

    document.getElementById('urg-title').textContent =
      'Qu\'est-ce qui justifie de vous déranger, ' + store.displayName() + ' ?';

    /* Tout est coché au départ : un professionnel qui passe l'étape sans y
       toucher garde le comportement le plus sûr, celui qui transfère. */
    if (!urgencyTouched && !S.survey.urgency.motifs.length) {
      S.survey.urgency.motifs = list.map(function (u) { return u.label; });
    }

    var motifs = urgencyField('motifs');
    chipGroup(document.getElementById('q-urgency'),
      list.map(function (u) { return { value: u.label, label: u.label }; }),
      motifs.read, function (value) { urgencyTouched = true; motifs.write(value); }, true);

    var fallback = urgencyField('fallback');
    chipGroup(document.getElementById('q-fallback'), FALLBACK, fallback.read, fallback.write, false);

    var win = urgencyField('window');
    chipGroup(document.getElementById('q-window'), WINDOW, win.read, win.write, false);

    var words = document.getElementById('q-urgwords');
    words.value = S.survey.urgency.words || '';
    if (!words.dataset.bound) {
      words.dataset.bound = '1';
      words.addEventListener('input', function () { S.survey.urgency.words = words.value; });
    }
  }

  /* ---- Étape 7 : règles ---- */
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

  /* ---- Formule recommandée ----
     Le volume d'appels décide du plancher ; certains besoins (comprendre une
     demande de tarif, rédiger un email) excluent la formule sans IA. */
  function recommend() {
    var volume = S.survey.volume;
    var plan = 'cabinet';
    var why = [];

    if (volume === 'Moins de 5') { plan = 'permanence'; why.push('moins de 5 appels manqués par semaine'); }
    if (volume === '5 à 15' || volume === '15 à 40') { plan = 'cabinet'; why.push(volume.toLowerCase() + ' appels manqués par semaine'); }
    if (volume === 'Plus de 40') { plan = 'expert'; why.push('plus de 40 appels manqués par semaine'); }

    var needsAI = S.survey.pain.indexOf('Les questions de tarifs') >= 0
      || S.survey.pain.indexOf('Les relances par email') >= 0
      || S.survey.today === 'Un secrétariat externe';

    if (needsAI && plan === 'permanence') {
      plan = 'cabinet';
      why.push('vous attendez d\'elle qu\'elle réponde, pas seulement qu\'elle décroche');
    }
    return { planId: plan, why: why };
  }

  function renderReco() {
    var box = document.getElementById('reco');
    if (!S.survey.volume) { box.hidden = true; return; }

    var reco = recommend();
    var recommended = window.ALLY_PLAN_BY_ID(reco.planId);
    var current = window.ALLY_PLAN_BY_ID(S.planId);
    var actions = document.getElementById('reco-actions');
    box.hidden = false;
    actions.innerHTML = '';

    if (reco.planId === S.planId) {
      document.getElementById('reco-title').textContent =
        'La formule ' + current.name + ' est la bonne.';
      document.getElementById('reco-text').textContent =
        'Vous avez indiqué ' + reco.why.join(' et ') + '. Votre formule couvre ce volume, '
        + 'avec ' + current.quota.calls + ' appels par mois.';
      return;
    }

    var cheaper = recommended.price < current.price;
    document.getElementById('reco-title').textContent =
      cheaper ? 'La formule ' + recommended.name + ' vous suffirait.'
              : 'La formule ' + recommended.name + ' serait plus adaptée.';
    document.getElementById('reco-text').textContent =
      'Vous avez indiqué ' + reco.why.join(', et ') + '. '
      + (cheaper
          ? 'Vous économiseriez ' + (current.price - recommended.price) + ' € par mois. '
            + 'Vous pourrez toujours monter en gamme plus tard.'
          : 'Avec ' + current.name + ', vous atteindriez le plafond de '
            + current.quota.calls + ' appels avant la fin du mois.');

    var swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'btn btn-primary btn-md';
    swap.textContent = 'Passer à ' + recommended.name + ' (' + recommended.price + ' €)';
    swap.addEventListener('click', function () {
      S.planId = recommended.id;
      S.plan = recommended.name;
      if (S.subscription) S.subscription.planId = recommended.id;
      store.save();
      renderReco();
      renderRecap();
    });

    var keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'btn btn-ghost btn-md';
    keep.textContent = 'Garder ' + current.name;
    keep.addEventListener('click', function () { document.getElementById('reco').hidden = true; });

    actions.appendChild(swap);
    actions.appendChild(keep);
  }

  /* ---- Étape 8 : récapitulatif ---- */
  function renderRecap() {
    var p = profile();
    var openDays = S.hours.filter(function (d) { return d.on; });
    var activeRules = Object.keys(S.rules).filter(function (k) { return S.rules[k]; });

    var rows = [
      ['Nom d\'usage', store.displayName()],
      [p.orgLabel, S.identity.org || '—'],
      ['Métier', p.name],
      ['Formule', window.ALLY_PLAN_BY_ID(S.planId).name],
      ['Appels manqués / semaine', S.survey.volume || 'Non renseigné'],
      ['Jours d\'ouverture', openDays.length
        ? openDays.map(function (d) { return d.label.slice(0, 3); }).join(', ') : 'Aucun'],
      ['Fermetures', S.closures || '—'],
      ['Durée d\'un rendez-vous', S.survey.rdvDuration + ' min'],
      ['Délai de rappel annoncé', S.survey.callback || '—'],
      ['Sujets traités par Ally', S.survey.motifs.length + ' sur ' + p.faq.length],
      ['Motifs de transfert', S.survey.urgency.motifs.length
        ? S.survey.urgency.motifs.length + ' sur ' + (p.urgencies || []).length
        : 'Aucun — Ally ne transférera jamais'],
      ['Transfert autorisé', WINDOW.filter(function (w) {
        return w.value === S.survey.urgency.window;
      }).map(function (w) { return w.label; })[0] || '—'],
      ['Si ce n\'est pas urgent', S.survey.urgency.fallback || '—'],
      ['Autonomie appels', autonomyLabel(S.autonomy.calls)],
      ['Autonomie emails', autonomyLabel(S.autonomy.emails)],
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
    /* Le message doit dire ce qui va réellement se passer : la règle « draft »
       est désactivée par défaut, donc annoncer une validation systématique
       serait faux. */
    el.recapNote.textContent = S.rules.draft
      ? 'Aucun email ne partira sans votre validation : Ally prépare, vous envoyez.'
      : 'Ally enverra vos emails sans relecture, sur votre ordre vocal. '
        + 'Vous pouvez exiger une validation à tout moment depuis l\'onglet Ally.';
  }

  /* ---- Application des réponses au compte ----
     Sans ça, le questionnaire ne serait qu'un formulaire : les sujets décochés
     sont retirés de la base de connaissances, et la consigne de l'étape 5
     entre dans le script d'appel. */
  function applySurvey() {
    var data = store.data();
    if (S.survey.motifs.length) {
      data.faq = data.faq.filter(function (entry) {
        return S.survey.motifs.indexOf(entry.q) >= 0;
      });
    }

    if (S.survey.notes && S.survey.notes.trim()) {
      var script = store.script().map(function (line) { return Object.assign({}, line); });
      script.forEach(function (line) {
        if (line.id === 'unknown') {
          line.text = line.text + ' Consigne du cabinet : ' + S.survey.notes.trim();
        }
      });
      S.script = script;
    }
  }

  /* ---- Navigation ---- */
  function render() {
    for (var i = 1; i <= STEP_COUNT; i++) {
      document.getElementById('step-' + i).hidden = (i !== step);
    }

    el.progress.querySelectorAll('span').forEach(function (bar, index) {
      bar.classList.toggle('done', index < step);
    });
    el.progress.setAttribute('aria-valuenow', String(step));

    el.stepLabel.textContent = 'Étape ' + step + ' sur ' + STEP_COUNT;
    el.title.textContent = (step === STEP_COUNT)
      ? 'Ally est prête, ' + store.displayName() + '.'
      : STEPS[step - 1].title;
    el.lede.textContent = STEPS[step - 1].lede;
    el.prev.hidden = (step === 1);
    el.next.textContent = (step === STEP_COUNT) ? 'Ouvrir mon espace pro' : 'Continuer';

    if (step === 2) { renderIdentityLabels(); renderTone(); renderVoicePicker(); }
    if (step === 3) renderActivity();
    if (step === 5) renderTopics();
    if (step === 6) renderUrgency();
    if (step === STEP_COUNT) { renderReco(); renderRecap(); }
  }

  el.next.addEventListener('click', function () {
    // L'étape identité exige au moins un nom et une structure.
    if (step === 2) {
      if (!S.identity.lastName.trim()) { document.getElementById('lastName').focus(); return; }
      if (!S.identity.org.trim()) { document.getElementById('org').focus(); return; }
    }

    if (step === STEP_COUNT) {
      S.greeting = el.greeting.value;
      S.configured = true;
      applySurvey();
      store.save();
      store.syncAccount();

      /* Ligne connectée : le serveur apprend enfin le vrai nom du cabinet et
         son métier. Il ne les connaissait pas — ils ne sont demandés qu'ici,
         après l'inscription. On n'attend pas la réponse pour ouvrir l'espace
         pro : le questionnaire est fini, le reste n'est qu'un rattrapage. */
      if (window.ALLY_GATE) {
        window.ALLY_GATE.publish({ org: S.identity.org, trade: S.trade });
      }
      /* Et toute la configuration qu'on vient de saisir : c'est elle que
         l'associé et le téléphone du professionnel retrouveront. */
      if (window.ALLY_CONFIG_SYNC) window.ALLY_CONFIG_SYNC.push();

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  renderTrades();
  bindIdentity();
  bindListen('pv-listen', 'pv-listen-note', function () { return store.greeting(); });
  bindListen('recap-listen', null, function () {
    return el.greeting.value || store.greeting();
  });
  syncIdentity();
  renderHours();
  renderRules();
  render();

  /* Ligne connectée : on part de la configuration du cabinet, pas d'une page
     blanche. Refaire le questionnaire depuis un second appareil doit montrer
     ce qui est déjà réglé — et surtout, ne pas l'écraser. */
  if (window.ALLY_CONFIG_SYNC) {
    window.ALLY_CONFIG_SYNC.start().then(function (repris) {
      if (repris) {
        S = store.state;
        renderTrades();
        syncIdentity();
        renderHours();
        renderRules();
        render();
      }
    });
  }

  /* Même rôle que côté espace pro : rejouer le questionnaire sur l'état
     courant quand il n'y a pas de rechargement de page. */
  window.ALLY_ONBOARDING_REFRESH = function () {
    step = 1;
    motifsTouched = false;
    urgencyTouched = false;
    S = store.state;
    renderTrades();
    syncIdentity();
    renderHours();
    renderRules();
    render();
  };
})();
