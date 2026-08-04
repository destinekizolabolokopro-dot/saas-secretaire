/* Ally — onglet Téléphonie : voix, script d'appel, simulation d'appel entrant.
   Exporte des fragments de vue et leurs liaisons, consommés par dashboard.js. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var voice = window.ALLY_VOICE;
  var brain = window.ALLY_BRAIN;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Phrase courte pour essayer une voix, personnalisée au cabinet. */
  function sampleLine() {
    var S = store.state;
    return S.identity.org + ', bonjour. Je suis Ally, l\'assistante. Comment puis-je vous aider ?';
  }

  /* ====================== SIMULATION D'APPEL ====================== */
  /* L'appel se déroule vraiment : chaque réplique d'Ally est prononcée par la
     voix choisie, et ses réponses viennent du même moteur que la commande
     vocale et le chat. */
  var call = { running: false, turns: [], step: 0 };

  var SCENARIOS = {
    avocat: [
      { caller: 'Bonjour, je voudrais prendre rendez-vous pour un litige avec mon employeur.' },
      { caller: 'Quels sont vos tarifs pour une première consultation ?' },
      { caller: 'En fait c\'est urgent, j\'ai une audience demain matin.' }
    ],
    medecin: [
      { caller: 'Bonjour, je souhaite une consultation cette semaine.' },
      { caller: 'Quel est le tarif de la consultation ?' },
      { caller: 'J\'ai une douleur dans la poitrine depuis ce matin, c\'est urgent.' }
    ],
    artisan: [
      { caller: 'Bonjour, je voudrais un devis pour refaire ma salle de bain.' },
      { caller: 'Vous intervenez dans quel secteur ?' },
      { caller: 'J\'ai une fuite qui coule en ce moment, c\'est urgent.' }
    ],
    consultant: [
      { caller: 'Bonjour, je cherche un accompagnement sur une réorganisation.' },
      { caller: 'Quel est votre tarif journalier ?' },
      { caller: 'C\'est urgent, nous avons un comité lundi.' }
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
              '<p class="line-sub">Ally décroche à votre place en dehors de vos disponibilités, ' +
                'et quand vous êtes déjà en ligne.</p>' +
            '</div>' +
          '</div>' +
          '<div class="line-stats">' +
            '<div><strong>' + store.usage().calls.used + '</strong><span>appels traités</span></div>' +
            '<div><strong>' + p.stats.avoided + '</strong><span>appels sauvés</span></div>' +
            '<div><strong>' + p.stats.saved + '</strong><span>gagnées cette semaine</span></div>' +
          '</div>' +
        '</div>' +

        /* ---- Voix d'Ally ---- */
        '<div class="card">' +
          '<p class="card-title">La voix d\'Ally</p>' +
          '<p class="note" style="margin-bottom:16px">C\'est la voix que vos ' + esc(p.clientWord) +
            's entendront au téléphone, et celle qui vous répond dans l\'application. ' +
            'Écoutez-les avant de choisir.</p>' +
          '<div id="voice-picker" class="voice-picker"></div>' +

          '<div class="voice-sliders">' +
            '<div class="slider-block">' +
              '<div class="slider-head"><label for="voice-rate">Débit</label>' +
                '<output id="out-rate">' + S.voice.rate.toFixed(1) + '×</output></div>' +
              '<input type="range" id="voice-rate" min="0.6" max="1.6" step="0.1" value="' + S.voice.rate + '">' +
            '</div>' +
            '<div class="slider-block">' +
              '<div class="slider-head"><label for="voice-pitch">Hauteur</label>' +
                '<output id="out-pitch">' + S.voice.pitch.toFixed(1) + '</output></div>' +
              '<input type="range" id="voice-pitch" min="0.6" max="1.5" step="0.1" value="' + S.voice.pitch + '">' +
            '</div>' +
          '</div>' +
          '<div class="voice-try">' +
            '<button type="button" class="btn btn-primary btn-md" id="try-voice">Essayer cette voix</button>' +
            '<button type="button" class="btn btn-ghost btn-md" id="stop-voice">Arrêter</button>' +
          '</div>' +
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

      /* ---- Sélecteur de voix ---- */
      var picker = panel.querySelector('#voice-picker');

      function renderVoices(list) {
        if (!picker) return;
        if (!voice.canSpeak()) {
          picker.innerHTML = '<p class="lock-note">Votre navigateur ne gère pas la synthèse vocale.</p>';
          return;
        }
        if (!list.length) {
          // Certains navigateurs chargent les voix en différé ; d'autres
          // (Linux sans moteur vocal, Chrome headless) n'en ont aucune.
          picker.innerHTML = '<p class="note">Recherche des voix installées…</p>';
          window.setTimeout(function () {
            if (!voice.voices().length) {
              picker.innerHTML = '<p class="lock-note">Aucune voix trouvée sur cet appareil. '
                + 'Chrome et Edge sur Windows ou macOS en proposent plusieurs en français ; '
                + 'sur Linux, il faut installer un moteur vocal comme espeak-ng.</p>';
            }
          }, 1500);
          return;
        }
        var current = voice.resolveVoice(S.voice.uri);
        picker.innerHTML = list.map(function (v) {
          var active = current && v.voiceURI === current.voiceURI;
          return '<button type="button" class="voice-chip" data-voice="' + esc(v.voiceURI) + '"' +
            ' aria-pressed="' + active + '">' +
            '<span class="voice-name">' + esc(v.name.replace(/\s*\(.*\)\s*/, '')) + '</span>' +
            '<span class="voice-lang">' + esc(v.lang) + '</span>' +
            '</button>';
        }).join('');

        picker.querySelectorAll('[data-voice]').forEach(function (chip) {
          chip.addEventListener('click', function () {
            S.voice.uri = chip.getAttribute('data-voice');
            store.save();
            picker.querySelectorAll('[data-voice]').forEach(function (other) {
              other.setAttribute('aria-pressed', String(other === chip));
            });
            // Retour immédiat : on entend la voix qu'on vient de choisir.
            voice.speak(sampleLine(), store.voiceOptions());
          });
        });
      }

      voice.onVoices(renderVoices);
      renderVoices(voice.voices());

      var rate = panel.querySelector('#voice-rate');
      if (rate) rate.addEventListener('input', function () {
        S.voice.rate = Number(rate.value);
        panel.querySelector('#out-rate').textContent = S.voice.rate.toFixed(1) + '×';
        store.save();
      });

      var pitch = panel.querySelector('#voice-pitch');
      if (pitch) pitch.addEventListener('input', function () {
        S.voice.pitch = Number(pitch.value);
        panel.querySelector('#out-pitch').textContent = S.voice.pitch.toFixed(1);
        store.save();
      });

      var tryBtn = panel.querySelector('#try-voice');
      if (tryBtn) tryBtn.addEventListener('click', function () {
        voice.speak(sampleLine(), store.voiceOptions());
      });

      var stopBtn = panel.querySelector('#stop-voice');
      if (stopBtn) stopBtn.addEventListener('click', function () { voice.stopSpeaking(); });

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
