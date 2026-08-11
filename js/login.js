/* Ally — connexion, vérification d'adresse et récupération de mot de passe.

   L'écran ne sait pas s'il parle à un serveur ou à l'annuaire du navigateur :
   c'est js/gate.js qui tranche. Ici, on ne s'occupe que de ce que voit la
   personne — et notamment de ne jamais laisser un bouton sans réponse. */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  if (!form) return;

  var store = window.ALLY_STORE;
  var accounts = window.ALLY_ACCOUNTS;
  var gate = window.ALLY_GATE;
  var UI = window.ALLY_UI;

  var pending = null;   /* compte en cours de vérification ou de récupération */

  /* ---------- Panneaux ---------- */
  function show(name) {
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = (panel.getAttribute('data-panel') !== name);
    });
    var first = document.querySelector('[data-panel="' + name + '"] input');
    if (first) first.focus();
  }

  document.querySelectorAll('[data-goto-panel]').forEach(function (button) {
    button.addEventListener('click', function () {
      show(button.getAttribute('data-goto-panel'));
    });
  });

  function fail(id, message) {
    var box = document.getElementById(id);
    box.textContent = message;
    box.hidden = !message;
  }

  /* Un bouton qui attend le réseau doit le dire, et ne pas être cliquable deux
     fois : sans ça, deux connexions partent pour un seul clic nerveux. */
  function busy(button, on, label) {
    if (!button) return;
    if (on) {
      button.dataset.idle = button.dataset.idle || button.textContent;
      button.textContent = label || 'Un instant…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.idle || button.textContent;
      button.disabled = false;
    }
  }

  /* ---------- Aiguillage après connexion ---------- */
  function route(user) {
    store.reload();
    if (user.role === 'admin') { window.location.href = 'admin.html'; return; }
    window.location.href = user.onboarded ? 'dashboard.html' : 'onboarding.html';
  }

  /* ---------- Écran de connexion ---------- */
  document.getElementById('demo-admin').textContent =
    accounts.ADMIN.email + ' · ' + accounts.ADMIN.password;

  UI.revealToggle(document.getElementById('login-password'));

  var hint = document.getElementById('login-hint');
  var known = accounts.current();
  if (known) {
    document.getElementById('login-email').value = known.email;
    hint.textContent = 'Session ouverte sur cet appareil : ' + known.firstName + ' '
      + known.lastName + (known.org ? ' — ' + known.org : '') + '.';
    hint.hidden = false;
  }

  /* Quand le serveur répond, les comptes de démonstration n'existent pas chez
     lui : les afficher enverrait droit dans le mur. */
  gate.onReady(function (online) {
    var demo = document.querySelector('.demo-keys');
    if (!demo) return;
    if (!online) return;
    demo.innerHTML =
      '<p class="demo-keys-title">Ligne connectée</p>' +
      '<p class="note">Ce navigateur parle au serveur d\'Ally : les comptes, les '
      + 'mots de passe et les codes y sont vérifiés. Les accès de démonstration '
      + 'du mode hors-ligne ne fonctionnent pas ici.</p>';
  });

  var submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    fail('login-error', '');

    var email = document.getElementById('login-email');
    var password = document.getElementById('login-password');
    if (!email.checkValidity() || !email.value) { email.focus(); return; }
    if (!password.value) { password.focus(); return; }

    busy(submitButton, true, 'Connexion…');

    gate.login(email.value, password.value).then(function (result) {
      busy(submitButton, false);

      if (result.ok) { route(result.user); return; }

      /* Compte créé mais adresse jamais confirmée : on ne renvoie pas une
         erreur, on reprend la vérification là où elle s'était arrêtée. */
      if (result.error === 'unverified') {
        pending = result.user;
        startVerify(result.code);
        return;
      }

      fail('login-error', result.error);
      password.value = '';
      password.focus();
    });
  });

  document.getElementById('go-forgot').addEventListener('click', function () {
    document.getElementById('forgot-email').value = document.getElementById('login-email').value;
    fail('forgot-error', '');
    show('forgot');
  });

  /* ---------- Vérification de l'adresse ---------- */
  var verifyBoxes = UI.codeInput(document.getElementById('verify-boxes'), function () {
    document.getElementById('verify-submit').focus();
  });

  /* Affiche le code quand la maquette le donne ; en production le serveur ne le
     répète pas, et l'écran se contente de dire qu'il est parti par email. */
  function showCode(sentId, codeId, code) {
    document.getElementById(sentId).hidden = !code;
    if (code) document.getElementById(codeId).textContent = code;
  }

  function startVerify(code) {
    document.getElementById('verify-target').textContent = pending.email;
    fail('verify-error', '');
    verifyBoxes.clear();
    show('verify');

    if (code) { showCode('verify-sent', 'verify-code', code); return; }
    gate.resend(pending, 'verify').then(function (result) {
      showCode('verify-sent', 'verify-code', result.code);
    });
  }

  var verifyButton = document.getElementById('verify-submit');
  verifyButton.addEventListener('click', function () {
    if (!pending) { show('login'); return; }
    busy(verifyButton, true, 'Vérification…');

    gate.verify(pending, verifyBoxes.value()).then(function (result) {
      busy(verifyButton, false);
      if (!result.ok) {
        fail('verify-error', result.error);
        verifyBoxes.shake();
        return;
      }
      route(result.user);
    });
  });

  document.getElementById('verify-resend').addEventListener('click', function () {
    if (!pending) return;
    gate.resend(pending, 'verify').then(function (result) {
      showCode('verify-sent', 'verify-code', result.code);
      fail('verify-error', '');
      verifyBoxes.clear();
    });
  });

  /* ---------- Mot de passe oublié ---------- */
  document.getElementById('forgot-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('forgot-email');
    if (!email.checkValidity() || !email.value) { email.focus(); return; }

    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Envoi…');

    gate.forgot(email.value).then(function (result) {
      busy(button, false);
      pending = result.user;

      /* Même écran que l'adresse existe ou non : la page ne doit pas permettre
         de découvrir qui est client. */
      document.getElementById('reset-lede').textContent =
        'Si un compte existe pour ' + email.value + ', un code à 6 chiffres vient d\'y être envoyé.';
      showCode('reset-sent', 'reset-code', result.code);

      fail('reset-error', '');
      resetBoxes.clear();
      document.getElementById('reset-pass').value = '';
      show('reset');
    });
  });

  /* ---------- Nouveau mot de passe ---------- */
  var resetBoxes = UI.codeInput(document.getElementById('reset-boxes'));
  UI.revealToggle(document.getElementById('reset-pass'));
  UI.passwordMeter(document.getElementById('reset-pass'), document.getElementById('reset-meter'));

  var resetButton = document.getElementById('reset-submit');
  resetButton.addEventListener('click', function () {
    var password = document.getElementById('reset-pass');

    if (!pending) {
      fail('reset-error', 'Code incorrect ou expiré. Recommencez la demande.');
      return;
    }
    if (password.value.length < 8) {
      fail('reset-error', 'Le mot de passe doit faire au moins 8 caractères.');
      password.focus();
      return;
    }

    busy(resetButton, true, 'Enregistrement…');
    gate.reset(pending, resetBoxes.value(), password.value).then(function (result) {
      busy(resetButton, false);
      if (!result.ok) {
        fail('reset-error', result.error);
        if (result.error.indexOf('caractères') < 0) resetBoxes.shake();
        return;
      }

      document.getElementById('login-email').value = result.user.email;
      document.getElementById('login-password').value = '';
      hint.textContent = 'Mot de passe modifié. Connectez-vous avec le nouveau.';
      hint.hidden = false;
      fail('login-error', '');
      pending = null;
      show('login');
    });
  });

  document.getElementById('reset-resend').addEventListener('click', function () {
    if (!pending) return;
    gate.resend(pending, 'reset').then(function (result) {
      showCode('reset-sent', 'reset-code', result.code);
      fail('reset-error', '');
      resetBoxes.clear();
    });
  });
})();
