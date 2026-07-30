/* Ally — connexion (démonstration : aucune authentification réelle) */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  if (!form) return;

  var store = window.ALLY_STORE;

  // Si un compte a déjà été configuré, on le rappelle et on pré-remplit l'email.
  var hint = document.getElementById('login-hint');
  if (store.state.configured) {
    document.getElementById('login-email').value = store.state.identity.email || '';
    hint.textContent = 'Compte trouvé sur cet appareil : ' + store.displayName()
      + ' — ' + store.state.identity.org + '.';
    hint.hidden = false;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('login-email');
    var password = document.getElementById('login-password');

    if (!email.checkValidity()) { email.focus(); return; }
    if (!password.value) { password.focus(); return; }

    // Un compte déjà configuré va droit à l'espace pro, sinon on passe par
    // le questionnaire pour personnaliser l'expérience.
    if (!store.state.configured && !store.state.identity.email) {
      store.state.identity.email = email.value;
      store.save();
    }
    window.location.href = store.state.configured ? 'dashboard.html' : 'onboarding.html';
  });
})();
