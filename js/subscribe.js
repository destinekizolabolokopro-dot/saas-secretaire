/* Ally — choix de formule et création de compte.

   Aucune donnée bancaire n'est demandée : l'essai commence sans carte. Le
   compte, lui, est créé là où il doit l'être — sur le serveur d'Ally quand il
   répond, dans le navigateur sinon. C'est js/gate.js qui choisit ; cet écran
   n'en sait rien. L'onboarding prend ensuite le relais pour la configuration. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var accounts = window.ALLY_ACCOUNTS;
  var gate = window.ALLY_GATE;
  var UI = window.ALLY_UI;
  var PLANS = window.ALLY_PLANS;
  var TRIAL = window.ALLY_TRIAL;

  var state = { step: 1, cycle: 'month', plan: 'cabinet' };
  var created = null;   /* compte créé à l'étape 2, en attente de vérification */

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function chosen() { return window.ALLY_PLAN_BY_ID(state.plan); }

  function priceOf(plan) {
    return state.cycle === 'year' ? plan.priceYear : plan.price;
  }
  function priceLabel(plan) {
    return state.cycle === 'year'
      ? plan.priceYear + ' € / an'
      : plan.price + ' € / mois';
  }

  /* ---------- Étape 1 : les formules ---------- */
  function renderPlans() {
    document.getElementById('plans').innerHTML = PLANS.map(function (plan) {
      var perMonth = state.cycle === 'year' ? Math.round(plan.priceYear / 12) : plan.price;
      return '<article class="plan' + (plan.popular ? ' is-popular' : '') + '">' +
        (plan.popular ? '<span class="plan-flag">Le plus choisi</span>' : '') +
        '<h2>' + esc(plan.name) + '</h2>' +
        '<p class="plan-tagline">' + esc(plan.tagline) + '</p>' +
        '<p class="plan-price"><strong>' + perMonth + ' €</strong><span>/ mois HT</span></p>' +
        (state.cycle === 'year'
          ? '<p class="plan-billed">Facturé ' + plan.priceYear + ' € par an</p>'
          : '<p class="plan-billed">Sans engagement</p>') +
        '<p class="plan-for">' + esc(plan.forWho) + '</p>' +
        '<p class="plan-quota">' + plan.quota.calls + ' appels · ' + plan.quota.emails + ' emails par mois</p>' +
        '<ul class="plan-features">' + plan.features.map(function (f) {
          return '<li>' + esc(f) + '</li>';
        }).join('') + '</ul>' +
        (plan.missing.length
          ? '<ul class="plan-features muted">' + plan.missing.map(function (f) {
              return '<li>' + esc(f) + '</li>';
            }).join('') + '</ul>'
          : '') +
        '<button type="button" class="btn ' + (plan.popular ? 'btn-primary' : 'btn-ghost') +
          '" data-choose="' + plan.id + '">Essayer ' + esc(plan.name) + '</button>' +
        '</article>';
    }).join('');

    document.querySelectorAll('[data-choose]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.plan = button.getAttribute('data-choose');
        state.step = 2;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  document.querySelectorAll('[data-cycle]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.cycle = button.getAttribute('data-cycle');
      document.querySelectorAll('[data-cycle]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      renderPlans();
    });
  });

  /* ---------- Étape 2 : le compte ---------- */
  function trialEnd() {
    var date = new Date();
    date.setDate(date.getDate() + TRIAL.days);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderSummary() {
    var plan = chosen();
    document.getElementById('sum-name').textContent = plan.name;
    document.getElementById('sum-tagline').textContent = plan.tagline;
    document.getElementById('sum-trial').textContent = TRIAL.days + ' jours';
    document.getElementById('sum-cycle').textContent =
      state.cycle === 'year' ? 'Puis chaque année' : 'Puis chaque mois';
    document.getElementById('sum-price').textContent = priceLabel(plan);
    document.getElementById('sub-date').textContent = trialEnd();

    document.getElementById('sum-features').innerHTML =
      plan.features.slice(0, 5).map(function (f) {
        return '<li>' + esc(f) + '</li>';
      }).join('');
  }

  document.getElementById('sub-back').addEventListener('click', function () {
    state.step = 1;
    render();
  });

  function fail(message) {
    var box = document.getElementById('sub-error');
    box.textContent = message;
    box.hidden = !message;
  }

  /* Quatre refus sur sept ne disaient rien : le curseur sautait sur le champ
     fautif et c'était tout. Le geste est juste, il est muet. Même règle que
     partout ailleurs — on marque, on écrit à côté, et la marque s'efface à la
     première frappe. */
  function manque(champ, message) {
    fail(message);
    if (champ) { champ.setAttribute('aria-invalid', 'true'); champ.focus(); }
  }

  ['sub-first', 'sub-last', 'sub-email', 'sub-pass'].forEach(function (id) {
    var champ = document.getElementById(id);
    if (!champ) return;
    champ.addEventListener('input', function () {
      if (champ.getAttribute('aria-invalid') !== 'true') return;
      champ.removeAttribute('aria-invalid');
      fail('');
    });
  });

  UI.revealToggle(document.getElementById('sub-pass'));
  UI.passwordMeter(document.getElementById('sub-pass'), document.getElementById('sub-meter'));

  /* L'avertissement doit rester vrai : quand le serveur répond, le compte est
     bel et bien créé chez lui, et prétendre le contraire serait mensonger. Le
     paiement, lui, n'est toujours pas branché — ça, ça ne change pas. */
  gate.onReady(function (online) {
    var warning = document.querySelector('.demo-warning');
    if (!warning || !online) return;
    warning.textContent = 'Votre compte est créé sur le serveur d\'Ally : mot de passe '
      + 'chiffré, adresse vérifiée par code. Aucun paiement n\'est encaissé et aucune '
      + 'donnée bancaire n\'est demandée pendant l\'essai.';
  });

  /* Un bouton qui attend le réseau doit le dire, et refuser le second clic. */
  function busy(button, on, label) {
    if (on) {
      button.dataset.idle = button.dataset.idle || button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.idle || button.textContent;
      button.disabled = false;
    }
  }

  document.getElementById('sub-submit').addEventListener('click', function () {
    var first = document.getElementById('sub-first');
    var last = document.getElementById('sub-last');
    var email = document.getElementById('sub-email');
    var pass = document.getElementById('sub-pass');
    var cgv = document.getElementById('sub-cgv');

    fail('');
    [first, last, email, pass].forEach(function (c) { c.removeAttribute('aria-invalid'); });

    /* Le prénom n'était pas vérifié du tout : on pouvait créer un compte sans,
       et les initiales de l'avatar devenaient « ?B ». */
    if (!first.value.trim()) {
      manque(first, 'Votre prénom : Ally s\'en sert pour vous appeler par votre nom.');
      return;
    }
    if (!last.value.trim()) {
      manque(last, 'Votre nom : c\'est celui qu\'Ally annonce au téléphone et qui signe vos emails.');
      return;
    }
    if (!email.value.trim()) {
      manque(email, 'Votre adresse professionnelle : elle sert d\'identifiant, et c\'est là qu\'Ally vous écrit.');
      return;
    }
    if (!email.checkValidity()) {
      manque(email, 'Cette adresse n\'a pas la forme attendue — il manque un @ ou le nom du domaine.');
      return;
    }
    if (pass.value.length < 8) {
      manque(pass, 'Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (!cgv.checked) {
      cgv.setAttribute('aria-invalid', 'true');
      cgv.focus();
      fail('Vous devez accepter les conditions générales pour créer le compte.');
      return;
    }
    cgv.removeAttribute('aria-invalid');

    var plan = chosen();
    var button = this;
    busy(button, true, 'Création du compte…');

    gate.signup({
      firstName: first.value, lastName: last.value, email: email.value,
      password: pass.value, planId: plan.id, cycle: state.cycle
    }).then(function (result) {
      busy(button, false);
      if (!result.ok) {
        fail(result.error);
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return;
      }

      created = result.user;
      showCode(result.code);
      state.step = 3;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* ---------- Étape 3 : vérification de l'adresse ---------- */
  var codeBoxes = UI.codeInput(document.getElementById('ver-boxes'), function () {
    document.getElementById('ver-submit').focus();
  });

  function verifyFail(message) {
    var box = document.getElementById('ver-error');
    box.textContent = message;
    box.hidden = !message;
  }

  /* La maquette affiche le code, faute de boîte mail. En production le serveur
     ne le répète pas : le bloc reste alors caché, et l'écran se contente de
     dire que le code est parti. */
  function showCode(code) {
    document.getElementById('ver-target').textContent = created.email;
    document.getElementById('ver-sent').hidden = !code;
    if (code) document.getElementById('ver-code').textContent = code;
    verifyFail('');
    codeBoxes.clear();
  }

  document.getElementById('ver-resend').addEventListener('click', function () {
    if (!created) return;
    gate.resend(created, 'verify').then(function (result) { showCode(result.code); });
  });

  /* Faute de frappe dans l'adresse : on efface le compte à peine créé et on
     revient au formulaire, plutôt que de laisser un compte fantôme dans le
     navigateur. Côté serveur, l'inscription non confirmée reste — c'est voulu :
     une route qui supprime un compte sans preuve d'identité serait une porte
     ouverte pour effacer celui d'un autre. */
  document.getElementById('ver-change').addEventListener('click', function () {
    if (created) { accounts.remove(created.id); created = null; }
    state.step = 2;
    render();
    document.getElementById('sub-email').focus();
  });

  var verifyButton = document.getElementById('ver-submit');
  verifyButton.addEventListener('click', function () {
    if (!created) { state.step = 2; render(); return; }
    busy(verifyButton, true, 'Vérification…');

    gate.verify(created, codeBoxes.value()).then(function (result) {
      busy(verifyButton, false);
      if (!result.ok) { verifyFail(result.error); codeBoxes.shake(); return; }
      finish();
    });
  });

  /* La vérification passée, le compte est ouvert : on installe la formule
     choisie dans l'espace du professionnel, puis le questionnaire prend le
     relais. */
  function finish() {
    store.reload();

    var plan = chosen();
    var S2 = store.state;
    S2.identity.firstName = created.firstName || S2.identity.firstName;
    S2.identity.lastName = created.lastName;
    S2.identity.email = created.email;
    S2.identity.org = '';
    S2.planId = plan.id;
    S2.plan = plan.name;
    S2.configured = false;
    S2.subscription = {
      planId: plan.id, cycle: state.cycle,
      price: priceOf(plan), trialEndsOn: trialEnd(), startedOn: new Date().toISOString()
    };
    store.save();

    // Le questionnaire prend le relais : métier, activité, horaires, règles.
    window.location.href = 'onboarding.html';
  }

  /* ---------- Navigation ---------- */
  var TITLES = ['Choisissez votre formule', 'Créez votre compte', 'Vérifiez votre adresse'];
  var LEDES = [
    'Les 14 premiers jours sont offerts, sans carte bancaire. Vous ne payez qu\'à la '
      + 'fin de l\'essai, et vous changez de formule quand vous voulez.',
    'Il ne reste qu\'à vous identifier. Vous configurerez Ally juste après, '
      + 'en quelques minutes.',
    'Dernière étape avant la configuration : confirmez que cette adresse est bien la vôtre.'
  ];

  function render() {
    for (var i = 1; i <= 3; i++) {
      document.getElementById('sub-step-' + i).hidden = (state.step !== i);
    }
    document.getElementById('sub-step-label').textContent = 'Étape ' + state.step + ' sur 3';
    document.getElementById('sub-title').textContent = TITLES[state.step - 1];
    document.getElementById('sub-lede').textContent = LEDES[state.step - 1];
    if (state.step === 2) renderSummary();
    if (state.step === 3) codeBoxes.focus();
  }

  /* Formule choisie depuis la vitrine : on saute directement à la création du
     compte. Le choix est consommé, pour qu'un retour ultérieur sur la page
     reparte bien de l'étape 1. */
  function adoptPickedPlan() {
    var picked = null;
    try {
      picked = window.sessionStorage.getItem('ally.pickedPlan');
      if (picked) window.sessionStorage.removeItem('ally.pickedPlan');
    } catch (e) {
      picked = window.ALLY_PICKED_PLAN || null;
      window.ALLY_PICKED_PLAN = null;
    }
    if (!picked || !window.ALLY_PLANS.some(function (p) { return p.id === picked; })) return;
    state.plan = picked;
    state.step = 2;
  }

  adoptPickedPlan();
  renderPlans();
  render();

  /* Le fichier de démonstration change d'écran sans recharger la page : la
     formule choisie sur la vitrine doit quand même être reprise. */
  window.ALLY_SUBSCRIBE_REFRESH = function () {
    if (state.step === 3) return;   /* vérification en cours : on ne coupe pas */
    state.step = 1;
    adoptPickedPlan();
    render();
  };
})();
