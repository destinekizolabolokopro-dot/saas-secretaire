/* Ally — la démonstration d'un appel, sur la page d'accueil.

   Le produit était décrit et jamais montré. Ce module déroule un échange
   réel : le téléphone sonne, Ally décroche, le motif est reconnu, un créneau
   est vérifié, le rendez-vous est posé, et le brouillon de confirmation
   attend une validation. C'est exactement ce que fait le moteur d'intentions
   — mêmes phrases, même règle de validation.

   Trois choix expliquent la forme du code :

   Tout le texte est dans le HTML dès le départ. L'animation ne fait que le
   dévoiler. Un lecteur d'écran lit donc la conversation d'un bout à l'autre,
   comme la conversation qu'elle est, sans région vive qui l'interromprait
   toutes les deux secondes.

   Rien ne tourne tant que la section n'est pas à l'écran, et tout s'arrête
   dès qu'elle en sort. Une animation qui s'exécute dans un onglet qu'on ne
   regarde pas est du courant consommé pour rien.

   Et qui demande moins d'animation n'en reçoit aucune : l'état final est posé
   d'emblée. La démonstration est le contenu, pas le mouvement. */
(function () {
  'use strict';

  var hote = document.querySelector('[data-demo]');
  if (!hote) return;

  var lignes = Array.prototype.slice.call(hote.querySelectorAll('.demo-line'));
  var cartes = Array.prototype.slice.call(hote.querySelectorAll('.demo-card'));
  var etat = hote.querySelector('[data-demo-state]');
  var horloge = hote.querySelector('[data-demo-clock]');
  var jauge = document.querySelector('[data-demo-progress]');
  var rejouer = document.querySelector('[data-demo-replay]');

  /* Le déroulé, en millisecondes depuis le décrochage. Les durées sont celles
     d'une vraie conversation : on lit plus vite qu'on ne parle, mais un
     échange qui défile plus vite que la parole ne ressemble à rien. */
  var SCENARIO = [
    { at: 0,     phase: 'sonne', etat: 'Appel entrant · vous êtes en rendez-vous' },
    { at: 1400,  phase: 'prise', etat: 'Ally a décroché', pas: 1 },
    { at: 5600,  pas: 2 },
    { at: 9200,  pas: 3 },
    { at: 13200, pas: 4 },
    { at: 15400, pas: 5 },
    { at: 18600, phase: 'fini', etat: 'Appel terminé · 17 secondes', pas: 6 }
  ];
  var FIN = 21000;

  var depart = 0;
  var image = null;
  var enCours = false;

  var doux = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function montrer(pas) {
    lignes.forEach(function (li) {
      if (Number(li.getAttribute('data-step')) <= pas) li.classList.add('is-on');
    });
    cartes.forEach(function (c) {
      if (Number(c.getAttribute('data-step')) <= pas) c.classList.add('is-on');
    });
  }

  function cacher() {
    lignes.concat(cartes).forEach(function (el) { el.classList.remove('is-on'); });
  }

  function chrono(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* L'état final, sans un seul pas de temps. */
  function toutMontrer() {
    montrer(99);
    hote.setAttribute('data-demo-phase', 'fini');
    if (etat) etat.textContent = 'Appel terminé · 17 secondes';
    if (horloge) horloge.textContent = '0:17';
    if (jauge) jauge.style.width = '100%';
  }

  function image_() {
    var t = Date.now() - depart;

    SCENARIO.forEach(function (etape) {
      if (t < etape.at) return;
      if (etape.phase) hote.setAttribute('data-demo-phase', etape.phase);
      if (etape.etat && etat) etat.textContent = etape.etat;
      if (etape.pas) montrer(etape.pas);
    });

    if (horloge) horloge.textContent = chrono(Math.min(t, 18600) - 1400);
    if (jauge) jauge.style.width = Math.min(100, (t / FIN) * 100) + '%';

    if (t >= FIN) { enCours = false; return; }
    image = window.requestAnimationFrame(image_);
  }

  function lancer() {
    if (doux) { toutMontrer(); return; }
    if (image) window.cancelAnimationFrame(image);
    cacher();
    hote.setAttribute('data-demo-phase', 'sonne');
    if (etat) etat.textContent = SCENARIO[0].etat;
    if (horloge) horloge.textContent = '0:00';
    depart = Date.now();
    enCours = true;
    image = window.requestAnimationFrame(image_);
  }

  function stopper() {
    if (image) { window.cancelAnimationFrame(image); image = null; }
    enCours = false;
  }

  if (rejouer) {
    rejouer.addEventListener('click', function () {
      if (doux) { toutMontrer(); return; }
      lancer();
    });
  }

  if (doux || !('IntersectionObserver' in window) || !window.requestAnimationFrame) {
    toutMontrer();
    return;
  }

  /* Une seule lecture automatique, à la première apparition. La relancer à
     chaque passage ferait redémarrer la conversation sous les yeux de
     quelqu'un qui remonte la page pour la relire. */
  var vuUneFois = false;
  var oeil = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (entree) {
      if (entree.isIntersecting) {
        if (!vuUneFois) { vuUneFois = true; lancer(); }
      } else if (enCours) {
        stopper();
      }
    });
  }, { threshold: 0.35 });

  oeil.observe(hote);

  /* Onglet caché : on arrête et on montre l'état final au retour, plutôt que
     de reprendre un chronomètre qui a couru sans personne devant. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && enCours) { stopper(); toutMontrer(); }
  });
})();
