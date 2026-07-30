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
      form.hidden = true;
      done.hidden = false;
    });
  }
})();
