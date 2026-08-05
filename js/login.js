/* Ally — connexion, vérification d'adresse et récupération de mot de passe.
   Maquette : l'annuaire vit dans le navigateur (voir js/accounts.js) et les
   codes, faute de serveur d'envoi, s'affichent à l'écran. */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  if (!form) return;

  var store = window.ALLY_STORE;
  var accounts = window.ALLY_ACCOUNTS;
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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    fail('login-error', '');

    var email = document.getElementById('login-email');
    var password = document.getElementById('login-password');
    if (!email.checkValidity() || !email.value) { email.focus(); return; }
    if (!password.value) { password.focus(); return; }

    var result = accounts.login(email.value, password.value);

    if (result.ok) { route(result.user); return; }

    /* Compte créé mais adresse jamais confirmée : on ne renvoie pas une erreur,
       on reprend la vérification là où elle s'était arrêtée. */
    if (result.error === 'unverified') {
      pending = result.user;
      startVerify();
      return;
    }

    fail('login-error', result.error);
    password.value = '';
    password.focus();
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

  function startVerify() {
    var code = accounts.issueCode(pending.id, 'verify');
    document.getElementById('verify-target').textContent = pending.email;
    document.getElementById('verify-code').textContent = code;
    document.getElementById('verify-sent').hidden = false;
    fail('verify-error', '');
    verifyBoxes.clear();
    show('verify');
  }

  document.getElementById('verify-submit').addEventListener('click', function () {
    if (!pending) { show('login'); return; }
    var result = accounts.verifyEmail(pending.id, verifyBoxes.value());
    if (!result.ok) {
      fail('verify-error', result.error);
      verifyBoxes.shake();
      return;
    }
    accounts.open(pending.id);
    route(result.user);
  });

  document.getElementById('verify-resend').addEventListener('click', function () {
    if (pending) startVerify();
  });

  /* ---------- Mot de passe oublié ---------- */
  document.getElementById('forgot-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('forgot-email');
    if (!email.checkValidity() || !email.value) { email.focus(); return; }

    var result = accounts.requestReset(email.value);
    pending = result.user;

    /* Même écran que l'adresse existe ou non : la page ne doit pas permettre
       de découvrir qui est client. */
    document.getElementById('reset-lede').textContent =
      'Si un compte existe pour ' + email.value + ', un code à 6 chiffres vient d\'y être envoyé.';
    document.getElementById('reset-sent').hidden = !result.code;
    if (result.code) document.getElementById('reset-code').textContent = result.code;

    fail('reset-error', '');
    resetBoxes.clear();
    document.getElementById('reset-pass').value = '';
    show('reset');
  });

  /* ---------- Nouveau mot de passe ---------- */
  var resetBoxes = UI.codeInput(document.getElementById('reset-boxes'));
  UI.revealToggle(document.getElementById('reset-pass'));
  UI.passwordMeter(document.getElementById('reset-pass'), document.getElementById('reset-meter'));

  document.getElementById('reset-submit').addEventListener('click', function () {
    var password = document.getElementById('reset-pass');

    if (!pending) {
      fail('reset-error', 'Code incorrect ou expiré. Recommencez la demande.');
      return;
    }
    var result = accounts.resetPassword(pending.id, resetBoxes.value(), password.value);
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

  document.getElementById('reset-resend').addEventListener('click', function () {
    if (!pending) return;
    var code = accounts.issueCode(pending.id, 'reset');
    document.getElementById('reset-code').textContent = code;
    document.getElementById('reset-sent').hidden = false;
    fail('reset-error', '');
    resetBoxes.clear();
  });
})();
