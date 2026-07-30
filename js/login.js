/* Ally — connexion (démonstration : aucune authentification réelle) */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('login-email');
    var password = document.getElementById('login-password');

    if (!email.checkValidity()) { email.focus(); return; }
    if (!password.value) { password.focus(); return; }

    // Un profil déjà configuré va au tableau de bord, sinon on passe par
    // l'onboarding. Le drapeau est posé à la fin du questionnaire.
    var configured = false;
    try { configured = window.localStorage.getItem('ally.configured') === '1'; } catch (e) {}
    window.location.href = configured ? 'dashboard.html' : 'onboarding.html';
  });
})();
