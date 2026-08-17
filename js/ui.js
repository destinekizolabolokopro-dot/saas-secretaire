/* Ally — petits composants partagés par la connexion, l'inscription et la
   console d'administration. Aucun framework : chaque helper prend un élément
   du DOM et lui donne un comportement. */
(function () {
  'use strict';

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Saisie d'un code à 6 chiffres ----------
     Six cases plutôt qu'un champ unique : on voit combien il en reste, le
     collage depuis la boîte mail fonctionne, et la correction est plus simple
     sur mobile. */
  function codeInput(container, onComplete) {
    if (!container) return null;
    container.innerHTML = '';
    container.className = 'code-input';

    var boxes = [];
    for (var i = 0; i < 6; i++) {
      var box = document.createElement('input');
      box.type = 'text';
      box.inputMode = 'numeric';
      box.autocomplete = i === 0 ? 'one-time-code' : 'off';
      box.maxLength = 1;
      box.className = 'code-box';
      box.setAttribute('aria-label', 'Chiffre ' + (i + 1) + ' sur 6');
      container.appendChild(box);
      boxes.push(box);
    }

    function value() {
      return boxes.map(function (b) { return b.value; }).join('');
    }

    function fill(text) {
      var digits = String(text).replace(/\D/g, '').slice(0, 6).split('');
      boxes.forEach(function (box, index) { box.value = digits[index] || ''; });
      var next = Math.min(digits.length, 5);
      boxes[next].focus();
      if (digits.length === 6 && onComplete) onComplete(value());
    }

    boxes.forEach(function (box, index) {
      box.addEventListener('input', function () {
        box.value = box.value.replace(/\D/g, '').slice(0, 1);
        container.classList.remove('is-wrong');
        if (box.value && index < 5) boxes[index + 1].focus();
        if (value().length === 6 && onComplete) onComplete(value());
      });

      box.addEventListener('keydown', function (event) {
        if (event.key === 'Backspace' && !box.value && index > 0) {
          boxes[index - 1].focus();
          boxes[index - 1].value = '';
          event.preventDefault();
        }
        if (event.key === 'ArrowLeft' && index > 0) boxes[index - 1].focus();
        if (event.key === 'ArrowRight' && index < 5) boxes[index + 1].focus();
      });

      box.addEventListener('paste', function (event) {
        event.preventDefault();
        fill((event.clipboardData || window.clipboardData).getData('text'));
      });
    });

    return {
      value: value,
      fill: fill,
      focus: function () { boxes[0].focus(); },
      clear: function () {
        boxes.forEach(function (b) { b.value = ''; });
        boxes[0].focus();
      },
      /* Code refusé : on secoue, puis on vide et on redonne la main sur la
         première case. Les cases gardaient les chiffres refusés, et comme
         chacune n'accepte qu'un caractère, il fallait six retours arrière
         avant de pouvoir retaper. Personne ne fait ça : on abandonne. */
      shake: function () {
        container.classList.add('is-wrong');
        boxes.forEach(function (b) { b.value = ''; });
        boxes[0].focus();
        /* On vide tout de suite, et l'animation se joue sur les cases vides :
           différer le vidage effacerait ce que la personne aurait déjà retapé
           entre-temps. */
        window.setTimeout(function () { container.classList.remove('is-wrong'); }, 500);
      }
    };
  }

  /* ---------- Robustesse du mot de passe ----------
     Indicatif, pas bloquant : la seule règle dure reste les 8 caractères. */
  function scorePassword(text) {
    if (!text) return { score: 0, label: '—' };
    var score = 0;
    if (text.length >= 8) score += 1;
    if (text.length >= 12) score += 1;
    if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
    if (/\d/.test(text)) score += 1;
    if (/[^A-Za-z0-9]/.test(text)) score += 1;
    var labels = ['Trop court', 'Faible', 'Correct', 'Bon', 'Solide', 'Excellent'];
    return { score: score, label: labels[score] };
  }

  function passwordMeter(input, meter) {
    if (!input || !meter) return;
    meter.innerHTML = '<span class="meter-bar"><i></i></span><span class="meter-label">—</span>';
    var fill = meter.querySelector('i');
    var label = meter.querySelector('.meter-label');
    input.addEventListener('input', function () {
      var result = scorePassword(input.value);
      fill.style.width = (result.score / 5 * 100) + '%';
      fill.className = 'lvl-' + result.score;
      label.textContent = result.label;
    });
  }

  /* Bouton « afficher / masquer » posé dans un champ mot de passe. */
  function revealToggle(input) {
    if (!input || input.parentNode.querySelector('.reveal-pass')) return;
    var wrap = input.parentNode;
    wrap.classList.add('field-wrap');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'reveal-pass';
    button.textContent = 'Afficher';
    button.setAttribute('aria-label', 'Afficher le mot de passe');
    button.addEventListener('click', function () {
      var shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      button.textContent = shown ? 'Afficher' : 'Masquer';
      button.setAttribute('aria-label', (shown ? 'Afficher' : 'Masquer') + ' le mot de passe');
    });
    wrap.appendChild(button);
  }

  /* ---------- Choix de la voix d'Ally ----------
     Un seul composant, posé partout où le choix a du sens : pendant le
     questionnaire, dans l'onglet Ally et dans l'onglet Téléphonie. Trois
     copies auraient fini par diverger. Aucun identifiant n'est utilisé — les
     trois écrans coexistent dans le fichier de démonstration autonome. */
  function voicePicker(container, options) {
    if (!container) return null;
    options = options || {};

    var store = window.ALLY_STORE;
    var voice = window.ALLY_VOICE;
    var S = store.state;

    var sample = options.sample || function () {
      return S.identity.org
        ? S.identity.org + ', bonjour. Je suis Ally, l\'assistante. Comment puis-je vous aider ?'
        : store.greeting();
    };

    container.className = 'voice-block';
    container.innerHTML =
      '<div class="voice-picker" data-role="chips"></div>' +
      (options.sliders !== false
        ? '<div class="voice-sliders">' +
            '<div class="slider-block">' +
              '<div class="slider-head"><span>Débit</span>' +
                '<output data-role="out-rate">' + S.voice.rate.toFixed(1) + '×</output></div>' +
              '<input type="range" data-role="rate" aria-label="Débit de la voix"' +
                ' min="0.6" max="1.6" step="0.1" value="' + S.voice.rate + '">' +
            '</div>' +
            '<div class="slider-block">' +
              '<div class="slider-head"><span>Hauteur</span>' +
                '<output data-role="out-pitch">' + S.voice.pitch.toFixed(1) + '</output></div>' +
              '<input type="range" data-role="pitch" aria-label="Hauteur de la voix"' +
                ' min="0.6" max="1.5" step="0.1" value="' + S.voice.pitch + '">' +
            '</div>' +
          '</div>'
        : '') +
      (options.tryButton === false
        ? ''
        : '<div class="voice-try">' +
            '<button type="button" class="btn btn-ghost btn-md" data-role="try">' +
              '<span aria-hidden="true">▶</span> Écouter cette voix</button>' +
            '<button type="button" class="btn btn-ghost btn-md" data-role="stop">Arrêter</button>' +
          '</div>');

    var chips = container.querySelector('[data-role="chips"]');

    function say() {
      store.markStep('heard');
      voice.speak(sample(), store.voiceOptions());
    }

    function renderVoices(list) {
      if (!voice.canSpeak()) {
        chips.innerHTML = '<p class="lock-note">Votre navigateur ne gère pas la synthèse '
          + 'vocale. Le choix de la voix se fera depuis un autre appareil.</p>';
        return;
      }
      if (!list.length) {
        /* Certains navigateurs chargent les voix en différé ; d'autres
           (Linux sans moteur vocal) n'en ont aucune. On le dit franchement
           plutôt que d'afficher une liste vide sans explication. */
        chips.innerHTML = '<p class="note">Recherche des voix installées…</p>';
        window.setTimeout(function () {
          if (!voice.voices().length) {
            chips.innerHTML = '<p class="lock-note">Aucune voix trouvée sur cet appareil. '
              + 'Chrome et Edge, sur Windows ou macOS, en proposent plusieurs en français ; '
              + 'sur Linux, il faut installer un moteur vocal comme espeak-ng. '
              + 'La voix du téléphone, elle, sera choisie côté serveur — celle-ci ne concerne '
              + 'que ce navigateur.</p>';
          }
        }, 1500);
        return;
      }

      var current = voice.resolveVoice(S.voice.uri);
      chips.innerHTML = list.map(function (v) {
        var active = current && v.voiceURI === current.voiceURI;
        return '<button type="button" class="voice-chip" data-voice="' + esc(v.voiceURI) + '"' +
          ' aria-pressed="' + active + '">' +
          '<span class="voice-name">' + esc(v.name.replace(/\s*\(.*\)\s*/, '')) + '</span>' +
          '<span class="voice-lang">' + esc(v.lang) + '</span>' +
          '</button>';
      }).join('');

      chips.querySelectorAll('[data-voice]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          S.voice.uri = chip.getAttribute('data-voice');
          store.save();
          chips.querySelectorAll('[data-voice]').forEach(function (other) {
            other.setAttribute('aria-pressed', String(other === chip));
          });
          /* Retour immédiat : on entend la voix qu'on vient de choisir. */
          say();
          if (options.onChange) options.onChange();
        });
      });
    }

    voice.onVoices(renderVoices);
    renderVoices(voice.voices());

    var rate = container.querySelector('[data-role="rate"]');
    if (rate) {
      rate.addEventListener('input', function () {
        S.voice.rate = Number(rate.value);
        container.querySelector('[data-role="out-rate"]').textContent = S.voice.rate.toFixed(1) + '×';
        store.save();
        if (options.onChange) options.onChange();
      });
    }

    var pitch = container.querySelector('[data-role="pitch"]');
    if (pitch) {
      pitch.addEventListener('input', function () {
        S.voice.pitch = Number(pitch.value);
        container.querySelector('[data-role="out-pitch"]').textContent = S.voice.pitch.toFixed(1);
        store.save();
        if (options.onChange) options.onChange();
      });
    }

    /* Boutons d'essai facultatifs : dans le questionnaire, cliquer une voix la
       fait déjà parler, et l'aperçu juste en dessous a son propre bouton. */
    var tryBtn = container.querySelector('[data-role="try"]');
    if (tryBtn) tryBtn.addEventListener('click', say);
    var stopBtn = container.querySelector('[data-role="stop"]');
    if (stopBtn) stopBtn.addEventListener('click', function () { voice.stopSpeaking(); });

    return { refresh: function () { renderVoices(voice.voices()); } };
  }

  /* ---------- Message éphémère ---------- */
  var toastHost = null;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toast-host';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    var item = document.createElement('div');
    item.className = 'toast' + (kind ? ' toast-' + kind : '');
    item.textContent = message;
    toastHost.appendChild(item);
    window.setTimeout(function () { item.classList.add('is-out'); }, 3200);
    window.setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 3600);
  }

  window.ALLY_UI = {
    esc: esc,
    codeInput: codeInput,
    voicePicker: voicePicker,
    passwordMeter: passwordMeter,
    revealToggle: revealToggle,
    scorePassword: scorePassword,
    toast: toast
  };
})();
