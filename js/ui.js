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
      shake: function () {
        container.classList.add('is-wrong');
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
    passwordMeter: passwordMeter,
    revealToggle: revealToggle,
    scorePassword: scorePassword,
    toast: toast
  };
})();
