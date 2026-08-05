/* Ally — landing : scroll-reveal, menu mobile, liste d'attente */
(function () {
  'use strict';

  // Scroll-reveal. On se désabonne après le premier passage : le prototype
  // laissait l'observer actif indéfiniment.
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Menu mobile
  var nav = document.getElementById('nav');
  var burger = document.getElementById('burger');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Liste d'attente
  var form = document.getElementById('waitlist-form');
  var done = document.getElementById('waitlist-done');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = document.getElementById('waitlist-email');
      if (!email.value || !email.checkValidity()) {
        email.focus();
        return;
      }
      // L'inscription est conservée : le compteur de la page le reflète.
      var store = window.ALLY_STORE;
      if (store && store.state.waitlist.indexOf(email.value) === -1) {
        store.state.waitlist.push(email.value);
        store.save();
      }
      done.textContent = 'Merci ! Vous êtes sur la liste d\'attente'
        + (store ? ', place n° ' + store.state.waitlist.length : '') + '.';
      form.hidden = true;
      done.hidden = false;
    });
  }
})();

/* Formules affichées sur la vitrine, depuis la même source que l'abonnement. */
(function () {
  'use strict';
  var box = document.getElementById('landing-plans');
  if (!box || !window.ALLY_PLANS) return;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  box.innerHTML = window.ALLY_PLANS.map(function (plan) {
    return '<article class="plan' + (plan.popular ? ' is-popular' : '') + '">' +
      (plan.popular ? '<span class="plan-flag">Le plus choisi</span>' : '') +
      '<h2 style="font-size:21px">' + esc(plan.name) + '</h2>' +
      '<p class="plan-tagline">' + esc(plan.tagline) + '</p>' +
      '<p class="plan-price"><strong>' + plan.price + ' €</strong><span>/ mois HT</span></p>' +
      '<p class="plan-for">' + esc(plan.forWho) + '</p>' +
      '<ul class="plan-features">' + plan.features.slice(0, 5).map(function (f) {
        return '<li>' + esc(f) + '</li>';
      }).join('') + '</ul>' +
      '<a class="btn ' + (plan.popular ? 'btn-primary' : 'btn-ghost') +
        '" href="abonnement.html" data-plan="' + plan.id + '">Essayer ' + esc(plan.name) + '</a>' +
      '</article>';
  }).join('');

  /* Choisir une formule ici doit valoir choix : sans ça, on retombait sur les
     trois cartes et il fallait recliquer sur celle qu'on venait de choisir.
     Le relais passe par sessionStorage, qui survit au changement de page. */
  box.addEventListener('click', function (event) {
    var link = event.target.closest('[data-plan]');
    if (!link) return;
    try { window.sessionStorage.setItem('ally.pickedPlan', link.getAttribute('data-plan')); }
    catch (e) { window.ALLY_PICKED_PLAN = link.getAttribute('data-plan'); }
  });
})();
