/* Ally — onglet Téléphonie : voix, script d'appel, simulation d'appel entrant.
   Exporte des fragments de vue et leurs liaisons, consommés par dashboard.js. */
(function () {
  'use strict';

  /* Estimation assumée du temps gagné : trois minutes par appel pris à votre
     place, quatre par email rédigé. Prudent, et calculé sur ce qui s'est
     réellement passé — non sur un chiffre écrit dans le profil métier. */
  function gagne(usage) {
    var minutes = usage.calls.used * 3 + usage.emails.used * 4;
    if (minutes < 60) return minutes + ' min';
    return Math.floor(minutes / 60) + 'h' + (minutes % 60 < 10 ? '0' : '') + (minutes % 60);
  }

  var store = window.ALLY_STORE;
  var voice = window.ALLY_VOICE;
  var brain = window.ALLY_BRAIN;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Numéro sur lequel Ally décroche. Il est attribué par la plateforme — on ne
     choisit pas son propre numéro entrant — et tant qu'il ne l'est pas, il n'y
     a rien à composer. On affichait jusqu'ici « 09 72 XX XX 00 » : un numéro
     d'exemple dans un code qu'on demande à quelqu'un de composer pour de vrai,
     c'est-à-dire un renvoi vers nulle part. */
  function ligne() {
    var l = store.state.line;
    return l && l.numero ? l : null;
  }

  function allyNumber() {
    var l = ligne();
    return l ? l.numero : null;
  }

  /* 06 12 34 56 78 se lit mieux que 0612345678, et se recopie moins mal. */
  function espace(numero) {
    return String(numero || '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }

  /* Un code GSM dans un lien tel: se compose d'un doigt sur un téléphone —
     c'est là qu'on est quand on pose un renvoi. Le dièse doit être encodé,
     sinon le navigateur le prend pour une ancre et le code part tronqué. */
  function lienTel(code) {
    return 'tel:' + encodeURIComponent(code).replace(/%2A/g, '*');
  }

  /* Les trois renvois conditionnels, dans l'ordre où on les pose. */
  function renvois() {
    var num = allyNumber();
    if (!num) return [];
    return [
      { id: 'sans-reponse', titre: 'Sans réponse après 4 sonneries',
        code: '**61*' + num + '*11*20#',
        note: 'Vous décrochez si vous pouvez. Sinon Ally prend le relais au bout de 20 secondes.',
        repli: '**61*' + num + '#' },
      { id: 'occupe', titre: 'Quand vous êtes déjà en ligne',
        code: '**67*' + num + '#',
        note: 'Le deuxième appelant tombe sur Ally au lieu de la messagerie.' },
      { id: 'injoignable', titre: 'Quand vous êtes injoignable',
        code: '**62*' + num + '#',
        note: 'Tunnel, avion, batterie vide : la ligne répond quand même.' }
    ];
  }

  /* Phrase courte pour essayer une voix, personnalisée au cabinet. */
  function sampleLine() {
    var S = store.state;
    return S.identity.org + ', bonjour. Je suis Ally, l\'assistante. Comment puis-je vous aider ?';
  }

  /* ====================== MISE EN SERVICE ======================

     L'étape qui décide de tout : sans renvoi posé, la ligne ne sonne jamais et
     le professionnel conclut que le produit ne marche pas. Elle a trois états,
     et il faut les distinguer honnêtement.

     1. Aucun numéro attribué — il n'y a rien à composer, et on le dit.
     2. Numéro attribué, aucun appel encore reçu — on donne les codes, et on
        propose l'appel test qui prouvera que ça marche.
     3. Un appel est arrivé — le renvoi fonctionne, la preuve est là. */

  function miseEnService() {
    var l = ligne();
    var recus = store.data().calls.length;

    return '<div class="card">' +
      '<p class="card-title">Mise en service de votre ligne</p>' +
      (l ? avecNumero(l, recus) : sansNumero()) +
    '</div>';
  }

  function sansNumero() {
    return '<p class="note" style="margin-bottom:16px">Vous gardez votre numéro actuel. ' +
        'Ally reçoit vos appels sur un numéro qui lui est propre, attribué à ' +
        'l\'ouverture de la ligne — c\'est vers lui que pointeront les renvois.</p>' +
      '<div class="empty">Aucun numéro n\'est encore attribué à ce cabinet. ' +
        'Les codes de renvoi apparaîtront ici dès qu\'il le sera : sans numéro réel, ' +
        'il n\'y a rien à composer.</div>' +
      '<p class="note serve-foot">La ligne s\'ouvre à la mise en service de ' +
        'l\'abonnement. Vous n\'avez rien à faire d\'ici là — et surtout rien à ' +
        'composer sur votre téléphone.</p>';
  }

  function avecNumero(l, recus) {
    var pose = store.state.steps.forward;

    return '<p class="note" style="margin-bottom:18px">Vous gardez votre numéro actuel. ' +
        'Trois renvois conditionnels suffisent : Ally ne prend l\'appel que si vous ne ' +
        'répondez pas, si vous êtes déjà en ligne, ou si vous êtes injoignable. ' +
        'Vos appels décrochés restent les vôtres, Ally ne les voit pas.</p>' +

      '<div class="recap-row"><span>Numéro d\'Ally pour ce cabinet</span>' +
        '<strong>' + esc(espace(l.numero)) + '</strong></div>' +
      (l.operateur
        ? '<div class="recap-row"><span>Opérateur de la ligne</span><span>' +
          esc(l.operateur) + '</span></div>' : '') +

      '<p class="note" style="margin:16px 0 10px">Sur votre téléphone, touchez le code : ' +
        'il s\'ouvre dans le clavier, il ne reste qu\'à appeler. Sur ordinateur, ' +
        'copiez-le et composez-le depuis votre mobile.</p>' +

      '<div class="steps-list">' +
        renvois().map(function (r, i) {
          return '<div class="serve-step">' +
            '<span class="script-num">0' + (i + 1) + '</span>' +
            '<div class="serve-main">' +
              '<strong>' + esc(r.titre) + '</strong>' +
              '<code class="serve-code">' + esc(r.code) + '</code>' +
              '<span>' + esc(r.note) + '</span>' +
              (r.repli
                ? '<span class="note">Refusé par votre opérateur ? Essayez sans le délai : ' +
                  '<code>' + esc(r.repli) + '</code></span>'
                : '') +
            '</div>' +
            '<div class="serve-actions">' +
              '<a class="btn btn-primary btn-sm" href="' + lienTel(r.code) + '">Composer</a>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-copy="' +
                esc(r.code) + '">Copier</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +

      /* La preuve, et rien d'autre : un code copié ne prouve rien. */
      (recus
        ? '<div class="alert" style="margin:20px 0 0">' +
            '<span class="dot"></span><div><strong>Le renvoi fonctionne</strong>' +
            '<p class="row-meta">Ally a déjà reçu ' + recus + ' appel' +
              (recus > 1 ? 's' : '') + ' sur cette ligne.</p></div></div>'
        : '<div class="live-connect" style="margin-top:20px">' +
            '<p class="note" style="margin-bottom:12px"><strong>Vérifiez en trente secondes :</strong> ' +
              'depuis un autre téléphone, appelez votre numéro habituel et laissez sonner. ' +
              'Ally doit décrocher. L\'appel apparaîtra ici tout seul.</p>' +
            '<div class="voice-try">' +
              '<a class="btn btn-ghost btn-md" href="tel:' +
                esc(String(store.state.identity.phone || '').replace(/\s/g, '')) +
                '">Appeler mon numéro</a>' +
              (pose
                ? '<span class="badge-status badge-ok">Renvoi déclaré posé</span>'
                : '<button type="button" class="btn btn-ghost btn-md" data-forward-done>' +
                  'J\'ai composé les codes</button>') +
            '</div>' +
          '</div>') +

      '<p class="note serve-foot">Pour vérifier l\'état de vos renvois, composez ' +
        '<code>*#61#</code>. Pour tout désactiver, <code>##002#</code> : vos appels ' +
        'reviennent immédiatement sur votre ligne, sans nous prévenir.</p>';
  }

  /* ====================== SIMULATION D'APPEL ====================== */
  /* L'appel se déroule vraiment : chaque réplique d'Ally est prononcée par la
     voix choisie, et ses réponses viennent du même moteur que la commande
     vocale et le chat. */
  var call = { running: false, turns: [], step: 0 };

  /* Les troisièmes répliques ne contiennent volontairement pas le mot
     « urgent » : elles emploient le vocabulaire du métier. C'est ce qui rend
     visible le réglage de l'étape « Qu'est-ce qu'une urgence » — décocher le
     motif correspondant change ce qu'Ally répond ici. */
  var SCENARIOS = {
    avocat: [
      { caller: 'Bonjour, je voudrais prendre rendez-vous pour un litige avec mon employeur.' },
      { caller: 'Quels sont vos tarifs pour une première consultation ?' },
      { caller: 'En fait, j\'ai une audience demain matin, je dois vous parler avant.' }
    ],
    medecin: [
      { caller: 'Bonjour, je souhaite une consultation cette semaine.' },
      { caller: 'Quel est le tarif de la consultation ?' },
      { caller: 'J\'ai une douleur dans la poitrine depuis ce matin.' }
    ],
    artisan: [
      { caller: 'Bonjour, je voudrais un devis pour refaire ma salle de bain.' },
      { caller: 'Vous intervenez dans quel secteur ?' },
      { caller: 'J\'ai une fuite d\'eau qui coule en ce moment sous l\'évier.' }
    ],
    consultant: [
      { caller: 'Bonjour, je cherche un accompagnement sur une réorganisation.' },
      { caller: 'Quel est votre tarif journalier ?' },
      { caller: 'Nous avons un comité lundi et le dossier n\'est pas prêt.' }
    ]
  };

  function scenario() {
    return SCENARIOS[store.state.trade] || SCENARIOS.avocat;
  }

  window.ALLY_TELEPHONY = {

    /* ---------------------------- VUE ---------------------------- */
    view: function () {
      var S = store.state;
      var p = store.profile();
      var D = store.data();
      var usage = store.usage();
      var script = store.script();
      var canListen = voice.canListen();
      var blocked = voice.listenBlockedReason();

      return '<div class="stack limit-900">' +

        /* ---- Statut de la ligne ---- */
        '<div class="line-card">' +
          '<div class="line-head">' +
            '<span class="line-pulse" aria-hidden="true"></span>' +
            '<div>' +
              '<p class="line-title">Ligne active</p>' +
              '<p class="line-sub">Vous d\u00e9crochez d\'abord. Ally prend le relais apr\u00e8s ' +
                '4 sonneries, quand vous \u00eates d\u00e9j\u00e0 en ligne, ou hors de vos horaires. ' +
                'Elle ne rappelle jamais elle-m\u00eame : elle vous pose le message \u00e0 traiter.</p>' +
            '</div>' +
          '</div>' +
          /* Chiffres réels : ils venaient du profil métier et affichaient
             « 27 appels sauvés » à un cabinet qui n'avait jamais reçu d'appel. */
          '<div class="line-stats">' +
            '<div><strong>' + usage.calls.used + '</strong><span>appels traités</span></div>' +
            '<div><strong>' + usage.emails.used + '</strong><span>emails écrits</span></div>' +
            '<div><strong>' + gagne(usage) + '</strong><span>gagnées ce mois-ci</span></div>' +
          '</div>' +
        '</div>' +

        /* ---- Mise en service ---- */
        miseEnService() +

        /* ---- Voix d'Ally ---- */
        (window.ALLY_LIVE ? window.ALLY_LIVE.view() : '') +

        '<div class="card">' +
          '<p class="card-title">La voix d\'Ally</p>' +
          '<p class="note" style="margin-bottom:16px">C\'est la voix que vos ' + esc(p.clientWord) +
            's entendront au téléphone, et celle qui vous répond dans l\'application. ' +
            'Écoutez-les avant de choisir.</p>' +
          '<div data-voice-picker></div>' +
        '</div>' +

      /* ---- Script d'appel ---- */
        '<div class="card">' +
          '<div class="script-head">' +
            '<div>' +
              '<p class="card-title" style="margin-bottom:4px">Votre script d\'appel</p>' +
              '<p class="note">Ce qu\'Ally dit, étape par étape. Modifiez librement : ' +
                'elle suivra exactement vos phrases.</p>' +
            '</div>' +
            '<button type="button" class="btn-link" id="reset-script">Rétablir le script ' + esc(p.name.toLowerCase()) + '</button>' +
          '</div>' +

          '<div class="script-list">' + script.map(function (step, index) {
            return '<div class="script-step">' +
              '<div class="script-step-head">' +
                '<span class="script-num">' + (index < 9 ? '0' : '') + (index + 1) + '</span>' +
                '<div class="script-meta">' +
                  '<label for="script-' + step.id + '">' + esc(step.label) + '</label>' +
                  '<span>' + esc(step.hint) + '</span>' +
                '</div>' +
                '<button type="button" class="btn-play" data-say="' + step.id + '">' +
                  '<span aria-hidden="true">▶</span> Écouter</button>' +
              '</div>' +
              '<textarea class="field script-text" id="script-' + step.id + '" ' +
                'data-script="' + step.id + '" rows="2">' + esc(step.text) + '</textarea>' +
            '</div>';
          }).join('') + '</div>' +
        '</div>' +

        /* ---- Simulation d'appel ---- */
        '<div class="card">' +
          '<div class="script-head">' +
            '<div>' +
              '<p class="card-title" style="margin-bottom:4px">Simuler un appel entrant</p>' +
              '<p class="note">Un ' + esc(p.clientWord) + ' appelle. Ally décroche, applique votre ' +
                'script, répond depuis votre base de connaissances et transfère si c\'est urgent.</p>' +
            '</div>' +
          '</div>' +

          '<div class="call-stage" id="call-stage">' +
            '<div class="call-empty" id="call-empty">' +
              '<span class="call-icon" aria-hidden="true"></span>' +
              '<p>Aucun appel en cours.</p>' +
            '</div>' +
            '<div class="call-log" id="call-log" hidden></div>' +
          '</div>' +

          '<div class="call-actions">' +
            '<button type="button" class="btn btn-primary btn-md" id="start-call">Lancer un appel</button>' +
            '<button type="button" class="btn btn-ghost btn-md" id="next-turn" hidden>Réplique suivante</button>' +
            '<button type="button" class="btn btn-ghost btn-md" id="end-call" hidden>Raccrocher</button>' +
          '</div>' +

          (canListen
            ? '<p class="note" style="margin-top:14px">Vous pouvez aussi répondre au micro depuis ' +
              'le bouton « Parler à Ally ».</p>'
            : '<p class="lock-note" style="margin-top:16px">' + esc(blocked || '') + '</p>') +
        '</div>' +

      '</div>';
    },

    /* ---------------------------- LIAISONS ---------------------------- */
    bind: function (panel, refresh) {
      var S = store.state;

      /* La ligne réelle se rebranche à chaque rendu du panneau. */
      if (window.ALLY_LIVE) window.ALLY_LIVE.bind(panel, refresh);

      /* ---- Sélecteur de voix ---- */
      /* Le choix de la voix vient du composant partagé : il est identique
         ici, dans l'onglet Ally et dans le questionnaire. */
      window.ALLY_UI.voicePicker(panel.querySelector('[data-voice-picker]'), {
        sliders: true,
        sample: sampleLine,
        /* Pas de re-rendu du panneau : on perdrait le curseur en cours de
           glissement. Seul le libellé de la barre latérale est rafraîchi. */
        onChange: function () {
          if (window.ALLY_CHROME_REFRESH) window.ALLY_CHROME_REFRESH();
        }
      });

      /* ---- Codes de renvoi ----
         Copier ne coche plus l'étape : copier un code n'est pas le composer, et
         se féliciter d'un geste qui n'a pas eu lieu est le meilleur moyen de
         laisser quelqu'un croire que sa ligne est branchée alors qu'elle ne
         sonnera jamais. L'étape se coche sur une déclaration explicite, ou
         mieux, sur le premier appel réellement reçu. */
      panel.querySelectorAll('[data-copy]').forEach(function (button) {
        button.addEventListener('click', function () {
          var code = button.getAttribute('data-copy');
          if (navigator.clipboard) navigator.clipboard.writeText(code);
          button.textContent = 'Copié';
          window.setTimeout(function () { button.textContent = 'Copier'; }, 1600);
        });
      });

      var declare = panel.querySelector('[data-forward-done]');
      if (declare) {
        declare.addEventListener('click', function () {
          store.markStep('forward');
          store.log('Renvoi d\'appel déclaré posé',
            'À confirmer par un appel test : c\'est lui qui prouve que la ligne sonne');
          if (refresh) refresh();
        });
      }

      /* ---- Script d'appel ---- */
      panel.querySelectorAll('[data-script]').forEach(function (area) {
        area.addEventListener('input', function () {
          var id = area.getAttribute('data-script');
          var script = store.script().map(function (step) {
            return step.id === id ? Object.assign({}, step, { text: area.value }) : step;
          });
          S.script = script;
          store.save();
        });
      });

      panel.querySelectorAll('[data-say]').forEach(function (button) {
        button.addEventListener('click', function () {
          var id = button.getAttribute('data-say');
          var step = store.script().filter(function (s) { return s.id === id; })[0];
          if (step) voice.speak(step.text, store.voiceOptions());
        });
      });

      var resetBtn = panel.querySelector('#reset-script');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        store.resetScript();
        refresh();
      });

      /* ---- Simulation d'appel ---- */
      var log = panel.querySelector('#call-log');
      var empty = panel.querySelector('#call-empty');
      var startBtn = panel.querySelector('#start-call');
      var nextBtn = panel.querySelector('#next-turn');
      var endBtn = panel.querySelector('#end-call');

      function stepText(id) {
        var step = store.script().filter(function (s) { return s.id === id; })[0];
        return step ? step.text : '';
      }

      function push(who, text, tag) {
        var line = document.createElement('div');
        line.className = 'call-line call-' + who;
        line.innerHTML = '<span class="call-who">' + (who === 'ally' ? 'Ally' : 'Appelant') + '</span>' +
          '<span class="call-text"></span>' +
          (tag ? '<span class="call-tag ' + tag.kind + '">' + esc(tag.label) + '</span>' : '');
        line.querySelector('.call-text').textContent = text;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
        return line;
      }

      function say(text, tag) {
        push('ally', text, tag);
        voice.speak(text, store.voiceOptions());
      }

      function startCall() {
        call.running = true;
        call.step = 0;
        log.innerHTML = '';
        log.hidden = false;
        empty.hidden = true;
        startBtn.hidden = true;
        nextBtn.hidden = false;
        endBtn.hidden = false;
        panel.querySelector('#call-stage').classList.add('is-live');
        say(stepText('greeting'), { kind: 'ok', label: 'Accueil' });
      }

      function nextTurn() {
        var lines = scenario();
        if (call.step >= lines.length) { endCall(); return; }

        var said = lines[call.step].caller;
        call.step += 1;
        push('caller', said);

        // La réponse vient du moteur partagé, pas d'un script figé.
        var answer = window.setTimeout(function () {
          var result = brain.answerCaller(said);
          var tags = {
            transfer: { kind: 'urgent', label: 'Transfert immédiat' },
            booking: { kind: 'ok', label: 'Prise de RDV' },
            answer: { kind: 'ok', label: 'Base de connaissances' },
            note: { kind: 'pending', label: 'Message pris' }
          };

          if (result.kind === 'transfer') {
            say(stepText('urgent'), tags.transfer);
            window.setTimeout(function () {
              push('ally', 'Appel transféré vers ' + (S.identity.phone || 'votre portable') + '.',
                { kind: 'urgent', label: 'Règle « urgences »' });
              endCall(true);
            }, 1200);
            return;
          }

          /* Une prise de message faute d'information est le signal qui fait
             proposer de remplir la fiche du cabinet. */
          if (result.kind === 'note') store.record('call-note');
          say(result.reply, tags[result.kind] || tags.note);
          if (call.step >= lines.length) {
            window.setTimeout(function () {
              say(stepText('closing'), { kind: 'ok', label: 'Clôture' });
              window.setTimeout(function () { endCall(true); }, 600);
            }, 1400);
          }
        }, 500);
        return answer;
      }

      function endCall(keepLog) {
        call.running = false;
        nextBtn.hidden = true;
        endBtn.hidden = true;
        startBtn.hidden = false;
        startBtn.textContent = 'Relancer un appel';
        panel.querySelector('#call-stage').classList.remove('is-live');
        if (!keepLog) {
          voice.stopSpeaking();
          log.hidden = true;
          empty.hidden = false;
        }
      }

      if (startBtn) startBtn.addEventListener('click', startCall);
      if (nextBtn) nextBtn.addEventListener('click', nextTurn);
      if (endBtn) endBtn.addEventListener('click', function () { endCall(false); });
    }
  };
})();
