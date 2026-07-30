/* Ally — choix de formule et création de compte.
   Démonstration : rien n'est envoyé à un serveur et aucune donnée bancaire
   n'est demandée. Le compte créé vit dans le navigateur, puis l'onboarding
   prend le relais pour le personnaliser. */
(function () {
  'use strict';

  var store = window.ALLY_STORE;
  var S = store.state;
  var PLANS = window.ALLY_PLANS;
  var TRIAL = window.ALLY_TRIAL;

  var state = { step: 1, cycle: 'month', plan: 'cabinet' };

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

  document.getElementById('sub-submit').addEventListener('click', function () {
    var first = document.getElementById('sub-first');
    var last = document.getElementById('sub-last');
    var email = document.getElementById('sub-email');
    var pass = document.getElementById('sub-pass');
    var cgv = document.getElementById('sub-cgv');

    if (!last.value.trim()) { last.focus(); return; }
    if (!email.checkValidity() || !email.value) { email.focus(); return; }
    if (pass.value.length < 8) { pass.focus(); pass.setAttribute('aria-invalid', 'true'); return; }
    if (!cgv.checked) { cgv.focus(); return; }

    var plan = chosen();
    S.identity.firstName = first.value.trim() || S.identity.firstName;
    S.identity.lastName = last.value.trim();
    S.identity.email = email.value.trim();
    S.plan = plan.name;
    S.subscription = {
      planId: plan.id, cycle: state.cycle,
      price: priceOf(plan), trialEndsOn: trialEnd(), startedOn: new Date().toISOString()
    };
    store.save();

    // Le questionnaire prend le relais : métier, horaires, règles.
    window.location.href = 'onboarding.html';
  });

  /* ---------- Navigation ---------- */
  function render() {
    document.getElementById('sub-step-1').hidden = (state.step !== 1);
    document.getElementById('sub-step-2').hidden = (state.step !== 2);
    document.getElementById('sub-step-label').textContent = 'Étape ' + state.step + ' sur 2';
    document.getElementById('sub-title').textContent =
      state.step === 1 ? 'Choisissez votre formule' : 'Créez votre compte';
    document.getElementById('sub-lede').textContent = state.step === 1
      ? 'Les 14 premiers jours sont offerts, sans carte bancaire. Vous ne payez qu\'à la '
        + 'fin de l\'essai, et vous changez de formule quand vous voulez.'
      : 'Il ne reste qu\'à vous identifier. Vous configurerez Ally juste après, '
        + 'en quelques minutes.';
    if (state.step === 2) renderSummary();
  }

  renderPlans();
  render();
})();
